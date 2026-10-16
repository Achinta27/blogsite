import type { Server } from 'socket.io';

/**
 * The single place where server-side code pushes live events. Services call these helpers
 * after their database writes have committed; MongoDB stays the source of truth and REST
 * stays the only way to change data. Without a Socket.IO server (tests, scripts) every
 * call is a no-op.
 *
 * Rooms are joined only by the server (see socket/index.ts):
 *   user:<id>     one user's private events (notifications)
 *   moderation    admins and staff holding posts.review
 *   admin         administrators (dashboard activity)
 *   post:<id>     readers of one published post (live comments)
 */
let io: Server | null = null;

export const rooms = {
  user: (id: string) => `user:${id}`,
  post: (id: string) => `post:${id}`,
  moderation: 'moderation',
  admin: 'admin',
};

export const realtime = {
  attach(server: Server | null) {
    io = server;
  },
  toUser(userId: string, event: string, payload: unknown) {
    io?.to(rooms.user(userId)).emit(event, payload);
  },
  toModerators(event: string, payload: unknown) {
    io?.to(rooms.moderation).emit(event, payload);
  },
  toAdmins(event: string, payload: unknown) {
    io?.to(rooms.admin).emit(event, payload);
  },
  toPostReaders(postId: string, event: string, payload: unknown) {
    io?.to(rooms.post(postId)).emit(event, payload);
  },
  /** Forces a user's sockets to reconnect, re-authenticating and recomputing their rooms. */
  disconnectUser(userId: string) {
    io?.in(rooms.user(userId)).disconnectSockets(true);
  },
  /** Removes everyone from a post room (post unpublished, archived or deleted). */
  closePostRoom(postId: string) {
    io?.in(rooms.post(postId)).socketsLeave(rooms.post(postId));
  },
};
