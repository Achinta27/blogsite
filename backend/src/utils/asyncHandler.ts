import type { Request, Response, NextFunction, RequestHandler } from 'express';

/** Forwards rejected promises from async route handlers to the central error handler. */
export const asyncHandler =
  (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };
