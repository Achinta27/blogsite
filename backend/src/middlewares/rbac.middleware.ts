import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/apiError.js';
import { hasPermission, type Permission, type UserRole } from '../config/permissions.js';

export const authorize = (...allowedRoles: UserRole[]) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(new AppError('Authentication required', 401));
    if (!allowedRoles.includes(req.user.role)) {
      return next(new AppError('You are not authorized to perform this action', 403));
    }
    next();
  };
};

/** Admins pass; staff pass only with the permission granted; regular users never pass. */
export const requirePermission = (permission: Permission) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(new AppError('Authentication required', 401));
    if (!hasPermission(req.user, permission)) {
      return next(new AppError(`Missing permission: ${permission}`, 403, 'FORBIDDEN'));
    }
    next();
  };
};
