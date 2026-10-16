import { Router } from 'express';
import { NotificationController } from '../controllers/notification.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { validateRequest } from '../middlewares/validation.middleware.js';
import { listNotificationsSchema, notificationIdSchema } from '../validations/notification.validation.js';

const router = Router();
router.use(authenticate);

router.get('/', validateRequest(listNotificationsSchema), NotificationController.list);
router.get('/unread-count', NotificationController.unreadCount);
router.patch('/read-all', NotificationController.markAllRead);
router.patch('/:id/read', validateRequest(notificationIdSchema), NotificationController.markRead);

export default router;
