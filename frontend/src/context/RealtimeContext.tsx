import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { getAccessToken } from '../api/client';
import { notificationApi } from '../api';
import type { Notification } from '../types';

interface RealtimeValue {
  socket: Socket | null;
  connected: boolean;
  unread: number;
  /** Most recent notifications, newest first, without duplicates. */
  recent: Notification[];
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
}

const RealtimeContext = createContext<RealtimeValue | undefined>(undefined);

// Same origin by default (Vite proxies /socket.io in development)
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || undefined;
const RECENT_LIMIT = 20;

const mergeUnique = (incoming: Notification[], current: Notification[]) => {
  const seen = new Set<string>();
  return [...incoming, ...current]
    .filter((n) => (seen.has(n._id) ? false : (seen.add(n._id), true)))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, RECENT_LIMIT);
};

/**
 * One authenticated socket per signed-in user. Socket events are a live convenience only:
 * on every (re)connect the notification list and unread count are re-read over REST, so
 * anything missed while offline appears, and records are de-duplicated by id.
 */
export const RealtimeProvider = ({ children }: { children: ReactNode }) => {
  const { user, restoreSession } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [unread, setUnread] = useState(0);
  const [recent, setRecent] = useState<Notification[]>([]);
  const retrying = useRef(false);
  // Ids already counted, so a re-delivered event never bumps the badge twice
  const seen = useRef(new Set<string>());
  const userId = user?._id;

  useEffect(() => {
    if (!userId) {
      seen.current.clear();
      setRecent([]);
      setUnread(0);
      return;
    }

    const s = io(SOCKET_URL, {
      // Called on every handshake, so reconnects always present the current access token
      auth: (cb) => cb({ token: getAccessToken() }),
      transports: ['websocket', 'polling'],
      withCredentials: true,
    });

    const resync = async () => {
      try {
        const [list, count] = await Promise.all([notificationApi.list({ page: 1 }), notificationApi.unreadCount()]);
        list.data.forEach((n) => seen.current.add(n._id));
        setRecent((current) => mergeUnique(list.data, current));
        setUnread(count.unread);
      } catch {
        // The bell keeps its last known state; the next reconnect retries
      }
    };

    // Refresh the session (which also reloads role and permissions), then reconnect
    const reauthenticate = async () => {
      if (retrying.current) return;
      retrying.current = true;
      try {
        if (await restoreSession()) s.connect();
      } finally {
        retrying.current = false;
      }
    };

    s.on('connect', () => {
      setConnected(true);
      void resync();
    });
    s.on('disconnect', (reason) => {
      setConnected(false);
      // The server drops sockets on token expiry and on role/permission changes
      if (reason === 'io server disconnect') setTimeout(reauthenticate, 300);
    });
    s.on('connect_error', (error) => {
      if (['TOKEN_EXPIRED', 'INVALID_TOKEN', 'UNAUTHORIZED'].includes(error.message)) void reauthenticate();
    });
    s.on('notification:new', (notification: Notification) => {
      if (seen.current.has(notification._id)) return;
      seen.current.add(notification._id);
      setRecent((current) => mergeUnique([notification], current));
      if (!notification.isRead) setUnread((u) => u + 1);
    });
    s.on('notification:read', (payload: { ids?: string[]; all?: boolean }) => {
      setRecent((current) => current.map((n) => (payload.all || payload.ids?.includes(n._id) ? { ...n, isRead: true } : n)));
      if (payload.all) setUnread(0);
      else void notificationApi.unreadCount().then((c) => setUnread(c.unread)).catch(() => undefined);
    });

    setSocket(s);
    return () => {
      s.removeAllListeners();
      s.disconnect();
      setSocket(null);
      setConnected(false);
    };
  }, [userId, restoreSession]);

  const markRead = useCallback(async (id: string) => {
    await notificationApi.markRead(id);
    setRecent((current) => current.map((n) => (n._id === id ? { ...n, isRead: true } : n)));
    setUnread((u) => Math.max(0, u - 1));
  }, []);

  const markAllRead = useCallback(async () => {
    await notificationApi.markAllRead();
    setRecent((current) => current.map((n) => ({ ...n, isRead: true })));
    setUnread(0);
  }, []);

  const value = useMemo(
    () => ({ socket, connected, unread, recent, markRead, markAllRead }),
    [socket, connected, unread, recent, markRead, markAllRead]
  );
  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
};

// eslint-disable-next-line react-refresh/only-export-components
export const useRealtime = () => {
  const context = useContext(RealtimeContext);
  if (!context) throw new Error('useRealtime must be used within a RealtimeProvider');
  return context;
};

/** Subscribes to a socket event for the lifetime of the calling component. */
// eslint-disable-next-line react-refresh/only-export-components
export const useSocketEvent = <T,>(event: string, handler: (payload: T) => void) => {
  const { socket } = useRealtime();
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  });
  useEffect(() => {
    if (!socket) return;
    const listener = (payload: T) => handlerRef.current(payload);
    socket.on(event, listener);
    return () => {
      socket.off(event, listener);
    };
  }, [socket, event]);
};
