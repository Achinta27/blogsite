import type { Request } from 'express';
import type { ClientSession } from 'mongoose';
import { AuditLog, IAuditLog } from '../models/auditLog.model.js';
import { realtime } from '../socket/realtime.js';

/** Who did something, and where the request came from. Always built server-side. */
export interface AuditContext {
  actorId?: string | null;
  actorRole?: string;
  requestId?: string;
  ip?: string;
  userAgent?: string;
}

export const auditContext = (req: Request): AuditContext => ({
  actorId: req.user?.userId ?? null,
  actorRole: req.user?.role ?? '',
  requestId: req.requestId,
  // req.ip honours TRUST_PROXY, so spoofed X-Forwarded-For headers are ignored by default
  ip: req.ip || '',
  userAgent: (req.get('user-agent') || '').slice(0, 300),
});

export interface AuditEntry {
  action: string;
  resourceType: IAuditLog['resourceType'];
  resourceId?: string;
  previousState?: Record<string, unknown> | null;
  newState?: Record<string, unknown> | null;
  reason?: string;
}

export class AuditService {
  /**
   * Appends an immutable audit record. Pass the transaction session when the record must
   * commit or roll back together with the change it describes.
   */
  static async record(ctx: AuditContext, entry: AuditEntry, session?: ClientSession): Promise<IAuditLog> {
    const [log] = await AuditLog.create(
      [
        {
          actor: ctx.actorId || null,
          actorRole: ctx.actorRole || '',
          requestId: ctx.requestId || '',
          ip: ctx.ip || '',
          userAgent: ctx.userAgent || '',
          ...entry,
        },
      ],
      { session }
    );
    return log;
  }

  /** Live feed for the admin dashboard; call after the surrounding transaction commits. */
  static announce(log: IAuditLog) {
    log
      .populate('actor', 'name')
      .then((entry) =>
        realtime.toAdmins('activity:new', {
          _id: entry.id,
          action: entry.action,
          resourceType: entry.resourceType,
          resourceId: entry.resourceId,
          actor: entry.actor ?? null,
          previousState: entry.previousState,
          newState: entry.newState,
          createdAt: entry.createdAt,
        })
      )
      .catch(() => undefined);
  }

  /** Records and announces an action that is not part of a transaction. Never throws. */
  static async log(ctx: AuditContext, entry: AuditEntry): Promise<void> {
    try {
      AuditService.announce(await AuditService.record(ctx, entry));
    } catch (error: any) {
      console.error('[Audit] Failed to record entry:', error?.message);
    }
  }
}
