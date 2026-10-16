import { toSlugBase, generateUniqueSlug } from '../src/utils/slug.js';

describe('Slug generation', () => {
  it('produces URL-friendly slugs', () => {
    expect(toSlugBase('Hello World! How Are You Today?')).toBe('hello-world-how-are-you-today');
    expect(toSlugBase('Special @# Characters & Symbols 123')).toBe('special-characters-and-symbols-123');
  });

  it('falls back when a title has no usable characters', () => {
    expect(toSlugBase('!!!')).toBe('post');
  });

  it('limits slug length', () => {
    expect(toSlugBase('word '.repeat(60)).length).toBeLessThanOrEqual(80);
  });

  it('uses the clean slug when free and a suffix on collision', async () => {
    expect(await generateUniqueSlug('Fresh Title', async () => false)).toBe('fresh-title');

    const taken = new Set(['fresh-title']);
    const slug = await generateUniqueSlug('Fresh Title', async (s) => taken.has(s));
    expect(slug).toMatch(/^fresh-title-[a-f0-9]{6}$/);
  });
});
