import { Schema, model, Document, Types } from 'mongoose';

export interface IAuditLog extends Document {
  actor?: Types.ObjectId | null;
  actorRole?: string;
  action: string;
  resourceType: 'user' | 'post' | 'comment' | 'category' | 'tag' | 'session';
  resourceId?: string;
  previousState?: Record<string, unknown> | null;
  newState?: Record<string, unknown> | null;
  reason?: string;
  requestId?: string;
  ip?: string;
  userAgent?: string;
  createdAt: Date;
}

const auditLogSchema = new Schema<IAuditLog>(
  {
    actor: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    actorRole: { type: String, default: '' },
    action: { type: String, required: true },
    resourceType: { type: String, required: true },
    resourceId: { type: String, default: '' },
    // Small, explicit snapshots (status, role, permission lists). Never request bodies or secrets.
    previousState: { type: Schema.Types.Mixed, default: null },
    newState: { type: Schema.Types.Mixed, default: null },
    reason: { type: String, default: '' },
    requestId: { type: String, default: '' },
    ip: { type: String, default: '' },
    userAgent: { type: String, default: '', maxlength: 300 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ actor: 1, createdAt: -1 });
auditLogSchema.index({ resourceType: 1, resourceId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });

// Audit history is append-only: block every update and delete issued through Mongoose
const immutable = function (next: (err?: Error) => void) {
  next(new Error('Audit log entries are immutable'));
};
auditLogSchema.pre(
  ['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace', 'deleteOne', 'deleteMany', 'findOneAndDelete'],
  immutable
);
auditLogSchema.pre('save', function (next) {
  if (!this.isNew) return next(new Error('Audit log entries are immutable'));
  next();
});

export const AuditLog = model<IAuditLog>('AuditLog', auditLogSchema);
