import { sanitizeArticleHtml, htmlToText, readingTimeMinutes, buildExcerpt, escapeRegex } from '../src/utils/content.js';
import { detectImageType } from '../src/utils/imageType.js';

describe('Article sanitisation', () => {
  it('keeps editorial formatting', () => {
    const html = '<h2>Title</h2><p><strong>b</strong> <em>i</em></p><ul><li>one</li></ul><blockquote><p>q</p></blockquote>';
    expect(sanitizeArticleHtml(html)).toBe(html);
  });

  it('strips scripts, event handlers, styles and dangerous links', () => {
    const out = sanitizeArticleHtml(
      '<p style="color:red" onmouseover="x()">t</p><script>x()</script><iframe src="//evil"></iframe><a href="data:text/html,x">d</a>'
    );
    expect(out).toBe('<p>t</p><a target="_blank" rel="noopener noreferrer nofollow">d</a>');
  });

  it('downgrades h1 to h2 so the article title stays the only h1', () => {
    expect(sanitizeArticleHtml('<h1>Big</h1>')).toBe('<h2>Big</h2>');
  });
});

describe('Derived text helpers', () => {
  it('extracts plain text and estimates reading time', () => {
    const text = htmlToText('<p>Hello&nbsp;<b>world</b></p><p>again</p>');
    expect(text).toBe('Hello world again');
    expect(readingTimeMinutes('word '.repeat(900))).toBe(4);
    expect(readingTimeMinutes('')).toBe(1);
  });

  it('builds excerpts on word boundaries', () => {
    const excerpt = buildExcerpt('lorem ipsum '.repeat(50), 30);
    expect(excerpt.length).toBeLessThanOrEqual(31);
    expect(excerpt.endsWith('…')).toBe(true);
  });

  it('escapes regular expression input', () => {
    expect(new RegExp(escapeRegex('a.*b')).test('aXXb')).toBe(false);
  });
});

describe('Image signature detection', () => {
  it('recognises JPEG, PNG and WebP by content', () => {
    expect(detectImageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...Array(12).fill(0)]))).toBe('jpeg');
    expect(detectImageType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]))).toBe('png');
    expect(detectImageType(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP')]))).toBe('webp');
  });

  it('rejects anything else', () => {
    expect(detectImageType(Buffer.from('GIF89a......'))).toBeNull();
    expect(detectImageType(Buffer.from('<svg onload=alert(1)>'))).toBeNull();
    expect(detectImageType(Buffer.alloc(3))).toBeNull();
  });
});
