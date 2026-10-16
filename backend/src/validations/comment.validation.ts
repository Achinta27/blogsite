import { z } from 'zod';
import { idParams, objectId, pagination } from './common.validation.js';

const content = z
  .string()
  // Drop control characters (keeping newlines and tabs) before checking length
  .transform((value) => value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim())
  .pipe(z.string().min(1, 'Comment cannot be empty').max(2000, 'Comments are limited to 2000 characters'));

const postParams = z.object({ postId: objectId });

export const listCommentsSchema = z.object({
  params: postParams,
  query: z.object({ ...pagination, limit: pagination.limit.default(20) }),
});

export const createCommentSchema = z.object({
  params: postParams,
  body: z.object({ content }).strict(),
});

export const updateCommentSchema = z.object({
  params: idParams,
  body: z.object({ content }).strict(),
});

export const deleteCommentSchema = z.object({
  params: idParams,
  // Optional note recorded in the audit log when a moderator removes someone else's comment
  body: z.object({ reason: z.string().trim().max(500).optional() }).strict().optional(),
});
