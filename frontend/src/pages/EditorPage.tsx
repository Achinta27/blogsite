import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { postApi, type PostInput } from '../api';
import { errorMessage, fieldErrors } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useCategories } from '../lib/useCategories';
import type { Post } from '../types';
import { RichTextEditor } from '../components/post/RichTextEditor';
import { isEditorEmpty, validateCoverFile } from '../lib/editor';
import { ArticleBody } from '../components/post/ArticleBody';
import { CoverImageField } from '../components/post/CoverImageField';
import { StatusBadge } from '../components/common/StatusBadge';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { EmptyState, ErrorState, LoadingState, Notice } from '../components/common/States';

interface FormState {
  title: string;
  subtitle: string;
  excerpt: string;
  content: string;
  category: string;
  tags: string;
  coverAlt: string;
}

const EMPTY: FormState = { title: '', subtitle: '', excerpt: '', content: '', category: '', tags: '', coverAlt: '' };
const MIN_PUBLISH_TEXT = 20;

/** A published post is edited through its revision (if one exists); everything else directly. */
const editable = (post: Post | null) => (post?.status === 'published' && post.revision ? post.revision : post);

const fromPost = (post: Post): FormState => {
  const src = editable(post)!;
  return {
    title: src.title,
    subtitle: src.subtitle,
    excerpt: src.excerpt,
    content: src.content ?? '',
    category: src.category?._id ?? '',
    tags: src.tags.join(', '),
    coverAlt: src.coverImage?.alt ?? '',
  };
};

const parseTags = (value: string) =>
  [...new Set(value.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 5);

/** Single-line-looking textarea that grows with its content (titles wrap on narrow screens). */
const AutoGrowTextarea = (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [props.value]);
  return <textarea ref={ref} rows={1} {...props} />;
};

const PreviewCover = ({ file, savedUrl, alt }: { file: File | null; savedUrl?: string; alt: string }) => {
  const objectUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => {
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [objectUrl]);
  const src = objectUrl ?? savedUrl;
  return src ? <img src={src} alt={alt} className="mt-10 aspect-[16/9] w-full object-cover" /> : null;
};

const textLength = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim().length;

/**
 * Keyed by an editor "session": saving a new article moves the URL to /write/:slug while
 * keeping the same session (and component state); opening /write fresh starts a new one.
 */
export const EditorRoute = () => {
  const location = useLocation();
  const sessionKey = (location.state as { editorSession?: string } | null)?.editorSession ?? location.key;
  return <EditorPage key={sessionKey} sessionKey={sessionKey} />;
};

