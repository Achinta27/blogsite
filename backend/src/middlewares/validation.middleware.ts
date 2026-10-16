import { Request, Response, NextFunction } from 'express';
import { AnyZodObject, ZodError } from 'zod';
import { AppError } from '../utils/apiError.js';

/**
 * Validates `{ body, query, params }` against a Zod schema and replaces them with
 * the parsed (coerced, stripped) values so controllers only ever see validated input.
 */
export const validateRequest = (schema: AnyZodObject) => {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = await schema.parseAsync({
        body: req.body ?? {},
        query: req.query,
        params: req.params,
      });
      if (parsed.body !== undefined) req.body = parsed.body;
      if (parsed.query !== undefined) req.query = parsed.query;
      if (parsed.params !== undefined) req.params = parsed.params;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const details = error.errors.map((err) => ({
          field: err.path.join('.').replace(/^(body|query|params)\.?/, ''),
          message: err.message,
        }));
        next(new AppError('Validation error', 400, 'VALIDATION_ERROR', details));
        return;
      }
      next(error);
    }
  };
};
