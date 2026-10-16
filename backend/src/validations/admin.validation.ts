import { z } from 'zod';
import { PERMISSIONS, ROLES } from '../config/permissions.js';
import { idParams, objectId, pagination, searchTerm } from './common.validation.js';
import { POST_STATUSES } from '../models/post.model.js';

const permissionList = z
  .array(z.enum(PERMISSIONS))
  .max(PERMISSIONS.length)
  .transform((list) => [...new Set(list)]);

export const listUsersSchema = z.object({
  query: z.object({
    ...pagination,
    search: searchTerm,
    role: z.enum(ROLES).optional(),
    status: z.enum(['active', 'inactive']).optional(),
  }),
});

export const userIdSchema = z.object({ params: idParams });

export const updateRoleSchema = z.object({
  params: idParams,
  body: z.object({ role: z.enum(ROLES) }).strict(),
});

export const updateStatusSchema = z.object({
  params: idParams,
  body: z.object({ isActive: z.boolean() }).strict(),
});

export const setPermissionsSchema = z.object({
  params: idParams,
  body: z.object({ permissions: permissionList }).strict(),
});

export const createStaffSchema = z.object({
  body: z
    .object({
      name: z.string().trim().min(2).max(50),
      email: z.string().trim().toLowerCase().email().max(254),
      // Initial password handed over out of band; long because staff hold extra power
      password: z.string().min(12, 'Use at least 12 characters for staff accounts').max(72),
      permissions: permissionList.default([]),
    })
    .strict(),
});

export const listAdminPostsSchema = z.object({
  query: z.object({
    ...pagination,
    search: searchTerm,
    status: z.enum([...POST_STATUSES, 'deleted']).optional(),
  }),
});

export const restorePostSchema = z.object({ params: idParams });

export const auditLogQuerySchema = z.object({
  query: z
    .object({
      ...pagination,
      limit: pagination.limit.default(25),
      actor: objectId.optional(),
      action: z.string().trim().max(60).regex(/^[a-z_.]+$/).optional(),
      resourceType: z.enum(['user', 'post', 'comment', 'category', 'tag', 'session']).optional(),
      resourceId: z.string().trim().max(80).optional(),
      from: z.coerce.date().optional(),
      to: z.coerce.date().optional(),
    })
    .refine((q) => !q.from || !q.to || q.from <= q.to, 'from must be before to'),
});
