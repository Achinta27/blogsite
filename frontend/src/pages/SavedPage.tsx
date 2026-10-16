import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { postApi } from '../api';
import { useFetch } from '../lib/useFetch';
import { PostRow } from '../components/post/PostCard';
import { Pagination } from '../components/common/Pagination';
import { EmptyState, ErrorState, LoadingState } from '../components/common/States';

export const SavedPage = () => {
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useFetch(() => postApi.saved(page), [page]);

  useEffect(() => {
    document.title = 'Saved — Margin';
  }, []);

  return (
    <div className="wrap py-12">
      <div className="mx-auto max-w-[760px]">
        <p className="kicker text-muted">Reading list</p>
        <h1 className="mt-2 border-b border-rule pb-6 font-serif text-4xl font-semibold tracking-[-0.015em]">Saved articles</h1>
        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : data!.data.length === 0 ? (
          <EmptyState title="Nothing saved yet" action={<Link to="/" className="btn btn-outline">Browse articles</Link>}>
            Use “Save” on any article to keep it here for later.
          </EmptyState>
        ) : (
          <>
            {data!.data.map((post) => (
              <PostRow key={post._id} post={post} />
            ))}
            <Pagination meta={data!.meta} onPageChange={setPage} className="mt-4" />
          </>
        )}
      </div>
    </div>
  );
};
