import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { moderationApi } from '../../api';
import { errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useSocketEvent } from '../../context/RealtimeContext';
import { actionLabel, describeChange } from '../../lib/audit';
import { formatDateTime } from '../../lib/format';
import { can } from '../../lib/permissions';
import { useFetch } from '../../lib/useFetch';
import { ArticleBody } from '../../components/post/ArticleBody';
import { CoverImage } from '../../components/common/CoverImage';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { StatusBadge } from '../../components/common/StatusBadge';
import { EmptyState, ErrorState, LoadingState, Notice } from '../../components/common/States';
import type { Revision, ReviewItem } from '../../types';

type Version = Pick<Revision, 'title' | 'subtitle' | 'content' | 'coverImage' | 'tags' | 'category'>;

const VersionView = ({ version, label }: { version: Version; label: string }) => (
  <article className="card p-6 sm:p-8">
    <p className="kicker text-muted">{label}</p>
    {version.category && <p className="kicker mt-4">{version.category.name}</p>}
    <h2 className="mt-2 font-serif text-3xl font-semibold leading-tight">{version.title}</h2>
    {version.subtitle && <p className="mt-3 font-serif text-lg text-ink-soft">{version.subtitle}</p>}
    {version.coverImage && <CoverImage cover={version.coverImage} ratio="aspect-[16/9]" className="mt-6" />}
    <ArticleBody content={version.content || ''} className="mt-6 !text-[1.0625rem]" />
    {version.tags.length > 0 && <p className="mt-6 text-sm text-muted">{version.tags.map((t) => `#${t}`).join('  ')}</p>}
  </article>
);

