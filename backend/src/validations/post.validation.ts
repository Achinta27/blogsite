import { z } from 'zod';
import { POST_STATUSES } from '../models/post.model.js';
import { idParams, objectId, pagination, searchTerm } from './common.validation.js';

export const tag = z
  .string()
  .transform((value) => value.trim().toLowerCase().replace(/\s+/g, ' '))
  .pipe(
    z
      .string()
      .min(1)
      .max(30)
      .regex(/^[a-z0-9][a-z0-9 .#+-]*$/, 'Tags may only contain letters, numbers, spaces and . # + -')
  );

// Status, slug, author, review fields and counters are never accepted from the client:
// they change only through the workflow endpoints and server-side logic.
const contentFields = {
  title: z.string().trim().min(3, 'Title must be at least 3 characters').max(200),
  subtitle: z.string().trim().max(300),
  excerpt: z.string().trim().max(400),
  // HTML from the editor; sanitised in the service before it is stored
  content: z.string().max(200_000, 'Article is too long'),
  category: objectId.nullable(),
  tags: z
    .array(tag)
    .max(5, 'Use at most 5 tags')
    .transform((tags) => [...new Set(tags)]),
};

export const createPostSchema = z.object({
  body: z
    .object({
      title: contentFields.title,
      subtitle: contentFields.subtitle.optional(),
      excerpt: contentFields.excerpt.optional(),
      content: contentFields.content.optional(),
      category: contentFields.category.optional(),
      tags: contentFields.tags.optional(),
    })
    .strict(),
});

export const updatePostSchema = z.object({
  params: idParams,
  body: z
    .object({
      title: contentFields.title.optional(),
      subtitle: contentFields.subtitle.optional(),
      excerpt: contentFields.excerpt.optional(),
      content: contentFields.content.optional(),
      category: contentFields.category.optional(),
      tags: contentFields.tags.optional(),
      coverImageAlt: z.string().trim().max(200).optional(),
    })
    .strict()
    .refine((body) => Object.keys(body).length > 0, 'Provide at least one field to update'),
});

export const listPostsSchema = z.object({
  query: z.object({
    ...pagination,
    search: searchTerm,
    category: z.string().trim().toLowerCase().max(80).optional(),
    tag: tag.optional(),
    author: objectId.optional(),
  }),
});

export const suggestSchema = z.object({
  query: z.object({ q: z.string().trim().max(100).default('') }),
});

export const myPostsSchema = z.object({
  query: z.object({ ...pagination, status: z.enum(POST_STATUSES).optional() }),
});

export const slugParamsSchema = z.object({
  params: z.object({ slug: z.string().trim().toLowerCase().min(1).max(120) }),
});

export const postIdSchema = z.object({ params: idParams });

export const coverAltSchema = z.object({
  params: idParams,
  body: z.object({ alt: z.string().trim().max(200).optional() }).passthrough(),
});

export const bookmarksSchema = z.object({ query: z.object({ ...pagination }) });
