import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller.js';
import { validateRequest } from '../middlewares/validation.middleware.js';
import { registerSchema, loginSchema, updateProfileSchema } from '../validations/auth.validation.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { requireTrustedOrigin } from '../middlewares/origin.middleware.js';
import { logActivity } from '../middlewares/activityLogger.js';
import { RateLimiters } from '../middlewares/rateLimiter.js';

export const createAuthRouter = (limiters: RateLimiters): Router => {
  const router = Router();

  router.post(
    '/register',
    limiters.credentials,
    validateRequest(registerSchema),
    logActivity('auth.registered', 'user'),
    AuthController.register
  );
  router.post(
    '/login',
    limiters.credentials,
    validateRequest(loginSchema),
    logActivity('auth.login', 'session'),
    AuthController.login
  );
  router.post('/refresh', limiters.refresh, requireTrustedOrigin, AuthController.refresh);
  router.post('/logout', requireTrustedOrigin, AuthController.logout);

  router.get('/me', authenticate, AuthController.getMe);
  router.patch('/me', authenticate, validateRequest(updateProfileSchema), AuthController.updateMe);

  router.get('/google', limiters.credentials, AuthController.oauthStart('google'));
  router.get('/google/callback', limiters.credentials, AuthController.oauthCallback('google'));
  router.get('/facebook', limiters.credentials, AuthController.oauthStart('facebook'));
  router.get('/facebook/callback', limiters.credentials, AuthController.oauthCallback('facebook'));

  return router;
};
