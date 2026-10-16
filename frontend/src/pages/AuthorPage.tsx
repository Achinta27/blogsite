import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { authorApi, postApi } from '../api';
import { formatDate } from '../lib/format';
import { useFetch } from '../lib/useFetch';
import { Avatar } from '../components/common/Avatar';
import { Pagination } from '../components/common/Pagination';
import { EmptyState, ErrorState, LoadingState } from '../components/common/States';
import { PostRow } from '../components/post/PostCard';

export const AuthorPage = () => {
  const { id = '' } = useParams();
  const [page, setPage] = useState(1);
  const author = useFetch(() => authorApi.get(id), [id]);
  // Published-only by API design: drafts and deleted posts never appear here
  const posts = useFetch(() => postApi.list({ author: id, page, limit: 10 }), [id, page]);

  useEffect(() => {
    if (author.data) document.title = `${author.data.name} — Margin`;
  }, [author.data]);

  if (author.loading) return <LoadingState className="py-32" />;
  if (author.status === 404 || author.status === 400) {
    return (
      <EmptyState title="Author not found" className="py-32" action={<Link to="/" className="btn btn-outline">Back to the front page</Link>} />
    );
  }
  if (author.error || !author.data) return <ErrorState message={author.error ?? 'Not found'} onRetry={author.reload} className="py-32" />;

  const profile = author.data;

  return (
    <div className="wrap py-14">
      <div className="mx-auto max-w-[760px]">
        <header className="flex flex-col items-center border-b border-rule pb-10 text-center">
          <Avatar name={profile.name} src={profile.avatar} size="lg" />
          <h1 className="mt-5 font-serif text-4xl font-semibold tracking-[-0.015em]">{profile.name}</h1>
          {profile.bio && <p className="mt-3 max-w-lg font-serif text-lg leading-relaxed text-ink-soft">{profile.bio}</p>}
          {profile.createdAt && <p className="mt-3 text-xs text-muted">Writing on Margin since {formatDate(profile.createdAt)}</p>}
        </header>

        <section aria-labelledby="author-articles" className="mt-10">
          <h2 id="author-articles" className="kicker mb-2 text-muted">
            Articles{posts.data ? ` · ${posts.data.meta.total}` : ''}
          </h2>
          {posts.loading ? (
            <LoadingState className="py-12" />
          ) : posts.error ? (
            <ErrorState message={posts.error} onRetry={posts.reload} className="py-12" />
          ) : posts.data!.data.length === 0 ? (
            <EmptyState title="No published articles yet" className="py-12" />
          ) : (
            <>
              {posts.data!.data.map((post) => (
                <PostRow key={post._id} post={post} />
              ))}
              <Pagination meta={posts.data!.meta} onPageChange={setPage} className="mt-4" />
            </>
          )}
        </section>
      </div>
    </div>
  );
};
