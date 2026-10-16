import { useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { postApi, taxonomyApi } from '../api';
import { useAuth } from '../context/AuthContext';
import { useCategories } from '../lib/useCategories';
import { useFetch } from '../lib/useFetch';
import { FeaturedPostCard, PostCard } from '../components/post/PostCard';
import { Pagination } from '../components/common/Pagination';
import { EmptyState, ErrorState, LoadingState } from '../components/common/States';

const PAGE_SIZE = 10;

const PopularTags = () => {
  const { data } = useFetch(() => taxonomyApi.tags(), []);
  const tags = (data ?? []).slice(0, 12);
  if (tags.length === 0) return null;
  return (
    <section aria-labelledby="tags-heading" className="mt-16 border-t border-rule pt-8">
      <h2 id="tags-heading" className="kicker text-muted">
        Topics
      </h2>
      <ul className="mt-4 flex flex-wrap gap-2">
        {tags.map(({ tag, count }) => (
          <li key={tag}>
            <Link to={`/?tag=${encodeURIComponent(tag)}`} className="inline-block rounded-[2px] border border-rule bg-card px-2.5 py-1 text-sm text-ink-soft hover:border-ink-soft hover:text-ink">
              #{tag} <span className="text-xs text-muted">{count}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
};

export const HomePage = () => {
  const { user } = useAuth();
  const categories = useCategories();
  const [params, setParams] = useSearchParams();
  const search = params.get('q')?.trim() || undefined;
  const category = params.get('category') || undefined;
  const tag = params.get('tag')?.trim().toLowerCase() || undefined;
  const page = Math.max(1, Number(params.get('page')) || 1);
  const categoryName = categories.find((c) => c.slug === category)?.name ?? category;

  const { data, error, status, loading, reload } = useFetch(
    () => postApi.list({ page, limit: PAGE_SIZE, search, category, tag }),
    [page, search, category, tag]
  );

  const filtered = Boolean(search || category || tag);
  const heading = search ? `Results for “${search}”` : tag ? `#${tag}` : categoryName;

  useEffect(() => {
    document.title = filtered ? `${heading} — Margin` : 'Margin — Considered writing';
  }, [filtered, heading]);

  const goToPage = (next: number) => {
    const updated = new URLSearchParams(params);
    if (next > 1) updated.set('page', String(next));
    else updated.delete('page');
    setParams(updated);
    window.scrollTo({ top: 0 });
  };

  const posts = data?.data ?? [];
  // Feature the newest story only on the unfiltered front page
  const showFeature = !filtered && page === 1 && posts.length > 0;
  const [featured, ...rest] = showFeature ? posts : [undefined, ...posts];

  return (
    <div className="wrap py-10 sm:py-14">
      {filtered && (
        <header className="mb-10 border-b border-rule pb-6">
          <p className="kicker text-muted">{search ? 'Search' : tag ? 'Topic' : 'Section'}</p>
          <h1 className="mt-2 font-serif text-4xl font-semibold tracking-[-0.015em]">{heading}</h1>
          {data && (
            <p className="mt-2 text-sm text-muted">
              {data.meta.total} {data.meta.total === 1 ? 'article' : 'articles'}
            </p>
          )}
        </header>
      )}

      {loading ? (
        <LoadingState label="Loading articles…" />
      ) : status === 404 ? (
        <EmptyState title="Section not found" action={<Link to="/" className="btn btn-outline">Back to the front page</Link>} />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : posts.length === 0 ? (
        filtered ? (
          <EmptyState title="Nothing here yet" action={<Link to="/" className="btn btn-outline">Back to the front page</Link>}>
            {search ? 'No published articles match your search. Try different words.' : 'No articles have been published here yet.'}
          </EmptyState>
        ) : (
          <EmptyState
            title="The first page is still blank"
            action={
              <Link to={user ? '/write' : '/register'} className="btn btn-primary">
                {user ? 'Write the first article' : 'Join and start writing'}
              </Link>
            }
          >
            No articles have been published yet. When an editor approves a submission, it will appear here.
          </EmptyState>
        )
      ) : (
        <>
          {featured && (
            <section aria-label="Featured article" className="mb-14 border-b border-rule pb-14">
              <FeaturedPostCard post={featured} />
            </section>
          )}

          {rest.length > 0 && (
            <section aria-labelledby="latest-heading">
              {showFeature ? (
                <h2 id="latest-heading" className="mb-8 flex items-center gap-4 font-serif text-2xl font-semibold">
                  Latest
                  <span aria-hidden className="h-px flex-1 bg-rule" />
                </h2>
              ) : (
                <h2 id="latest-heading" className="sr-only">
                  Articles
                </h2>
              )}
              <div className="grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
                {rest.map((post) => post && <PostCard key={post._id} post={post} />)}
              </div>
            </section>
          )}

          <Pagination meta={data?.meta} onPageChange={goToPage} className="mt-14" />
        </>
      )}

      {!filtered && <PopularTags />}
    </div>
  );
};