export const ReviewPage = () => {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data, error, status, loading, reload } = useFetch(() => moderationApi.review(id), [id]);
  const [reason, setReason] = useState('');
  const [rejectOpen, setRejectOpen] = useState(false);
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'danger'; text: string } | null>(null);

  useEffect(() => {
    document.title = 'Review — Margin';
  }, []);

  // Another moderator may decide while this page is open
  useSocketEvent<{ postId: string }>('post:approved', (p) => p.postId === id && reload());
  useSocketEvent<{ postId: string }>('post:rejected', (p) => p.postId === id && reload());

  if (loading && !data) return <LoadingState />;
  if (status === 404) return <EmptyState title="Submission not found" action={<Link to="/admin/moderation" className="btn btn-outline">Back to the queue</Link>} />;
  if (error || !data) return <ErrorState message={error ?? ''} onRetry={reload} />;

  const post: ReviewItem = data.post;
  const isEdit = post.revision?.status === 'pending_review';
  const awaiting = isEdit || post.status === 'pending_review';
  const ownPost = post.author._id === user?._id;
  const selfBlocked = ownPost && user?.role !== 'admin';
  const canApprove = can(user, 'posts.approve') && awaiting && !selfBlocked;
  const canReject = can(user, 'posts.reject') && awaiting && !selfBlocked;

  const approve = async () => {
    setBusy(true);
    try {
      await moderationApi.approve(post._id);
      navigate('/admin/moderation', { replace: true });
    } catch (err) {
      setNotice({ tone: 'danger', text: errorMessage(err) });
      setConfirmApprove(false);
      reload();
    } finally {
      setBusy(false);
    }
  };

  const reject = async (e: FormEvent) => {
    e.preventDefault();
    if (reason.trim().length < 10) return setNotice({ tone: 'danger', text: 'Explain the decision in at least 10 characters.' });
    setBusy(true);
    try {
      await moderationApi.reject(post._id, reason.trim());
      navigate('/admin/moderation', { replace: true });
    } catch (err) {
      setNotice({ tone: 'danger', text: errorMessage(err) });
      reload();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <Link to="/admin/moderation" className="text-sm text-muted hover:text-ink">
        ← Review queue
      </Link>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap gap-2">
            <StatusBadge kind={post.status} />
            {post.revision && <StatusBadge kind={post.revision.status} label={`edit ${post.revision.status.replace('_', ' ')}`} />}
          </div>
          <h1 className="mt-2 font-serif text-3xl font-semibold">{isEdit ? post.revision!.title : post.title}</h1>
          <p className="mt-1 text-sm text-muted">
            by {post.author.name}
            {post.author.email && ` (${post.author.email})`}
            {post.status === 'published' && (
              <>
                {' · '}
                <Link to={`/post/${post.slug}`} className="link">
                  view live
                </Link>
              </>
            )}
          </p>
        </div>

        {awaiting && (
          <div className="flex flex-wrap gap-2">
            {canReject && (
              <button type="button" className="btn btn-outline" onClick={() => setRejectOpen((v) => !v)} aria-expanded={rejectOpen}>
                Request changes
              </button>
            )}
            {canApprove && (
              <button type="button" className="btn btn-accent" onClick={() => setConfirmApprove(true)}>
                {isEdit ? 'Approve edits' : 'Approve & publish'}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="mt-4 space-y-3">
        {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
        {!awaiting && <Notice tone="ok">This submission has already been decided. The history below shows the outcome.</Notice>}
        {awaiting && selfBlocked && <Notice tone="warn">This is your own article. Another editor has to review it.</Notice>}
        {awaiting && !canApprove && !canReject && !selfBlocked && (
          <Notice tone="warn">You can read this submission, but your account cannot approve or reject posts.</Notice>
        )}
      </div>

      {rejectOpen && canReject && (
        <form onSubmit={reject} className="card mt-4 p-5">
          <label htmlFor="reason" className="field-label">
            What should the author change? <span className="font-normal text-muted">(sent to the author and kept in the audit log)</span>
          </label>
          <textarea
            id="reason"
            className="field min-h-28"
            maxLength={1000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Be specific: what needs to change for this to be published?"
          />
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" className="btn btn-ghost" onClick={() => setRejectOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-danger" disabled={busy}>
              {busy ? 'Sending…' : 'Send back to author'}
            </button>
          </div>
        </form>
      )}

      <div className={`mt-8 grid gap-6 ${isEdit ? 'xl:grid-cols-2' : ''}`}>
        {isEdit && <VersionView version={post as unknown as Version} label="Live version" />}
        <VersionView version={(isEdit ? post.revision : post) as unknown as Version} label={isEdit ? 'Proposed edit' : 'Submission'} />
      </div>

      <section aria-labelledby="history-heading" className="mt-12">
        <h2 id="history-heading" className="font-serif text-xl font-semibold">
          Moderation history
        </h2>
        {data.history.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No moderation events yet.</p>
        ) : (
          <ol className="mt-4 border-l border-rule pl-5">
            {data.history.map((h) => (
              <li key={h._id} className="relative pb-5">
                <span aria-hidden className="absolute -left-[1.6rem] top-1.5 h-2 w-2 rounded-full bg-ink-soft" />
                <p className="text-sm">
                  <span className="font-medium">{h.actor?.name ?? 'Unknown'}</span>
                  {h.actorRole && <span className="text-muted"> ({h.actorRole})</span>} — {actionLabel(h.action).toLowerCase()}
                  {describeChange(h) && <span className="text-muted"> · {describeChange(h)}</span>}
                </p>
                <p className="text-xs text-muted">{formatDateTime(h.createdAt)}</p>
                {h.reason && <p className="mt-1 text-sm text-ink-soft">“{h.reason}”</p>}
              </li>
            ))}
          </ol>
        )}
      </section>

      <ConfirmDialog
        open={confirmApprove}
        title={isEdit ? 'Approve these edits?' : 'Approve and publish?'}
        confirmLabel={isEdit ? 'Approve edits' : 'Publish'}
        onConfirm={approve}
        onClose={() => setConfirmApprove(false)}
      >
        {isEdit ? 'The live article will be replaced with this version.' : 'The article becomes public immediately and the author is notified.'}
      </ConfirmDialog>
    </div>
  );
};
