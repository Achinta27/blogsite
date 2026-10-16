import { useEffect, useState, type FormEvent } from 'react';
import { taxonomyApi } from '../../api';
import { errorMessage } from '../../api/client';
import { invalidateCategories } from '../../lib/useCategories';
import { useFetch } from '../../lib/useFetch';
import type { Category } from '../../types';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { ErrorState, LoadingState, Notice } from '../../components/common/States';

type Pending = { kind: 'category'; category: Category } | { kind: 'tag'; tag: string };

export const TaxonomyPage = () => {
  const categories = useFetch(() => taxonomyApi.categories(), []);
  const tags = useFetch(() => taxonomyApi.tags(), []);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [editing, setEditing] = useState<{ id: string; name: string; description: string } | null>(null);
  const [renaming, setRenaming] = useState<{ tag: string; name: string } | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'danger'; text: string } | null>(null);

  useEffect(() => {
    document.title = 'Categories & tags — Margin';
  }, []);

  const attempt = async (work: () => Promise<unknown>, success: string) => {
    setNotice(null);
    try {
      await work();
      invalidateCategories();
      setNotice({ tone: 'ok', text: success });
      categories.reload();
      tags.reload();
      return true;
    } catch (err) {
      setNotice({ tone: 'danger', text: errorMessage(err) });
      return false;
    }
  };

  const create = async (e: FormEvent) => {
    e.preventDefault();
    if (await attempt(() => taxonomyApi.createCategory({ name: name.trim(), description: description.trim() }), `Created “${name.trim()}”.`)) {
      setName('');
      setDescription('');
    }
  };

  const saveEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    if (await attempt(() => taxonomyApi.updateCategory(editing.id, { name: editing.name.trim(), description: editing.description.trim() }), 'Category saved.')) {
      setEditing(null);
    }
  };

  const saveRename = async (e: FormEvent) => {
    e.preventDefault();
    if (!renaming) return;
    if (await attempt(() => taxonomyApi.renameTag(renaming.tag, renaming.name), `Renamed #${renaming.tag}.`)) setRenaming(null);
  };

  const confirmDelete = async () => {
    if (!pending) return;
    if (pending.kind === 'category') await attempt(() => taxonomyApi.deleteCategory(pending.category._id), 'Category deleted.');
    else await attempt(() => taxonomyApi.deleteTag(pending.tag), `Removed #${pending.tag} from every post.`);
    setPending(null);
  };

  return (
    <div>
      <h1 className="font-serif text-3xl font-semibold">Categories &amp; tags</h1>
      {notice && <div className="mt-4"><Notice tone={notice.tone}>{notice.text}</Notice></div>}

      <div className="mt-8 grid gap-10 lg:grid-cols-[1.4fr_1fr]">
        <section aria-labelledby="categories-heading">
          <h2 id="categories-heading" className="font-serif text-xl font-semibold">
            Categories
          </h2>
          <form onSubmit={create} className="card mt-4 grid gap-3 p-4 sm:grid-cols-[1fr_1.5fr_auto] sm:items-end">
            <div>
              <label htmlFor="cat-name" className="field-label">
                Name
              </label>
              <input id="cat-name" className="field text-sm" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
            </div>
            <div>
              <label htmlFor="cat-desc" className="field-label">
                Description
              </label>
              <input id="cat-desc" className="field text-sm" maxLength={200} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <button type="submit" className="btn btn-primary">
              Add
            </button>
          </form>

          {categories.loading && !categories.data ? (
            <LoadingState className="py-10" />
          ) : categories.error ? (
            <ErrorState message={categories.error} onRetry={categories.reload} className="py-10" />
          ) : (
            <ul className="mt-4">
              {categories.data!.map((c) => (
                <li key={c._id} className="border-b border-rule-soft py-3">
                  {editing?.id === c._id ? (
                    <form onSubmit={saveEdit} className="grid gap-2 sm:grid-cols-[1fr_1.5fr_auto]">
                      <label className="sr-only" htmlFor={`edit-name-${c._id}`}>Name</label>
                      <input id={`edit-name-${c._id}`} className="field text-sm" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
                      <label className="sr-only" htmlFor={`edit-desc-${c._id}`}>Description</label>
                      <input id={`edit-desc-${c._id}`} className="field text-sm" value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
                      <div className="flex gap-1">
                        <button type="submit" className="btn btn-primary btn-sm">Save</button>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(null)}>Cancel</button>
                      </div>
                    </form>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-medium">
                          {c.name} <span className="text-xs font-normal text-muted">/{c.slug} · {c.publishedCount ?? 0} published</span>
                        </p>
                        {c.description && <p className="text-sm text-muted">{c.description}</p>}
                      </div>
                      <div className="flex gap-1">
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing({ id: c._id, name: c.name, description: c.description ?? '' })}>
                          Edit
                        </button>
                        <button type="button" className="btn btn-ghost btn-sm text-danger" onClick={() => setPending({ kind: 'category', category: c })}>
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="tags-heading">
          <h2 id="tags-heading" className="font-serif text-xl font-semibold">
            Tags
          </h2>
          <p className="mt-1 text-sm text-muted">Tags on published posts. Renaming to an existing tag merges them.</p>
          {tags.loading && !tags.data ? (
            <LoadingState className="py-10" />
          ) : tags.error ? (
            <ErrorState message={tags.error} onRetry={tags.reload} className="py-10" />
          ) : tags.data!.length === 0 ? (
            <p className="mt-4 text-sm text-muted">No tags in use yet.</p>
          ) : (
            <ul className="mt-4">
              {tags.data!.map(({ tag, count }) => (
                <li key={tag} className="flex flex-wrap items-center justify-between gap-2 border-b border-rule-soft py-2.5">
                  {renaming?.tag === tag ? (
                    <form onSubmit={saveRename} className="flex flex-1 gap-1">
                      <label className="sr-only" htmlFor={`rename-${tag}`}>New name for #{tag}</label>
                      <input id={`rename-${tag}`} className="field py-1 text-sm" value={renaming.name} onChange={(e) => setRenaming({ ...renaming, name: e.target.value })} />
                      <button type="submit" className="btn btn-primary btn-sm">Save</button>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRenaming(null)}>Cancel</button>
                    </form>
                  ) : (
                    <>
                      <span className="text-sm">
                        #{tag} <span className="text-xs text-muted">{count}</span>
                      </span>
                      <span className="flex gap-1">
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRenaming({ tag, name: tag })}>
                          Rename
                        </button>
                        <button type="button" className="btn btn-ghost btn-sm text-danger" onClick={() => setPending({ kind: 'tag', tag })}>
                          Remove
                        </button>
                      </span>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <ConfirmDialog
        open={Boolean(pending)}
        title={pending?.kind === 'category' ? `Delete “${pending.category.name}”?` : `Remove #${pending?.kind === 'tag' ? pending.tag : ''}?`}
        confirmLabel={pending?.kind === 'category' ? 'Delete' : 'Remove'}
        tone="danger"
        onConfirm={confirmDelete}
        onClose={() => setPending(null)}
      >
        {pending?.kind === 'category'
          ? 'Categories still used by any post (including drafts and deleted posts) cannot be deleted.'
          : 'The tag is removed from every post and pending edit.'}
      </ConfirmDialog>
    </div>
  );
};
