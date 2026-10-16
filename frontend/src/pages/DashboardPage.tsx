import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { postApi } from '../api';
import { errorMessage } from '../api/client';
import { useFetch } from '../lib/useFetch';
import { useSocketEvent } from '../context/RealtimeContext';
import { formatDate } from '../lib/format';
import type { Post, PostStatus } from '../types';
import { CoverImage } from '../components/common/CoverImage';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { Pagination } from '../components/common/Pagination';
import { StatusBadge } from '../components/common/StatusBadge';
import { EmptyState, ErrorState, LoadingState, Notice } from '../components/common/States';

const FILTERS: { value: PostStatus | undefined; label: string }[] = [
  { value: undefined, label: 'All' },
  { value: 'draft', label: 'Drafts' },
  { value: 'pending_review', label: 'In review' },
  { value: 'rejected', label: 'Changes requested' },
  { value: 'published', label: 'Published' },
  { value: 'archived', label: 'Archived' },
];

type Action = 'submit' | 'archive' | 'unarchive' | 'delete';

const ACTION_COPY: Record<Action, { title: string; confirm: string; body: string; tone?: 'danger' }> = {
  submit: { title: 'Submit for review?', confirm: 'Submit', body: 'An editor will review it. You can keep editing, but that withdraws the submission.' },
  archive: { title: 'Archive this article?', confirm: 'Archive', body: 'It will no longer be visible to readers. You can return it to drafts later.' },
  unarchive: { title: 'Return to drafts?', confirm: 'Move to drafts', body: 'It stays private and must be reviewed again before it goes live.' },
  delete: { title: 'Delete this article?', confirm: 'Delete', body: 'It will be removed from Margin. An administrator can restore it.', tone: 'danger' },
};

const statusLine = (post: Post) => {
  if (post.status === 'published') return `Published ${formatDate(post.publishedAt, 'short')}`;
  if (post.status === 'pending_review') return `Submitted ${formatDate(post.submittedAt, 'short')}`;
  return `Edited ${formatDate(post.updatedAt, 'short')}`;
};

