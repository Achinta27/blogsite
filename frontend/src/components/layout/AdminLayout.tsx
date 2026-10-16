import { Suspense } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useRealtime } from '../../context/RealtimeContext';
import { visibleNav } from '../../lib/workspaceNav';
import { Wordmark } from '../common/Wordmark';
import { LoadingState } from '../common/States';
import { NotificationBell } from './NotificationBell';

export const AdminLayout = () => {
  const { user } = useAuth();
  const { connected } = useRealtime();
  const items = visibleNav(user);

  return (
    <div className="min-h-screen">
      <header className="border-b border-rule bg-paper">
        <div className="wrap flex h-16 items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Wordmark to="/admin" />
            <span className="kicker hidden text-muted sm:inline">{user?.role === 'admin' ? 'Administration' : 'Editorial'}</span>
          </div>
          <div className="flex items-center gap-2 text-sm sm:gap-3">
            <span
              className={`hidden items-center gap-1.5 text-xs sm:inline-flex ${connected ? 'text-ok' : 'text-muted'}`}
              title={connected ? 'Receiving live updates' : 'Live updates paused; reconnecting'}
            >
              <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-ok' : 'bg-rule'}`} />
              {connected ? 'Live' : 'Offline'}
            </span>
            <NotificationBell />
            <Link to="/" className="btn btn-outline btn-sm">
              View site
            </Link>
          </div>
        </div>
        <nav aria-label="Workspace" className="border-t border-rule-soft">
          <ul className="wrap flex gap-6 overflow-x-auto text-[0.8125rem] [scrollbar-width:none]">
            {items.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `block whitespace-nowrap border-b-2 py-2.5 ${isActive ? 'border-ink text-ink' : 'border-transparent text-muted hover:text-ink'}`
                  }
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <main id="main" className="wrap py-10">
        <Suspense fallback={<LoadingState />}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
};
