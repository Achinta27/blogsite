import { Request, Response, NextFunction } from 'express';
import { AuditService, auditContext, type AuditEntry } from '../services/audit.service.js';

/**
 * Records simple, non-transactional events (sign-ins, registrations, comment edits) after a
 * successful response. State transitions that need previous/new state are audited inside
 * their services instead, so nothing is logged twice. Never records request bodies.
 * Controllers that authenticate the user themselves (login) set `res.locals.actorId`.
 */
export const logActivity = (action: string, resourceType: AuditEntry['resourceType'], targetParam = 'id') => {
  return (req: Request, res: Response, next: NextFunction): void => {
    res.on('finish', () => {
      if (res.statusCode < 200 || res.statusCode >= 300) return;
      const ctx = auditContext(req);
      if (!ctx.actorId && res.locals.actorId) {
        ctx.actorId = res.locals.actorId;
        ctx.actorRole = res.locals.actorRole ?? '';
      }
      void AuditService.log(ctx, {
        action,
        resourceType,
        resourceId: req.params[targetParam] || res.locals.targetId || ctx.actorId || '',
      });
    });
    next();
  };
};
