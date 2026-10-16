import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { useRealtime } from '../../context/RealtimeContext';
import { timeAgo } from '../../lib/format';
import type { Notification } from '../../types';

export const NotificationBell = () => {
  const { unread, recent, markRead, markAllRead } = useRealtime();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

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

  const openNotification = async (n: Notification) => {
    setOpen(false);
    if (!n.isRead) await markRead(n._id).catch(() => undefined);
    if (n.link) navigate(n.link);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        className="btn btn-ghost relative px-2"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        onClick={() => setOpen((v) => !v)}
      >
        <Bell className="h-5 w-5" aria-hidden />
        {unread > 0 && (
          <span className="absolute right-0.5 top-0.5 min-w-4 rounded-full bg-accent px-1 text-center text-[0.625rem] font-semibold leading-4 text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 z-30 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-[4px] border border-rule bg-card shadow-[0_12px_32px_-16px_rgb(27_26_23/0.35)]"
        >
          <div className="flex items-center justify-between border-b border-rule-soft px-4 py-2.5">
            <p className="text-sm font-medium">Notifications</p>
            {unread > 0 && (
              <button type="button" className="text-xs text-muted hover:text-ink" onClick={() => markAllRead()}>
                Mark all read
              </button>
            )}
          </div>
          {recent.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted">You’re all caught up.</p>
          ) : (
            <ul className="max-h-96 overflow-y-auto">
              {recent.slice(0, 8).map((n) => (
                <li key={n._id}>
                  <button
                    type="button"
                    onClick={() => openNotification(n)}
                    className={`flex w-full gap-3 border-b border-rule-soft px-4 py-3 text-left text-sm hover:bg-paper-deep ${n.isRead ? 'text-ink-soft' : 'text-ink'}`}
                  >
                    <span aria-hidden className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.isRead ? 'bg-transparent' : 'bg-accent'}`} />
                    <span className="min-w-0">
                      <span className="block leading-snug">{n.message}</span>
                      <span className="mt-0.5 block text-xs text-muted">{timeAgo(n.createdAt)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <Link to="/notifications" onClick={() => setOpen(false)} className="block px-4 py-2.5 text-center text-sm text-ink-soft hover:text-ink">
            See all notifications
          </Link>
        </div>
      )}
    </div>
  );
};
