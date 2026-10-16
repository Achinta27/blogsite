import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { commentApi } from '../../api';
import { errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useRealtime, useSocketEvent } from '../../context/RealtimeContext';
import { can } from '../../lib/permissions';
import { useFetch } from '../../lib/useFetch';
import { formatDate } from '../../lib/format';
import type { Comment } from '../../types';
import { Avatar } from '../common/Avatar';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { ErrorState, LoadingState, Notice } from '../common/States';

const MAX_LENGTH = 2000;

const CommentItem = ({
  comment,
  onUpdated,
  onDelete,
}: {
  comment: Comment;
  onUpdated: (comment: Comment) => void;
  onDelete: (comment: Comment) => void;
}) => {
  const { user } = useAuth();
  const canModerate = can(user, 'comments.moderate');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.content);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAuthor = user?._id === comment.author?._id;
  const edited = new Date(comment.updatedAt).getTime() - new Date(comment.createdAt).getTime() > 1000;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return setError('A comment cannot be empty.');
    setSaving(true);
    setError(null);
    try {
      onUpdated(await commentApi.update(comment._id, draft));
      setEditing(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <li className="flex gap-3.5 border-t border-rule-soft py-6">
      <Avatar name={comment.author?.name ?? 'Former member'} src={comment.author?.avatar} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
          {comment.author ? (
            <Link to={`/authors/${comment.author._id}`} className="font-medium text-ink hover:underline">
              {comment.author.name}
            </Link>
          ) : (
            <span className="font-medium text-muted">Former member</span>
          )}
          <time dateTime={comment.createdAt} className="text-xs text-muted">
            {formatDate(comment.createdAt, 'short')}
            {edited && ' · edited'}
          </time>
        </div>

        {editing ? (
          <form onSubmit={save} className="mt-2 space-y-2">
            <label htmlFor={`edit-${comment._id}`} className="sr-only">
              Edit comment
            </label>
            <textarea
              id={`edit-${comment._id}`}
              className="field min-h-24"
              value={draft}
              maxLength={MAX_LENGTH}
              onChange={(e) => setDraft(e.target.value)}
            />
            {error && <p className="field-error">{error}</p>}
            <div className="flex gap-2">
              <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setEditing(false);
                  setDraft(comment.content);
                  setError(null);
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <p className="mt-1.5 whitespace-pre-line break-words text-[0.9375rem] leading-relaxed text-ink-soft">
            {comment.content}
          </p>
        )}

        {!editing && (isAuthor || canModerate) && (
          <div className="mt-2 flex gap-3 text-xs">
            {isAuthor && (
              <button type="button" className="text-muted hover:text-ink" onClick={() => setEditing(true)}>
                Edit
              </button>
            )}
            <button type="button" className="text-muted hover:text-danger" onClick={() => onDelete(comment)}>
              {isAuthor ? 'Delete' : 'Remove'}
            </button>
          </div>
        )}
      </div>
    </li>
  );
};

