import { z } from 'zod';
import { idParams } from './common.validation.js';
import { tag } from './post.validation.js';

const name = z.string().trim().min(2, 'Name must be at least 2 characters').max(60);
const description = z.string().trim().max(200);

export const createCategorySchema = z.object({
  body: z.object({ name, description: description.optional() }).strict(),
});

export const updateCategorySchema = z.object({
  params: idParams,
  body: z
    .object({ name: name.optional(), description: description.optional() })
    .strict()
    .refine((b) => Object.keys(b).length > 0, 'Provide at least one field to update'),
});

export const categoryIdSchema = z.object({ params: idParams });

export const tagParamsSchema = z.object({ params: z.object({ tag }) });

export const renameTagSchema = z.object({
  params: z.object({ tag }),
  body: z.object({ name: tag }).strict(),
});