const EditorPage = ({ sessionKey }: { sessionKey: string }) => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const categories = useCategories();
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const [post, setPost] = useState<Post | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'missing' | 'error'>(slug ? 'loading' : 'ready');
  const [loadError, setLoadError] = useState<string | null>(null);
  // Bumped to remount the editor with fresh content after a load
  const [editorKey, setEditorKey] = useState(0);

  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverRemoved, setCoverRemoved] = useState(false);
  const [coverError, setCoverError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState<'save' | 'submit' | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ tone: 'ok' | 'danger' | 'warn'; text: string } | null>(null);
  const [preview, setPreview] = useState(false);

  // Load an existing article (only its author or an admin gets drafts back from the API)
  useEffect(() => {
    if (!slug) return;
    if (post?.slug === slug) return; // already loaded (e.g. after a save changed the URL)
    let cancelled = false;
    setLoadState('loading');
    postApi
      .bySlug(slug)
      .then((loaded) => {
        if (cancelled) return;
        if (loaded.author._id !== user?._id && user?.role !== 'admin') return setLoadState('missing');
        setPost(loaded);
        setForm(fromPost(loaded));
        setEditorKey((k) => k + 1);
        setLoadState('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        if (err?.response?.status === 404) return setLoadState('missing');
        setLoadError(errorMessage(err));
        setLoadState('error');
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  useEffect(() => {
    document.title = `${post ? 'Edit' : 'New'} article — Margin`;
  }, [post]);

  // Warn before leaving with unsaved changes
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setDirty(true);
    if (errors[key]) setErrors((e) => ({ ...e, [key]: '' }));
  };

  const validate = (submitting: boolean) => {
    const found: Record<string, string> = {};
    if (form.title.trim().length < 3) found.title = 'Give your article a title of at least 3 characters.';
    if (submitting && textLength(form.content) < MIN_PUBLISH_TEXT) found.content = 'Write a little more before submitting.';
    if (submitting && !form.category) found.category = 'Choose a category before submitting.';
    if (parseTags(form.tags).some((t) => !/^[a-z0-9][a-z0-9 .#+-]*$/.test(t) || t.length > 30)) {
      found.tags = 'Tags may use letters, numbers, spaces and . # + - (30 characters max).';
    }
    setErrors(found);
    return Object.keys(found).length === 0;
  };

  /**
   * Saves text first, then applies the cover change, then (optionally) submits for review.
   * If the image step fails, the article is still saved and the editor says so, keeping the
   * selected file so the user can retry. Publishing is always an editor's decision.
   */
  const save = async (mode: 'save' | 'submit') => {
    setNotice(null);
    const submitting = mode === 'submit';
    if (!validate(submitting)) {
      setNotice({ tone: 'danger', text: 'Please fix the highlighted fields.' });
      return;
    }
    setSaving(mode);

    const body: PostInput = {
      title: form.title.trim(),
      subtitle: form.subtitle.trim(),
      excerpt: form.excerpt.trim(),
      content: isEditorEmpty(form.content) ? '' : form.content,
      category: form.category || null,
      tags: parseTags(form.tags),
    };

    let saved: Post;
    try {
      saved = post
        ? await postApi.update(post._id, { ...body, ...(editable(post)?.coverImage && !coverFile ? { coverImageAlt: form.coverAlt.trim() } : {}) })
        : await postApi.create(body);
    } catch (err) {
      setErrors(fieldErrors(err));
      setNotice({ tone: 'danger', text: errorMessage(err) });
      setSaving(null);
      return;
    }

    let imageProblem: string | null = null;
    try {
      if (coverFile) {
        setUploadProgress(0);
        saved = await postApi.uploadCover(saved._id, coverFile, form.coverAlt.trim(), setUploadProgress);
        setCoverFile(null);
      } else if (coverRemoved && saved.coverImage) {
        saved = await postApi.removeCover(saved._id);
      }
      setCoverRemoved(false);
    } catch (err) {
      imageProblem = errorMessage(err, 'The cover image could not be uploaded.');
      setCoverError(imageProblem);
    } finally {
      setUploadProgress(null);
    }

    let submitProblem: string | null = null;
    if (submitting && !imageProblem) {
      try {
        saved = await postApi.submit(saved._id);
      } catch (err) {
        setErrors(fieldErrors(err));
        submitProblem = errorMessage(err);
      }
    }

    setPost(saved);
    setDirty(Boolean(imageProblem));
    setSaving(null);
    if (saved.slug !== slug) navigate(`/write/${saved.slug}`, { replace: true, state: { editorSession: sessionKey } });

    const live = saved.status === 'published';
    if (imageProblem) {
      setNotice({ tone: 'warn', text: `Your text was saved, but the cover image wasn’t: ${imageProblem}` });
    } else if (submitProblem) {
      setNotice({ tone: 'warn', text: `Saved, but not submitted: ${submitProblem}` });
    } else if (submitting) {
      setNotice({
        tone: 'ok',
        text: live
          ? 'Your changes were sent for review. Readers keep seeing the current version until an editor approves them.'
          : 'Submitted for review. You’ll get a notification when an editor decides.',
      });
    } else {
      setNotice({ tone: 'ok', text: live ? 'Changes saved. Submit them for review when you’re ready.' : 'Draft saved.' });
    }
  };

  const discardChanges = async () => {
    if (!post) return;
    try {
      const updated = await postApi.discardRevision(post._id);
      setPost(updated);
      setForm(fromPost(updated));
      setEditorKey((k) => k + 1);
      setCoverFile(null);
      setCoverRemoved(false);
      setDirty(false);
      setNotice({ tone: 'ok', text: 'Your unpublished changes were discarded.' });
    } catch (err) {
      setNotice({ tone: 'danger', text: errorMessage(err) });
    } finally {
      setConfirmDiscard(false);
    }
  };

  if (loadState === 'loading') return <LoadingState label="Opening article…" className="py-32" />;
  if (loadState === 'missing') {
    return (
      <EmptyState title="Article not found" className="py-32" action={<Link to="/dashboard" className="btn btn-outline">Your articles</Link>}>
        It may have been deleted, or it belongs to someone else.
      </EmptyState>
    );
  }
  if (loadState === 'error') return <ErrorState message={loadError ?? ''} onRetry={() => window.location.reload()} className="py-32" />;

  const isPublished = post?.status === 'published';
  const revision = post?.revision;
  const inReview = post?.status === 'pending_review' || revision?.status === 'pending_review';
  const categoryName = categories.find((c) => c._id === form.category)?.name ?? '';

  if (post?.status === 'archived') {
    return (
      <EmptyState title="This article is archived" className="py-32" action={<Link to="/dashboard" className="btn btn-outline">Your articles</Link>}>
        Move it back to drafts from your articles page to edit it again.
      </EmptyState>
    );
  }

  return (
    <div className="wrap py-8">
      <div className="sticky top-0 z-20 -mx-4 mb-8 border-b border-rule bg-paper/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-sm">
            <Link to="/dashboard" className="text-muted hover:text-ink">
              ← Your articles
            </Link>
            <StatusBadge kind={post?.status ?? 'draft'} label={post ? undefined : 'new draft'} />
            {revision && (
              <StatusBadge
                kind={revision.status}
                label={revision.status === 'pending_review' ? 'edits in review' : revision.status === 'rejected' ? 'edits not approved' : 'unsubmitted edits'}
              />
            )}
            {dirty && <span className="text-xs text-muted">Unsaved changes</span>}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-ghost" aria-pressed={preview} onClick={() => setPreview((p) => !p)}>
              {preview ? 'Back to editing' : 'Preview'}
            </button>
            {isPublished && revision && (
              <button type="button" className="btn btn-ghost text-danger" disabled={saving !== null} onClick={() => setConfirmDiscard(true)}>
                Discard changes
              </button>
            )}
            <button type="button" className="btn btn-outline" disabled={saving !== null} onClick={() => save('save')}>
              {saving === 'save' ? 'Saving…' : isPublished ? 'Save changes' : 'Save draft'}
            </button>
            <button
              type="button"
              className="btn btn-accent"
              disabled={saving !== null || (inReview && !dirty)}
              title={inReview && !dirty ? 'Already waiting for an editor' : undefined}
              onClick={() => save('submit')}
            >
              {saving === 'submit' ? 'Submitting…' : isPublished ? 'Submit changes' : 'Submit for review'}
            </button>
          </div>
        </div>
      </div>

      {post && (
        <div className="mx-auto mb-6 max-w-[720px] space-y-3">
          {inReview && (
            <Notice tone="warn">
              {isPublished
                ? 'Your edits are waiting for an editor. Readers see the published version until they are approved. Editing again withdraws them from review.'
                : 'Waiting for an editor. Editing again withdraws the submission until you resubmit.'}
            </Notice>
          )}
          {post.status === 'rejected' && post.rejectionReason && (
            <Notice>
              <strong className="font-medium">Editor feedback:</strong> {post.rejectionReason}
            </Notice>
          )}
          {revision?.status === 'rejected' && revision.rejectionReason && (
            <Notice>
              <strong className="font-medium">Feedback on your edits:</strong> {revision.rejectionReason}
            </Notice>
          )}
          {isPublished && !revision && (
            <p className="text-sm text-muted">This article is live. Changes you make here are reviewed before readers see them.</p>
          )}
        </div>
      )}

      {notice && (
        <div className="mx-auto mb-6 max-w-[720px]">
          <Notice tone={notice.tone}>
            {notice.text}{' '}
            {notice.tone === 'ok' && post && (
              <Link to={`/post/${post.slug}`} className="font-medium underline">
                {isPublished ? 'View live article' : 'Open preview'}
              </Link>
            )}
          </Notice>
        </div>
      )}

      {preview ? (
        <article className="mx-auto max-w-[720px]" aria-label="Preview">
          {categoryName && <p className="kicker text-center">{categoryName}</p>}
          <h1 className="mt-4 text-center font-serif text-[2.4rem] font-semibold leading-[1.08] tracking-[-0.02em] sm:text-[3.2rem]">
            {form.title || 'Untitled'}
          </h1>
          {form.subtitle && <p className="mt-5 text-center font-serif text-xl leading-relaxed text-ink-soft">{form.subtitle}</p>}
          <PreviewCover file={coverFile} savedUrl={coverRemoved ? undefined : editable(post)?.coverImage?.url} alt={form.coverAlt} />
          <ArticleBody content={form.content || '<p></p>'} className="mt-10" />
        </article>
      ) : (
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="mx-auto w-full max-w-[720px]">
            <label htmlFor="title" className="sr-only">
              Title
            </label>
            <AutoGrowTextarea
              id="title"
              value={form.title}
              maxLength={200}
              placeholder="Title"
              aria-invalid={Boolean(errors.title)}
              onChange={(e) => update('title', e.target.value.replace(/\n/g, ''))}
              className="w-full resize-none overflow-hidden bg-transparent font-serif text-[2.4rem] font-semibold leading-[1.1] tracking-[-0.02em] placeholder:text-rule focus:outline-none sm:text-[3rem]"
            />
            {errors.title && <p className="field-error">{errors.title}</p>}

            <label htmlFor="subtitle" className="sr-only">
              Subtitle
            </label>
            <AutoGrowTextarea
              id="subtitle"
              value={form.subtitle}
              maxLength={300}
              placeholder="Add a subtitle (optional)"
              onChange={(e) => update('subtitle', e.target.value.replace(/\n/g, ''))}
              className="mt-3 w-full resize-none overflow-hidden bg-transparent font-serif text-xl leading-relaxed text-ink-soft placeholder:text-[#b6afa3] focus:outline-none sm:text-2xl"
            />

            <div className="mt-6">
              <span id="body-label" className="sr-only">
                Article body
              </span>
              <RichTextEditor key={editorKey} labelledBy="body-label" initialContent={form.content} onChange={(html) => update('content', html)} />
              {errors.content && <p className="field-error">{errors.content}</p>}
            </div>
          </div>

          <aside aria-label="Article settings" className="space-y-6 lg:pt-2">
            <CoverImageField
              saved={editable(post)?.coverImage ?? null}
              pendingFile={coverFile}
              removed={coverRemoved}
              alt={form.coverAlt}
              uploadProgress={uploadProgress}
              error={coverError}
              onSelect={(file) => {
                const problem = validateCoverFile(file);
                setCoverError(problem);
                if (!problem) {
                  setCoverFile(file);
                  setCoverRemoved(false);
                  setDirty(true);
                }
              }}
              onRemove={() => {
                setCoverRemoved(true);
                setDirty(true);
              }}
              onUndo={() => {
                setCoverFile(null);
                setCoverRemoved(false);
                setCoverError(null);
              }}
              onAltChange={(alt) => update('coverAlt', alt)}
            />

            <div>
              <label htmlFor="category" className="field-label">
                Category
              </label>
              <select
                id="category"
                className="field text-sm"
                value={form.category}
                aria-invalid={Boolean(errors.category)}
                onChange={(e) => update('category', e.target.value)}
              >
                <option value="">Choose a category</option>
                {categories.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {errors.category && <p className="field-error">{errors.category}</p>}
            </div>

            <div>
              <label htmlFor="tags" className="field-label">
                Tags
              </label>
              <input
                id="tags"
                className="field text-sm"
                value={form.tags}
                placeholder="typography, print"
                aria-invalid={Boolean(errors.tags)}
                aria-describedby="tags-hint"
                onChange={(e) => update('tags', e.target.value)}
              />
              {errors.tags ? (
                <p className="field-error">{errors.tags}</p>
              ) : (
                <p id="tags-hint" className="field-hint">
                  Comma-separated, up to 5.
                </p>
              )}
            </div>

            <div>
              <label htmlFor="excerpt" className="field-label">
                Summary
              </label>
              <textarea
                id="excerpt"
                className="field min-h-24 text-sm"
                maxLength={400}
                value={form.excerpt}
                aria-describedby="excerpt-hint"
                onChange={(e) => update('excerpt', e.target.value)}
              />
              <p id="excerpt-hint" className="field-hint">
                Shown on article cards. Leave empty to use the opening lines.
              </p>
            </div>
          </aside>
        </div>
      )}
      <ConfirmDialog
        open={confirmDiscard}
        title="Discard your unpublished changes?"
        confirmLabel="Discard"
        tone="danger"
        onConfirm={discardChanges}
        onClose={() => setConfirmDiscard(false)}
      >
        The live article stays exactly as it is. This cannot be undone.
      </ConfirmDialog>
    </div>
  );
};
