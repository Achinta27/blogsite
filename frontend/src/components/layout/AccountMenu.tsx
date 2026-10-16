import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Avatar } from '../common/Avatar';
import { hasWorkspace } from '../../lib/permissions';

export const AccountMenu = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!user) return null;

  const item = 'block px-4 py-2 text-sm text-ink-soft hover:bg-paper-deep hover:text-ink';

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="flex items-center rounded-full"
        onClick={() => setOpen((v) => !v)}
      >
        <Avatar name={user.name} src={user.avatar} size="sm" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-2 w-56 rounded-[4px] border border-rule bg-card py-1.5 shadow-[0_12px_32px_-16px_rgb(27_26_23/0.35)]"
          onClick={() => setOpen(false)}
        >
          <div className="border-b border-rule-soft px-4 pb-2.5 pt-1.5">
            <p className="truncate text-sm font-medium text-ink">{user.name}</p>
            <p className="truncate text-xs text-muted">{user.email}</p>
          </div>
          <div className="py-1">
            <Link role="menuitem" to="/write" className={item}>
              Write an article
            </Link>
            <Link role="menuitem" to="/dashboard" className={item}>
              Your articles
            </Link>
            <Link role="menuitem" to="/saved" className={item}>
              Saved articles
            </Link>
            <Link role="menuitem" to="/notifications" className={item}>
              Notifications
            </Link>
            <Link role="menuitem" to={`/authors/${user._id}`} className={item}>
              Public profile
            </Link>
            <Link role="menuitem" to="/settings" className={item}>
              Settings
            </Link>
            {hasWorkspace(user) && (
              <Link role="menuitem" to="/admin" className={item}>
                {user.role === 'admin' ? 'Administration' : 'Editorial workspace'}
              </Link>
            )}
          </div>
          <div className="border-t border-rule-soft pt-1">
            <button
              role="menuitem"
              type="button"
              className={`${item} w-full text-left`}
              onClick={async () => {
                await logout();
                navigate('/');
              }}
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
