import { Link } from 'react-router-dom';
import type { Post } from '../../types';
import { formatDate } from '../../lib/format';
import { CoverImage } from '../common/CoverImage';

export const CategoryKicker = ({ post }: { post: Pick<Post, 'category'> }) =>
  post.category ? (
    <Link to={`/?category=${post.category.slug}`} className="kicker self-start hover:underline">
      {post.category.name}
    </Link>
  ) : null;

export const PostMeta = ({ post, className = '' }: { post: Post; className?: string }) => (
  <p className={`text-[0.8125rem] text-muted ${className}`}>
    <Link to={`/authors/${post.author._id}`} className="font-medium text-ink-soft hover:text-ink">
      {post.author.name}
    </Link>
    <span aria-hidden> · </span>
    <time dateTime={post.publishedAt ?? undefined}>{formatDate(post.publishedAt, 'short')}</time>
    <span aria-hidden> · </span>
    {post.readingTime} min read
    {post.likeCount > 0 && (
      <>
        <span aria-hidden> · </span>
        {post.likeCount} {post.likeCount === 1 ? 'like' : 'likes'}
      </>
    )}
  </p>
);

/** Without a cover the lead story is set as a typographic headline rather than an empty frame. */
export const FeaturedPostCard = ({ post }: { post: Post }) => (
  <article className={post.coverImage ? 'grid gap-6 md:grid-cols-[1.25fr_1fr] md:items-center md:gap-10' : 'max-w-3xl'}>
    {post.coverImage && (
      <Link to={`/post/${post.slug}`} tabIndex={-1} aria-hidden>
        <CoverImage cover={post.coverImage} ratio="aspect-[4/3] md:aspect-[5/4]" eager sizes="(min-width: 768px) 55vw, 100vw" />
      </Link>
    )}
    <div>
      <CategoryKicker post={post} />
      <h2
        className={`mt-3 font-serif font-semibold leading-[1.1] tracking-[-0.015em] ${
          post.coverImage ? 'text-[2rem] sm:text-[2.6rem]' : 'text-[2.3rem] sm:text-[3.4rem]'
        }`}
      >
        <Link to={`/post/${post.slug}`} className="hover:text-accent-deep">
          {post.title}
        </Link>
      </h2>
      {(post.subtitle || post.excerpt) && (
        <p className="mt-4 font-serif text-xl leading-relaxed text-ink-soft">{post.subtitle || post.excerpt}</p>
      )}
      <PostMeta post={post} className="mt-5" />
    </div>
  </article>
);

export const PostCard = ({ post }: { post: Post }) => (
  <article className={`flex flex-col ${post.coverImage ? '' : 'border-t border-ink pt-4'}`}>
    {post.coverImage && (
      <Link to={`/post/${post.slug}`} tabIndex={-1} aria-hidden className="mb-4">
        <CoverImage cover={post.coverImage} sizes="(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 100vw" />
      </Link>
    )}
    <CategoryKicker post={post} />
    <h3 className="mt-2 font-serif text-[1.4rem] font-semibold leading-snug tracking-[-0.01em]">
      <Link to={`/post/${post.slug}`} className="hover:text-accent-deep">
        {post.title}
      </Link>
    </h3>
    {post.excerpt && <p className="mt-2 line-clamp-3 text-[0.9375rem] leading-relaxed text-ink-soft">{post.excerpt}</p>}
    <PostMeta post={post} className="mt-3" />
  </article>
);

/** Text-only row, used for related articles and author pages. */
export const PostRow = ({ post }: { post: Post }) => (
  <article
    className={`grid gap-5 border-t border-rule-soft py-6 ${post.coverImage ? 'grid-cols-[1fr_6.5rem] sm:grid-cols-[1fr_9rem]' : ''}`}
  >
    <div className="min-w-0">
      <CategoryKicker post={post} />
      <h3 className="mt-1.5 font-serif text-xl font-semibold leading-snug">
        <Link to={`/post/${post.slug}`} className="hover:text-accent-deep">
          {post.title}
        </Link>
      </h3>
      {post.excerpt && <p className="mt-1.5 line-clamp-2 text-[0.9375rem] text-ink-soft">{post.excerpt}</p>}
      <PostMeta post={post} className="mt-2" />
    </div>
    {post.coverImage && (
      <Link to={`/post/${post.slug}`} tabIndex={-1} aria-hidden>
        <CoverImage cover={post.coverImage} ratio="aspect-square" />
      </Link>
    )}
  </article>
);
