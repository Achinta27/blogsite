import { useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useCategories } from '../../lib/useCategories';
import { Wordmark } from '../common/Wordmark';
import { AccountMenu } from './AccountMenu';
import { NotificationBell } from './NotificationBell';
import { SearchBox } from './SearchBox';

export const SiteHeader = () => {
  const { user, loading } = useAuth();
  const categories = useCategories();
  const location = useLocation();
  const [params] = useSearchParams();
  const urlQuery = params.get('q') ?? '';
  const [searchOpen, setSearchOpen] = useState(false);

  const activeCategory = location.pathname === '/' ? params.get('category') : null;

  return (
    <header className="border-b border-rule bg-paper">
      <div className="wrap flex h-16 items-center justify-between gap-4">
        <Wordmark />

        <div className="flex items-center gap-2 sm:gap-3">
          <div className="hidden w-72 md:block">
            <SearchBox initialQuery={urlQuery} />
          </div>
          <button
            type="button"
            className="btn btn-ghost px-2 md:hidden"
            aria-label={searchOpen ? 'Close search' : 'Search'}
            aria-expanded={searchOpen}
            onClick={() => setSearchOpen((v) => !v)}
          >
            {searchOpen ? <X className="h-5 w-5" /> : <Search className="h-5 w-5" />}
          </button>

          {!loading &&
            (user ? (
              <>
                <Link to="/write" className="btn btn-ghost hidden sm:inline-flex">
                  Write
                </Link>
                <NotificationBell />
                <AccountMenu />
              </>
            ) : (
              <>
                <Link to="/login" className="btn btn-ghost">
                  Sign in
                </Link>
                <Link to="/register" className="btn btn-primary hidden sm:inline-flex">
                  Join Margin
                </Link>
              </>
            ))}
        </div>
      </div>

      {searchOpen && (
        <div className="wrap pb-3 md:hidden">
          <SearchBox initialQuery={urlQuery} autoFocus onNavigate={() => setSearchOpen(false)} />
        </div>
      )}

      <nav aria-label="Sections" className="border-t border-rule-soft">
        <ul className="wrap flex gap-6 overflow-x-auto text-[0.8125rem] [scrollbar-width:none]">
          <li>
            <Link
              to="/"
              className={`block whitespace-nowrap border-b-2 py-2.5 ${
                location.pathname === '/' && !activeCategory && !params.get('q')
                  ? 'border-ink text-ink'
                  : 'border-transparent text-muted hover:text-ink'
              }`}
            >
              Latest
            </Link>
          </li>
          {categories.map((c) => (
            <li key={c._id}>
              <Link
                to={`/?category=${c.slug}`}
                aria-current={activeCategory === c.slug ? 'page' : undefined}
                className={`block whitespace-nowrap border-b-2 py-2.5 ${
                  activeCategory === c.slug ? 'border-ink text-ink' : 'border-transparent text-muted hover:text-ink'
                }`}
              >
                {c.name}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
};
