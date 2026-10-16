import { Request, Response, NextFunction } from 'express';
import { AppError, codeForStatus } from '../utils/apiError.js';
import { ENV } from '../config/env.js';

export const notFoundHandler = (req: Request, _res: Response, next: NextFunction): void => {
  next(new AppError(`Cannot find ${req.method} ${req.originalUrl}`, 404));
};

export const errorHandler = (
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  let statusCode = 500;
  let message = 'Something went wrong. Please try again later.';
  let code = 'INTERNAL_ERROR';
  let details: unknown[] | undefined;

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
    code = err.code;
    details = err.details;
  } else if (err?.name === 'VersionError') {
    // Optimistic concurrency: the document changed after it was read
    statusCode = 409;
    message = 'This item was changed by someone else. Reload and try again.';
    code = 'CONFLICT';
  } else if (err?.name === 'CastError') {
    statusCode = 400;
    message = `Invalid value for ${err.path}`;
    code = 'BAD_REQUEST';
  } else if (err?.code === 11000) {
    // Never echo the duplicated value back to the client
    statusCode = 409;
    const field = Object.keys(err.keyValue || err.keyPattern || {})[0] || 'field';
    message = `A record with this ${field} already exists`;
    code = 'CONFLICT';
  } else if (err?.name === 'ValidationError') {
    statusCode = 400;
    message = 'Validation error';
    code = 'VALIDATION_ERROR';
    details = Object.values(err.errors || {}).map((el: any) => ({
      field: el.path,
      message: el.message,
    }));
  } else if (err?.type === 'entity.parse.failed') {
    statusCode = 400;
    message = 'Malformed JSON body';
    code = 'BAD_REQUEST';
  } else if (err?.type === 'entity.too.large') {
    statusCode = 413;
    message = 'Request body is too large';
    code = codeForStatus(413);
  }

  if (statusCode >= 500 && ENV.NODE_ENV !== 'test') {
    console.error('[Error]', err);
  }

  res.status(statusCode).json({
    success: false,
    message,
    error: {
      code,
      ...(details ? { details } : {}),
      ...(ENV.NODE_ENV === 'development' && statusCode >= 500 ? { stack: err?.stack } : {}),
    },
  });
};
