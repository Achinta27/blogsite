import { z } from 'zod';
import { idParams, pagination, searchTerm } from './common.validation.js';

export const queueSchema = z.object({
  query: z.object({ ...pagination, status: z.enum(['pending_review', 'rejected']).default('pending_review') }),
});

export const reviewIdSchema = z.object({ params: idParams });

export const rejectSchema = z.object({
  params: idParams,
  body: z
    .object({
      reason: z
        .string()
        .trim()
        .min(10, 'Explain the decision in at least 10 characters')
        .max(1000),
    })
    .strict(),
});

export const moderationCommentsSchema = z.object({ query: z.object({ ...pagination, search: searchTerm }) });
