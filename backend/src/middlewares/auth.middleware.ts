import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/jwt.js';
import { AppError } from '../utils/apiError.js';
import { User } from '../models/user.model.js';
import type { Permission, UserRole } from '../config/permissions.js';

// Passport declares `req.user` as Express.User. Our OAuth callback never lets Passport set
// it, so `req.user` is always the shape attached by the middleware below.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface User {
      userId: string;
      role: UserRole;
      permissions: Permission[];
    }
    interface Request {
      requestId?: string;
    }
  }
}

export type AuthUser = Express.User;
export type AuthenticatedRequest = Request;

const readBearerToken = (req: Request): string | undefined => {
  const header = req.headers.authorization;
  return header?.startsWith('Bearer ') ? header.slice(7) : undefined;
};

/**
 * Resolves the user behind an access token. Role, permissions and status are always read
 * from the database, so a demotion, revoked permission or deactivation takes effect on the
 * very next request rather than when the access token expires. Also used by Socket.IO.
 */
export const resolveAccessToken = async (token: string): Promise<AuthUser & { exp?: number }> => {
  let payload: { userId: string; exp?: number };
  try {
    payload = verifyAccessToken(token) as { userId: string; exp?: number };
  } catch (error: any) {
    if (error?.name === 'TokenExpiredError') {
      throw new AppError('Access token has expired', 401, 'TOKEN_EXPIRED');
    }
    throw new AppError('Invalid access token', 401, 'INVALID_TOKEN');
  }

  const user = await User.findById(payload.userId).select('role permissions isActive').lean();
  if (!user) throw new AppError('The account for this token no longer exists', 401, 'INVALID_TOKEN');
  if (!user.isActive) throw new AppError('This account has been deactivated', 403, 'ACCOUNT_DISABLED');

  return { userId: String(user._id), role: user.role, permissions: user.permissions ?? [], exp: payload.exp };
};

export const authenticate = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
  try {
    const token = readBearerToken(req);
    if (!token) throw new AppError('Authentication required', 401);
    const { exp: _exp, ...user } = await resolveAccessToken(token);
    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
};

/** Attaches `req.user` when a valid token is present; never rejects the request. */
export const optionalAuth = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
  const token = readBearerToken(req);
  if (token) {
    try {
      const { exp: _exp, ...user } = await resolveAccessToken(token);
      req.user = user;
    } catch {
      // Treat an invalid token on a public route as an anonymous request
    }
  }
  next();
};
