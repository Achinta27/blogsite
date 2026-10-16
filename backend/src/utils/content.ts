import sanitizeHtml from 'sanitize-html';

/**
 * Allow-list for article HTML produced by the editor. Anything else (scripts, inline
 * styles, event handlers, iframes, images) is stripped before the content is stored.
 */
const ARTICLE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'p', 'br', 'hr', 'h2', 'h3', 'h4', 'strong', 'b', 'em', 'i', 's', 'u',
    'code', 'pre', 'blockquote', 'ul', 'ol', 'li', 'a',
  ],
  // target/rel are always overwritten by the transform below
  allowedAttributes: { a: ['href', 'target', 'rel'] },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowProtocolRelative: false,
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', {
      target: '_blank',
      rel: 'noopener noreferrer nofollow',
    }),
    h1: 'h2',
  },
};

export const sanitizeArticleHtml = (html: string): string => sanitizeHtml(html, ARTICLE_OPTIONS).trim();

export const htmlToText = (html: string): string =>
  sanitizeHtml(html.replace(/<\/(p|h[1-6]|li|blockquote)>/gi, ' '), {
    allowedTags: [],
    allowedAttributes: {},
  })
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

export const readingTimeMinutes = (text: string): number => {
  const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
  return Math.max(1, Math.round(words / 225));
};

export const buildExcerpt = (text: string, maxLength = 220): string => {
  if (text.length <= maxLength) return text;
  const cut = text.slice(0, maxLength);
  return `${cut.slice(0, cut.lastIndexOf(' ') > 0 ? cut.lastIndexOf(' ') : maxLength)}…`;
};

export const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
