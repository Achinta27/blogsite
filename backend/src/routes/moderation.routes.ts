import { Router } from 'express';
import { ModerationController } from '../controllers/moderation.controller.js';
import { CommentController } from '../controllers/comment.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { requirePermission } from '../middlewares/rbac.middleware.js';
import { validateRequest } from '../middlewares/validation.middleware.js';
import { queueSchema, reviewIdSchema, rejectSchema, moderationCommentsSchema } from '../validations/moderation.validation.js';

/** Editorial tools for admins and for staff holding the matching permission. */
const router = Router();
router.use(authenticate);

router.get('/posts', requirePermission('posts.review'), validateRequest(queueSchema), ModerationController.queue);
router.get('/posts/:id', requirePermission('posts.review'), validateRequest(reviewIdSchema), ModerationController.review);
router.post('/posts/:id/approve', requirePermission('posts.approve'), validateRequest(reviewIdSchema), ModerationController.approve);
router.post('/posts/:id/reject', requirePermission('posts.reject'), validateRequest(rejectSchema), ModerationController.reject);

router.get(
  '/comments',
  requirePermission('comments.moderate'),
  validateRequest(moderationCommentsSchema),
  CommentController.listForModeration
);

export default router;
