import crypto from 'crypto';
import slugify from 'slugify';

const MAX_BASE_LENGTH = 80;
// Path segments used by other /posts routes
const RESERVED_SLUGS = new Set(['mine', 'saved']);

export const toSlugBase = (title: string): string => {
  const base = slugify(title, { lower: true, strict: true, trim: true })
    .slice(0, MAX_BASE_LENGTH)
    .replace(/-+$/, '');
  return base || 'post';
};

export const withSlugSuffix = (base: string): string =>
  `${base}-${crypto.randomBytes(3).toString('hex')}`;

/**
 * Returns the clean slug when it is free, otherwise the base plus a short random suffix.
 * `isTaken` checks the database; the unique index on `slug` remains the final guard
 * against races, and callers retry on a duplicate-key error.
 */
export const generateUniqueSlug = async (
  title: string,
  isTaken: (slug: string) => Promise<boolean>
): Promise<string> => {
  const base = toSlugBase(title);
  if (!RESERVED_SLUGS.has(base) && !(await isTaken(base))) return base;

  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = withSlugSuffix(base);
    if (!(await isTaken(candidate))) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
};
