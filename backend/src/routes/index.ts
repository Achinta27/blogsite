import { Router } from 'express';
import { createAuthRouter } from './auth.routes.js';
import postRoutes from './post.routes.js';
import commentRoutes from './comment.routes.js';
import adminRoutes from './admin.routes.js';
import authorRoutes from './author.routes.js';
import moderationRoutes from './moderation.routes.js';
import notificationRoutes from './notification.routes.js';
import { categoryRoutes, tagRoutes } from './taxonomy.routes.js';
import { RateLimiters } from '../middlewares/rateLimiter.js';

export const createV1Router = (limiters: RateLimiters): Router => {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json({ success: true, message: 'OK', data: { timestamp: new Date().toISOString() } });
  });

  router.use('/auth', createAuthRouter(limiters));
  router.use('/posts', postRoutes);
  router.use('/comments', commentRoutes);
  router.use('/categories', categoryRoutes);
  router.use('/tags', tagRoutes);
  router.use('/authors', authorRoutes);
  router.use('/notifications', notificationRoutes);
  router.use('/moderation', moderationRoutes);
  router.use('/admin', adminRoutes);

  return router;
};
