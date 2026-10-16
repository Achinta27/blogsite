import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';

/** Correlation id for logs and audit records. A well-formed incoming X-Request-Id is reused. */
export const requestId = (req: Request, res: Response, next: NextFunction): void => {
  const incoming = req.get('x-request-id');
  req.requestId = incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : crypto.randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  next();
};
