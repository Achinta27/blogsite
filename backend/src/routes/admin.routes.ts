import { Router } from 'express';
import { AdminController } from '../controllers/admin.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { authorize, requirePermission } from '../middlewares/rbac.middleware.js';
import { validateRequest } from '../middlewares/validation.middleware.js';
import {
  listUsersSchema,
  userIdSchema,
  updateRoleSchema,
  updateStatusSchema,
  setPermissionsSchema,
  createStaffSchema,
  listAdminPostsSchema,
  restorePostSchema,
  auditLogQuerySchema,
} from '../validations/admin.validation.js';

const router = Router();
router.use(authenticate);

// Audit logs: admins, or staff explicitly granted audit_logs.view
router.get('/audit-logs', requirePermission('audit_logs.view'), validateRequest(auditLogQuerySchema), AdminController.auditLogs);

// Everything else is administrator-only
router.use(authorize('admin'));

router.get('/dashboard', AdminController.dashboard);

router.get('/users', validateRequest(listUsersSchema), AdminController.listUsers);
router.get('/users/:id', validateRequest(userIdSchema), AdminController.getUser);
router.patch('/users/:id/role', validateRequest(updateRoleSchema), AdminController.updateRole);
router.patch('/users/:id/status', validateRequest(updateStatusSchema), AdminController.updateStatus);
router.put('/users/:id/permissions', validateRequest(setPermissionsSchema), AdminController.setPermissions);
router.post('/staff', validateRequest(createStaffSchema), AdminController.createStaff);

router.get('/posts', validateRequest(listAdminPostsSchema), AdminController.listPosts);
router.patch('/posts/:id/restore', validateRequest(restorePostSchema), AdminController.restorePost);

export default router;
