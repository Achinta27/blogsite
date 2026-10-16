import { Types } from 'mongoose';
import { Notification, INotification, NotificationType } from '../models/notification.model.js';
import { User } from '../models/user.model.js';
import { AppError } from '../utils/apiError.js';
import { realtime } from '../socket/realtime.js';

export interface NotifyInput {
  recipients: Array<string | Types.ObjectId>;
  actorId?: string | null;
  type: NotificationType;
  message: string;
  resourceType: INotification['resourceType'];
  resourceId: string | Types.ObjectId;
  link?: string;
  /** Stable key; the same key never notifies the same recipient twice. */
  dedupeKey?: string;
}

export class NotificationService {
  /**
   * Persists notifications first, then pushes each saved record to its recipient's private
   * room. A user who is offline (or misses the event) finds it through the REST API later.
   * Users are never notified about their own actions. Failures are logged, never thrown,
   * so a notification problem cannot undo the action that triggered it.
   */
  static async notify(input: NotifyInput): Promise<INotification[]> {
    const recipients = [...new Set(input.recipients.map(String))].filter((id) => id !== String(input.actorId ?? ''));
    const created: INotification[] = [];

    for (const recipient of recipients) {
      try {
        const base = {
          recipient,
          actor: input.actorId || null,
          type: input.type,
          message: input.message.slice(0, 500),
          resourceType: input.resourceType,
          resourceId: input.resourceId,
          link: input.link || '',
        };
        if (input.dedupeKey) {
          const result = await Notification.updateOne(
            { recipient, dedupeKey: input.dedupeKey },
            { $setOnInsert: { ...base, dedupeKey: input.dedupeKey, isRead: false } },
            { upsert: true }
          );
          if (!result.upsertedId) continue; // already notified for this exact action
          created.push((await Notification.findById(result.upsertedId))!);
        } else {
          created.push(await Notification.create(base));
        }
      } catch (error: any) {
        if (error?.code !== 11000) console.error('[Notifications] Failed to notify', recipient, error?.message);
      }
    }

    for (const notification of created) {
      realtime.toUser(String(notification.recipient), 'notification:new', notification.toJSON());
    }
    return created;
  }

  /** Active admins plus active staff who can review submissions. */
  static async moderatorIds(): Promise<string[]> {
    const users = await User.find({
      isActive: true,
      $or: [{ role: 'admin' }, { role: 'staff', permissions: 'posts.review' }],
    })
      .select('_id')
      .lean();
    return users.map((u) => String(u._id));
  }

  static async list(userId: string, { page, limit, unreadOnly }: { page: number; limit: number; unreadOnly?: boolean }) {
    const filter: Record<string, unknown> = { recipient: userId };
    if (unreadOnly) filter.isRead = false;
    const [notifications, total, unread] = await Promise.all([
      Notification.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('actor', 'name avatar')
        .lean(),
      Notification.countDocuments(filter),
      Notification.countDocuments({ recipient: userId, isRead: false }),
    ]);
    const totalPages = Math.ceil(total / limit);
    return {
      notifications,
      meta: { page, limit, total, totalPages, hasNextPage: page < totalPages, hasPrevPage: page > 1, unread },
    };
  }

  static async unreadCount(userId: string): Promise<number> {
    return Notification.countDocuments({ recipient: userId, isRead: false });
  }

  /** Scoped by recipient, so one user can never read or change another user's notifications. */
  static async markRead(userId: string, notificationId: string) {
    const notification = await Notification.findOneAndUpdate(
      { _id: notificationId, recipient: userId },
      { $set: { isRead: true } },
      { new: true }
    ).lean();
    if (!notification) throw new AppError('Notification not found', 404);
    // Keep the user's other tabs and devices in sync
    realtime.toUser(userId, 'notification:read', { ids: [notificationId] });
    return notification;
  }

  static async markAllRead(userId: string): Promise<number> {
    const result = await Notification.updateMany({ recipient: userId, isRead: false }, { $set: { isRead: true } });
    realtime.toUser(userId, 'notification:read', { all: true });
    return result.modifiedCount;
  }
}
