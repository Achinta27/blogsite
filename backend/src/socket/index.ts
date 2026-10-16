import type { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { Types } from 'mongoose';
import { ENV } from '../config/env.js';
import { hasPermission } from '../config/permissions.js';
import { resolveAccessToken, type AuthUser } from '../middlewares/auth.middleware.js';
import { Post } from '../models/post.model.js';
import { AppError } from '../utils/apiError.js';
import { realtime, rooms } from './realtime.js';

interface SocketData {
  user: AuthUser;
  expiryTimer?: NodeJS.Timeout;
}

type Ack = (response: { ok: boolean; error?: string }) => void;

/**
 * Socket.IO only delivers events; it never changes data. The single client-to-server
 * capability is joining or leaving the room of a published post. Everything privileged
 * (approving, permissions, comments) goes through the authorised REST API.
 */
export const initSocket = (httpServer: HttpServer): Server => {
  const io = new Server<Record<string, never>, Record<string, never>, Record<string, never>, SocketData>(httpServer, {
    cors: {
      origin: ENV.IS_PRODUCTION ? ENV.CLIENT_ORIGINS : [...ENV.CLIENT_ORIGINS, 'http://localhost:5173'],
      credentials: true,
    },
  });

  // Authenticate during the handshake with the same access token the REST API accepts.
  // Role and permissions are loaded from the database, never taken from the client.
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (typeof token !== 'string' || !token) throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
      const { exp, ...user } = await resolveAccessToken(token);
      socket.data.user = user;
      // Drop the connection when the token expires; the client refreshes and reconnects
      if (exp) socket.data.expiryTimer = setTimeout(() => socket.disconnect(true), Math.max(0, exp * 1000 - Date.now()));
      next();
    } catch (error) {
      next(new Error(error instanceof AppError ? error.code : 'UNAUTHORIZED'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const user = (socket.data as SocketData).user;

    // Server-controlled rooms derived from the authenticated identity
    socket.join(rooms.user(user.userId));
    if (hasPermission(user, 'posts.review')) socket.join(rooms.moderation);
    if (user.role === 'admin') socket.join(rooms.admin);

    socket.on('post:join', async (payload: unknown, ack?: Ack) => {
      const reply = typeof ack === 'function' ? ack : () => undefined;
      const postId = (payload as { postId?: unknown } | null)?.postId;
      if (typeof postId !== 'string' || !Types.ObjectId.isValid(postId)) return reply({ ok: false, error: 'INVALID_POST' });
      const visible = await Post.exists({ _id: postId, status: 'published', isDeleted: false });
      if (!visible) return reply({ ok: false, error: 'NOT_FOUND' });
      // A reader follows one post at a time
      for (const room of socket.rooms) if (room.startsWith('post:')) socket.leave(room);
      socket.join(rooms.post(postId));
      reply({ ok: true });
    });

    socket.on('post:leave', (payload: unknown) => {
      const postId = (payload as { postId?: unknown } | null)?.postId;
      if (typeof postId === 'string') socket.leave(rooms.post(postId));
    });

    socket.on('disconnect', () => clearTimeout((socket.data as SocketData).expiryTimer));
  });

  realtime.attach(io as unknown as Server);
  return io as unknown as Server;
};
