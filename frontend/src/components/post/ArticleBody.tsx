import { useMemo } from 'react';
import DOMPurify from 'dompurify';

// Same allow-list the API enforces (backend/src/utils/content.ts). Sanitising again in the
// browser is defence in depth for any content stored before server-side sanitisation existed.
const ALLOWED_TAGS = ['p', 'br', 'hr', 'h2', 'h3', 'h4', 'strong', 'b', 'em', 'i', 's', 'u', 'code', 'pre', 'blockquote', 'ul', 'ol', 'li', 'a'];
const ALLOWED_ATTR = ['href', 'target', 'rel'];

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer nofollow');
  }
});

const looksLikeHtml = (value: string) => /<\/?[a-z][\s\S]*>/i.test(value);

const sanitize = (html: string) =>
  DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR, ALLOWED_URI_REGEXP: /^(?:https?:|mailto:)/i });

export const ArticleBody = ({ content, className = '' }: { content: string; className?: string }) => {
  const html = useMemo(() => (looksLikeHtml(content) ? sanitize(content) : null), [content]);

  // Plain-text articles (written before the rich-text editor) render as escaped paragraphs
  if (html === null) {
    return (
      <div className={`prose-article ${className}`}>
        {content
          .split(/\n{2,}/)
          .filter((p) => p.trim())
          .map((paragraph, i) => (
            <p key={i} className="whitespace-pre-line">
              {paragraph.trim()}
            </p>
          ))}
      </div>
    );
  }

  return <div className={`prose-article ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
};
