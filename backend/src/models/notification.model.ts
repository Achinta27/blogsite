import { Schema, model, Document, Types } from 'mongoose';

export const NOTIFICATION_TYPES = [
  'post_submitted',
  'post_approved',
  'post_rejected',
  'post_liked',
  'post_commented',
  'staff_permissions_changed',
  'account_status_changed',
  'role_changed',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export interface INotification extends Document {
  recipient: Types.ObjectId;
  actor?: Types.ObjectId | null;
  type: NotificationType;
  message: string;
  resourceType: 'post' | 'comment' | 'user';
  resourceId: Types.ObjectId;
  /** Client route to open, e.g. /post/my-slug */
  link: string;
  isRead: boolean;
  /** Same key for the same recipient never produces a second notification (e.g. like → unlike → like). */
  dedupeKey?: string;
  createdAt: Date;
}

const notificationSchema = new Schema<INotification>(
  {
    recipient: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    actor: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    message: { type: String, required: true, maxlength: 500 },
    resourceType: { type: String, enum: ['post', 'comment', 'user'], required: true },
    resourceId: { type: Schema.Types.ObjectId, required: true },
    link: { type: String, default: '' },
    isRead: { type: Boolean, default: false },
    dedupeKey: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Notification center (newest first) and unread badge
notificationSchema.index({ recipient: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, isRead: 1 });
notificationSchema.index({ recipient: 1, dedupeKey: 1 }, { unique: true, partialFilterExpression: { dedupeKey: { $type: 'string' } } });

export const Notification = model<INotification>('Notification', notificationSchema);