export const CommentSection = ({ postId }: { postId: string }) => {
  const { user } = useAuth();
  const location = useLocation();
  const { data, error, loading, reload, setData } = useFetch(() => commentApi.list(postId), [postId]);
  const [content, setContent] = useState('');
  const [posting, setPosting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Comment | null>(null);

  const [loadingMore, setLoadingMore] = useState(false);
  const { socket } = useRealtime();

  // Follow this post's room for live responses; rejoin after every reconnect
  useEffect(() => {
    if (!socket) return;
    const join = () => socket.emit('post:join', { postId });
    if (socket.connected) join();
    socket.on('connect', join);
    return () => {
      socket.off('connect', join);
      socket.emit('post:leave', { postId });
    };
  }, [socket, postId]);

  // Events may repeat (our own REST response plus the broadcast): de-duplicate by id
  useSocketEvent<{ postId: string; comment: Comment }>('comment:created', ({ postId: id, comment }) => {
    if (id !== postId) return;
    setData((current) =>
      !current || current.data.some((c) => c._id === comment._id)
        ? current
        : { data: [...current.data, comment], meta: { ...current.meta, total: current.meta.total + 1 } }
    );
  });
  useSocketEvent<{ postId: string; comment: Comment }>('comment:updated', ({ postId: id, comment }) => {
    if (id !== postId) return;
    setData((current) => current && { ...current, data: current.data.map((c) => (c._id === comment._id ? comment : c)) });
  });
  useSocketEvent<{ postId: string; commentId: string }>('comment:deleted', ({ postId: id, commentId }) => {
    if (id !== postId) return;
    setData((current) =>
      current && current.data.some((c) => c._id === commentId)
        ? { data: current.data.filter((c) => c._id !== commentId), meta: { ...current.meta, total: current.meta.total - 1 } }
        : current
    );
  });

  const comments = data?.data ?? [];
  const total = data?.meta.total ?? 0;

  const loadMore = async () => {
    if (!data) return;
    setLoadingMore(true);
    try {
      const next = await commentApi.list(postId, data.meta.page + 1);
      setData((current) => current && { data: [...current.data, ...next.data], meta: next.meta });
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setLoadingMore(false);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return setFormError('Write something before posting.');
    setPosting(true);
    setFormError(null);
    try {
      const created = await commentApi.create(postId, content);
      setData((current) =>
        !current || current.data.some((c) => c._id === created._id)
          ? current
          : { data: [...current.data, created], meta: { ...current.meta, total: current.meta.total + 1 } }
      );
      setContent('');
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setPosting(false);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      await commentApi.remove(pendingDelete._id);
      setData((current) =>
        current && current.data.some((c) => c._id === pendingDelete._id)
          ? { data: current.data.filter((c) => c._id !== pendingDelete._id), meta: { ...current.meta, total: current.meta.total - 1 } }
          : current
      );
      setPendingDelete(null);
    } catch (err) {
      setPendingDelete(null);
      setFormError(errorMessage(err));
    }
  };

  return (
    <section id="responses" aria-labelledby="comments-heading" className="mt-16">
      <h2 id="comments-heading" className="font-serif text-2xl font-semibold">
        Responses{total > 0 && <span className="ml-2 text-lg font-normal text-muted">{total}</span>}
      </h2>

      {user ? (
        <form onSubmit={submit} className="mt-5">
          <label htmlFor="new-comment" className="sr-only">
            Write a response
          </label>
          <textarea
            id="new-comment"
            className="field min-h-28 font-serif text-lg"
            placeholder="Share a thoughtful response…"
            value={content}
            maxLength={MAX_LENGTH}
            aria-invalid={Boolean(formError)}
            onChange={(e) => setContent(e.target.value)}
          />
          <div className="mt-2 flex items-center justify-between gap-4">
            <span className="text-xs text-muted">
              {content.length}/{MAX_LENGTH}
            </span>
            <button type="submit" className="btn btn-primary" disabled={posting || !content.trim()}>
              {posting ? 'Posting…' : 'Respond'}
            </button>
          </div>
          {formError && <div className="mt-3"><Notice>{formError}</Notice></div>}
        </form>
      ) : (
        <p className="mt-4 rounded-[3px] border border-rule-soft bg-card px-4 py-3.5 text-sm text-ink-soft">
          <Link to="/login" state={{ from: location.pathname }} className="link font-medium">
            Sign in
          </Link>{' '}
          to join the conversation.
        </p>
      )}

      {loading ? (
        <LoadingState label="Loading responses…" className="py-10" />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} className="py-10" />
      ) : comments.length === 0 ? (
        <p className="mt-8 text-sm text-muted">No responses yet.</p>
      ) : (
        <ul className="mt-6">
          {comments.map((comment) => (
            <CommentItem
              key={comment._id}
              comment={comment}
              onDelete={setPendingDelete}
              onUpdated={(updated) =>
                setData((current) => current && { ...current, data: current.data.map((c) => (c._id === updated._id ? updated : c)) })
              }
            />
          ))}
        </ul>
      )}
      {data?.meta.hasNextPage && (
        <button type="button" className="btn btn-outline mt-2" onClick={loadMore} disabled={loadingMore}>
          {loadingMore ? 'Loading…' : 'Show more responses'}
        </button>
      )}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Delete this response?"
        confirmLabel="Delete"
        tone="danger"
        onConfirm={confirmDelete}
        onClose={() => setPendingDelete(null)}
      >
        This cannot be undone.
      </ConfirmDialog>
    </section>
  );
};
