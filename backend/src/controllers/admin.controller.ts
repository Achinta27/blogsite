import { AdminService } from '../services/admin.service.js';
import { PostService } from '../services/post.service.js';
import { auditContext } from '../services/audit.service.js';
import { sendResponse } from '../utils/apiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const AdminController = {
  dashboard: asyncHandler(async (_req, res) => {
    sendResponse({ res, message: 'Dashboard retrieved', data: await AdminService.getDashboard() });
  }),

  listUsers: asyncHandler(async (req, res) => {
    const { users, meta } = await AdminService.listUsers(req.query as any);
    sendResponse({ res, message: 'Users retrieved', data: users, meta });
  }),

  getUser: asyncHandler(async (req, res) => {
    sendResponse({ res, message: 'User retrieved', data: await AdminService.getUser(req.params.id) });
  }),

  createStaff: asyncHandler(async (req, res) => {
    const user = await AdminService.createStaff(req.body, auditContext(req));
    sendResponse({ res, statusCode: 201, message: 'Staff account created', data: user });
  }),

  updateRole: asyncHandler(async (req, res) => {
    const user = await AdminService.updateUserRole(req.params.id, req.body.role, auditContext(req));
    sendResponse({ res, message: 'Role updated', data: user });
  }),

  setPermissions: asyncHandler(async (req, res) => {
    const user = await AdminService.setPermissions(req.params.id, req.body.permissions, auditContext(req));
    sendResponse({ res, message: 'Permissions updated', data: user });
  }),

  updateStatus: asyncHandler(async (req, res) => {
    const user = await AdminService.updateUserStatus(req.params.id, req.body.isActive, auditContext(req));
    sendResponse({ res, message: user?.isActive ? 'Account activated' : 'Account deactivated', data: user });
  }),

  listPosts: asyncHandler(async (req, res) => {
    const { posts, meta } = await AdminService.listPosts(req.query as any);
    sendResponse({ res, message: 'Posts retrieved', data: posts, meta });
  }),

  restorePost: asyncHandler(async (req, res) => {
    const post = await PostService.restorePost(req.params.id, auditContext(req));
    sendResponse({ res, message: 'Post restored', data: post });
  }),

  auditLogs: asyncHandler(async (req, res) => {
    const { logs, meta } = await AdminService.listAuditLogs(req.query as any);
    sendResponse({ res, message: 'Audit log retrieved', data: logs, meta });
  }),
};
