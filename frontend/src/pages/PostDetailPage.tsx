import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Bookmark, Heart } from 'lucide-react';
import { postApi } from '../api';
import { errorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { formatDate } from '../lib/format';
import { useFetch } from '../lib/useFetch';
import { ArticleBody } from '../components/post/ArticleBody';
import { CommentSection } from '../components/post/CommentSection';
import { CategoryKicker, PostRow } from '../components/post/PostCard';
import { Avatar } from '../components/common/Avatar';
import { CoverImage } from '../components/common/CoverImage';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { EmptyState, ErrorState, LoadingState, Notice } from '../components/common/States';
import type { Post } from '../types';

const RelatedArticles = ({ post }: { post: Post }) => {
  const slug = post.category?.slug;
  const { data } = useFetch(() => (slug ? postApi.list({ category: slug, limit: 4 }) : Promise.resolve(null)), [post._id, slug]);
  const related = (data?.data ?? []).filter((p) => p._id !== post._id).slice(0, 3);
  if (related.length === 0) return null;

  return (
    <aside aria-labelledby="related-heading" className="mx-auto mt-20 max-w-[720px]">
      <h2 id="related-heading" className="mb-2 font-serif text-2xl font-semibold">
        More in {post.category!.name}
      </h2>
      {related.map((p) => (
        <PostRow key={p._id} post={p} />
      ))}
    </aside>
  );
};

/** Like and save controls. Signed-out readers are sent to sign in. */
const Engagement = ({ post }: { post: Post }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [liked, setLiked] = useState(post.viewer?.liked ?? false);
  const [likeCount, setLikeCount] = useState(post.likeCount);
  const [saved, setSaved] = useState(post.viewer?.bookmarked ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isAuthor = user?._id === post.author._id;

  const requireUser = () => {
    if (user) return true;
    navigate('/login', { state: { from: location.pathname } });
    return false;
  };

  const toggleLike = async () => {
    if (!requireUser() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = liked ? await postApi.unlike(post._id) : await postApi.like(post._id);
      setLiked(result.liked);
      setLikeCount(result.likeCount);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const toggleSave = async () => {
    if (!requireUser() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = saved ? await postApi.unbookmark(post._id) : await postApi.bookmark(post._id);
      setSaved(result.bookmarked);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-12 flex flex-wrap items-center gap-2 border-y border-rule py-3">
      <button
        type="button"
        className={`btn btn-ghost ${liked ? 'text-accent' : ''}`}
        aria-pressed={liked}
        disabled={isAuthor}
        title={isAuthor ? 'You can’t like your own article' : undefined}
        onClick={toggleLike}
      >
        <Heart aria-hidden className="h-4 w-4" fill={liked ? 'currentColor' : 'none'} />
        {likeCount} {likeCount === 1 ? 'like' : 'likes'}
      </button>
      <button type="button" className={`btn btn-ghost ${saved ? 'text-ink' : ''}`} aria-pressed={saved} onClick={toggleSave}>
        <Bookmark aria-hidden className="h-4 w-4" fill={saved ? 'currentColor' : 'none'} />
        {saved ? 'Saved' : 'Save'}
      </button>
      {error && <p className="ml-auto text-sm text-danger">{error}</p>}
    </div>
  );
};

const StatusBanner = ({ post }: { post: Post }) => {
  const banner = (tone: string, text: React.ReactNode) => (
    <div className={`border-b ${tone}`}>
      <div className="wrap py-2.5 text-center text-sm">{text}</div>
    </div>
  );
  if (post.status === 'draft') return banner('border-rule bg-paper-deep text-ink-soft', 'Draft preview — only you can see this article.');
  if (post.status === 'pending_review') return banner('border-warn/25 bg-warn-wash text-warn', 'In review — an editor will publish it or send feedback.');
  if (post.status === 'rejected')
    return banner('border-danger/25 bg-danger-wash text-danger', <>Changes requested: {post.rejectionReason}</>);
  if (post.status === 'archived') return banner('border-rule bg-paper-deep text-ink-soft', 'Archived — no longer visible to readers.');
  if (post.revision?.status === 'pending_review')
    return banner('border-warn/25 bg-warn-wash text-warn', 'Your latest edits are in review. Readers see the version below until they are approved.');
  if (post.revision?.status === 'rejected')
    return banner('border-danger/25 bg-danger-wash text-danger', <>Your edits were not approved: {post.revision.rejectionReason}</>);
  return null;
};

export const PostDetailPage = () => {
  const { slug = '' } = useParams();
  const navigate = useNavigate();
  const { user, isAdmin, loading: authLoading } = useAuth();
  // Wait for the session check so an author can preview their own draft on reload
  const { data: post, error, status, loading, reload } = useFetch(
    () => (authLoading ? new Promise<never>(() => {}) : postApi.bySlug(slug)),
    [slug, authLoading, user?._id]
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (post) document.title = `${post.title} — Margin`;
  }, [post]);

  if (loading) return <LoadingState label="Loading article…" className="py-32" />;
  if (status === 404) {
    return (
      <EmptyState title="This article isn’t available" className="py-32" action={<Link to="/" className="btn btn-outline">Back to the front page</Link>}>
        It may not be published yet, may have been removed, or the link may be wrong.
      </EmptyState>
    );
  }
  if (error || !post) return <ErrorState message={error ?? 'Article not found'} onRetry={reload} className="py-32" />;

  const isAuthor = user?._id === post.author._id;
  const isPublic = post.status === 'published';

  const remove = async () => {
    try {
      await postApi.remove(post._id);
      navigate(isAuthor ? '/dashboard' : '/', { replace: true });
    } catch (err) {
      setConfirmDelete(false);
      setActionError(errorMessage(err));
    }
  };

  return (
    <article className="pb-6">
      {(isAuthor || isAdmin) && <StatusBanner post={post} />}

      <header className="wrap pt-12 sm:pt-16">
        <div className="mx-auto max-w-[760px] text-center">
          <div className="flex justify-center">
            <CategoryKicker post={post} />
          </div>
          <h1 className="mt-4 font-serif text-[2.4rem] font-semibold leading-[1.08] tracking-[-0.02em] text-balance sm:text-[3.4rem]">
            {post.title}
          </h1>
          {post.subtitle && (
            <p className="mt-5 font-serif text-xl leading-relaxed text-ink-soft text-pretty sm:text-2xl">{post.subtitle}</p>
          )}

          <div className="mt-8 flex items-center justify-center gap-3 text-left">
            <Avatar name={post.author.name} src={post.author.avatar} />
            <div className="text-sm">
              <Link to={`/authors/${post.author._id}`} className="font-medium text-ink hover:underline">
                {post.author.name}
              </Link>
              <p className="text-muted">
                {post.publishedAt ? <time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time> : 'Not yet published'}
                <span aria-hidden> · </span>
                {post.readingTime} min read
              </p>
            </div>
          </div>

          {(isAuthor || isAdmin) && (
            <div className="mt-6 flex justify-center gap-2">
              {isAuthor && post.status !== 'archived' && (
                <Link to={`/write/${post.slug}`} className="btn btn-outline btn-sm">
                  {isPublic ? 'Suggest edits' : 'Edit'}
                </Link>
              )}
              <button type="button" className="btn btn-ghost btn-sm text-danger" onClick={() => setConfirmDelete(true)}>
                {isAuthor ? 'Delete' : 'Remove (moderation)'}
              </button>
            </div>
          )}
          {actionError && (
            <div className="mx-auto mt-4 max-w-md">
              <Notice>{actionError}</Notice>
            </div>
          )}
        </div>
      </header>

      {post.coverImage && (
        <div className="mx-auto mt-12 max-w-[1080px] sm:px-6">
          <CoverImage cover={post.coverImage} ratio="aspect-[16/9]" eager sizes="(min-width: 1080px) 1080px, 100vw" />
        </div>
      )}

      <div className="wrap">
        <div className="mx-auto mt-12 max-w-[720px]">
          <ArticleBody content={post.content ?? ''} />

          {post.tags.length > 0 && (
            <ul className="mt-12 flex flex-wrap gap-2" aria-label="Tags">
              {post.tags.map((tag) => (
                <li key={tag}>
                  <Link
                    to={`/?tag=${encodeURIComponent(tag)}`}
                    className="inline-block rounded-[2px] border border-rule bg-card px-2.5 py-1 text-xs text-ink-soft hover:border-ink-soft hover:text-ink"
                  >
                    #{tag}
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {isPublic && <Engagement post={post} />}

          <section aria-label="About the author" className={`flex gap-4 border-b border-rule py-6 ${isPublic ? '' : 'mt-12 border-t'}`}>
            <Avatar name={post.author.name} src={post.author.avatar} />
            <div>
              <p className="text-xs uppercase tracking-[0.08em] text-muted">Written by</p>
              <Link to={`/authors/${post.author._id}`} className="font-serif text-xl font-semibold hover:underline">
                {post.author.name}
              </Link>
              {post.author.bio && <p className="mt-1 text-[0.9375rem] leading-relaxed text-ink-soft">{post.author.bio}</p>}
            </div>
          </section>

          {isPublic && <CommentSection postId={post._id} />}
        </div>
        {isPublic && <RelatedArticles post={post} />}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this article?"
        confirmLabel="Delete article"
        tone="danger"
        onConfirm={remove}
        onClose={() => setConfirmDelete(false)}
      >
        It will disappear from Margin immediately. An administrator can restore it later.
      </ConfirmDialog>
    </article>
  );
};
