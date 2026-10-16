import { Request, Response, NextFunction } from 'express';
import { ENV } from '../config/env.js';
import { AppError } from '../utils/apiError.js';

/**
 * CSRF guard for the endpoints that act on the refresh-token cookie. Browsers always
 * attach an Origin header to cross-origin POSTs, so a request from an untrusted site is
 * rejected here even when COOKIE_SAMESITE=none. Non-browser clients send no Origin.
 */
export const requireTrustedOrigin = (req: Request, _res: Response, next: NextFunction): void => {
  const origin = req.get('origin');
  if (origin && !ENV.CLIENT_ORIGINS.includes(origin.replace(/\/$/, ''))) {
    return next(new AppError('Request origin is not allowed', 403));
  }
  next();
};
