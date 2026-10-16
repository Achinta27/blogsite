import { NotificationService } from '../services/notification.service.js';
import { sendResponse } from '../utils/apiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// Every handler is scoped to req.user: there is no way to address another user's notifications.
export const NotificationController = {
  list: asyncHandler(async (req, res) => {
    const { page, limit, unread } = req.query as unknown as { page: number; limit: number; unread: boolean };
    const { notifications, meta } = await NotificationService.list(req.user!.userId, { page, limit, unreadOnly: unread });
    sendResponse({ res, message: 'Notifications retrieved', data: notifications, meta });
  }),

  unreadCount: asyncHandler(async (req, res) => {
    sendResponse({ res, message: 'Unread count', data: { unread: await NotificationService.unreadCount(req.user!.userId) } });
  }),

  markRead: asyncHandler(async (req, res) => {
    const notification = await NotificationService.markRead(req.user!.userId, req.params.id);
    sendResponse({ res, message: 'Marked as read', data: notification });
  }),

  markAllRead: asyncHandler(async (req, res) => {
    const updated = await NotificationService.markAllRead(req.user!.userId);
    sendResponse({ res, message: 'All notifications marked as read', data: { updated } });
  }),
};