export const DashboardPage = () => {
  const [status, setStatus] = useState<PostStatus | undefined>();
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useFetch(() => postApi.mine({ status, page, limit: 10 }), [status, page]);
  const [pending, setPending] = useState<{ post: Post; action: Action } | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'danger'; text: string } | null>(null);

  useEffect(() => {
    document.title = 'Your articles — Margin';
  }, []);

  // Moderation decisions arrive live; refresh the list so statuses stay accurate
  useSocketEvent('post:approved', reload);
  useSocketEvent('post:rejected', reload);

  const run = async () => {
    if (!pending) return;
    const { post, action } = pending;
    try {
      if (action === 'submit') await postApi.submit(post._id);
      if (action === 'archive') await postApi.archive(post._id);
      if (action === 'unarchive') await postApi.unarchive(post._id);
      if (action === 'delete') await postApi.remove(post._id);
      setNotice({ tone: 'ok', text: action === 'submit' ? `“${post.title}” is now in review.` : 'Done.' });
      reload();
    } catch (err) {
      setNotice({ tone: 'danger', text: errorMessage(err) });
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="wrap py-12">
      <div className="mx-auto max-w-4xl">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-rule pb-6">
          <div>
            <p className="kicker text-muted">Workspace</p>
            <h1 className="mt-2 font-serif text-4xl font-semibold tracking-[-0.015em]">Your articles</h1>
          </div>
          <Link to="/write" className="btn btn-primary">
            New article
          </Link>
        </header>

        <div role="group" aria-label="Filter by status" className="mt-6 flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.label}
              type="button"
              aria-pressed={status === f.value}
              onClick={() => {
                setStatus(f.value);
                setPage(1);
              }}
              className={`btn btn-sm ${status === f.value ? 'btn-primary' : 'btn-ghost'}`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {notice && <div className="mt-4"><Notice tone={notice.tone}>{notice.text}</Notice></div>}

        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : data!.data.length === 0 ? (
          <EmptyState title={status ? 'Nothing here' : 'Start your first article'} action={<Link to="/write" className="btn btn-primary">Write an article</Link>}>
            Drafts stay private. When you submit one, an editor reviews it before it is published.
          </EmptyState>
        ) : (
          <>
            <ul className="mt-4">
              {data!.data.map((post) => (
                <li key={post._id} className="grid grid-cols-[5rem_1fr] gap-4 border-b border-rule-soft py-5 sm:grid-cols-[7rem_1fr_auto] sm:items-start">
                  <CoverImage cover={post.coverImage} ratio="aspect-[4/3]" />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge kind={post.status} />
                      {post.revision && (
                        <StatusBadge kind={post.revision.status} label={`edits ${post.revision.status === 'pending_review' ? 'in review' : post.revision.status === 'rejected' ? 'not approved' : 'unsubmitted'}`} />
                      )}
                      {post.category && <span className="text-xs text-muted">{post.category.name}</span>}
                    </div>
                    <h2 className="mt-1.5 truncate font-serif text-xl font-semibold">
                      <Link to={`/write/${post.slug}`} className="hover:text-accent-deep">
                        {post.revision?.title || post.title}
                      </Link>
                    </h2>
                    <p className="mt-0.5 text-xs text-muted">
                      {statusLine(post)} · {post.readingTime} min read{post.status === 'published' && ` · ${post.likeCount} likes`}
                    </p>
                    {post.status === 'rejected' && post.rejectionReason && (
                      <p className="mt-2 rounded-[3px] border-l-2 border-danger bg-danger-wash/60 px-3 py-2 text-sm text-ink-soft">
                        <span className="font-medium text-danger">Editor feedback: </span>
                        {post.rejectionReason}
                      </p>
                    )}
                    {post.revision?.status === 'rejected' && post.revision.rejectionReason && (
                      <p className="mt-2 rounded-[3px] border-l-2 border-danger bg-danger-wash/60 px-3 py-2 text-sm text-ink-soft">
                        <span className="font-medium text-danger">Feedback on your edits: </span>
                        {post.revision.rejectionReason}
                      </p>
                    )}
                  </div>
                  <div className="col-span-2 flex flex-wrap gap-1.5 sm:col-span-1 sm:justify-end">
                    {post.status !== 'archived' && (
                      <Link to={`/write/${post.slug}`} className="btn btn-outline btn-sm">
                        {post.status === 'published' ? 'Edit' : 'Open'}
                      </Link>
                    )}
                    {(post.status === 'draft' || post.status === 'rejected') && (
                      <button type="button" className="btn btn-accent btn-sm" onClick={() => setPending({ post, action: 'submit' })}>
                        Submit
                      </button>
                    )}
                    {post.status === 'published' && (
                      <>
                        <Link to={`/post/${post.slug}`} className="btn btn-ghost btn-sm">View</Link>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPending({ post, action: 'archive' })}>
                          Archive
                        </button>
                      </>
                    )}
                    {post.status === 'archived' && (
                      <button type="button" className="btn btn-outline btn-sm" onClick={() => setPending({ post, action: 'unarchive' })}>
                        Move to drafts
                      </button>
                    )}
                    <button type="button" className="btn btn-ghost btn-sm text-danger" onClick={() => setPending({ post, action: 'delete' })}>
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            <Pagination meta={data!.meta} onPageChange={setPage} className="mt-6" />
          </>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(pending)}
        title={pending ? ACTION_COPY[pending.action].title : ''}
        confirmLabel={pending ? ACTION_COPY[pending.action].confirm : ''}
        tone={pending ? ACTION_COPY[pending.action].tone : undefined}
        onConfirm={run}
        onClose={() => setPending(null)}
      >
        {pending && ACTION_COPY[pending.action].body}
      </ConfirmDialog>
    </div>
  );
};
