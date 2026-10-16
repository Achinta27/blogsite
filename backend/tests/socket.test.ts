import http from 'http';
import type { AddressInfo } from 'net';
import jwt from 'jsonwebtoken';
import { io as connect, Socket } from 'socket.io-client';
import request from 'supertest';
import { Server } from 'socket.io';
import { createApp } from '../src/app.js';
import { initSocket } from '../src/socket/index.js';
import { realtime } from '../src/socket/realtime.js';
import { Post } from '../src/models/post.model.js';
import { User } from '../src/models/user.model.js';
import { useTestDatabase, createUser, createStaff, createPost } from './helpers.js';

useTestDatabase();

let server: http.Server;
let io: Server;
let url: string;
const app = createApp();
const sockets: Socket[] = [];

beforeAll(async () => {
  server = http.createServer(app);
  io = initSocket(server);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(() => {
  sockets.splice(0).forEach((s) => s.disconnect());
});

afterAll(async () => {
  realtime.attach(null);
  io.close();
  await new Promise((resolve) => server.close(resolve));
});

const api = () => request(server);

const open = (token?: string, autoConnect = true) => {
  const socket = connect(url, { auth: token ? { token } : {}, transports: ['websocket'], reconnection: false, autoConnect });
  sockets.push(socket);
  return socket;
};

const connected = (socket: Socket) =>
  new Promise<void>((resolve, reject) => {
    if (socket.connected) return resolve();
    socket.once('connect', () => resolve());
    socket.once('connect_error', reject);
  });

const nextEvent = <T = any>(socket: Socket, event: string, timeout = 3000) =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`No "${event}" within ${timeout}ms`)), timeout);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });

/** Collects events for a short window; used to prove something was NOT delivered. */
const collect = (socket: Socket, event: string) => {
  const received: unknown[] = [];
  socket.on(event, (payload) => received.push(payload));
  return received;
};
const settle = (ms = 400) => new Promise((resolve) => setTimeout(resolve, ms));

const join = (socket: Socket, postId: string) =>
  new Promise<{ ok: boolean; error?: string }>((resolve) => socket.emit('post:join', { postId }, resolve));

describe('Socket authentication', () => {
  it('rejects connections without a token', async () => {
    await expect(connected(open())).rejects.toThrow('UNAUTHORIZED');
  });

  it('rejects forged and expired tokens', async () => {
    const { user } = await createUser();
    const forged = jwt.sign({ userId: user.id }, 'not-the-real-secret-not-the-real-secret');
    const expired = jwt.sign({ userId: user.id }, process.env.JWT_ACCESS_SECRET!, { expiresIn: -10 });
    await expect(connected(open(forged))).rejects.toThrow('INVALID_TOKEN');
    await expect(connected(open(expired))).rejects.toThrow('TOKEN_EXPIRED');
  });

  it('rejects deactivated accounts', async () => {
    const { token } = await createUser({ isActive: false });
    await expect(connected(open(token))).rejects.toThrow('ACCOUNT_DISABLED');
  });

  it('disconnects the socket when the access token expires', async () => {
    const { user } = await createUser();
    const shortLived = jwt.sign({ userId: user.id }, process.env.JWT_ACCESS_SECRET!, { expiresIn: 1 });
    const socket = open(shortLived);
    await connected(socket);
    const reason = await nextEvent<string>(socket, 'disconnect', 3000);
    expect(reason).toBe('io server disconnect');
  });
});

describe('Private notifications', () => {
  it('reach only their recipient', async () => {
    const author = await createUser();
    const reader = await createUser();
    const bystander = await createUser();
    const post = await createPost(author.user.id);

    const authorSocket = open(author.token);
    const bystanderSocket = open(bystander.token);
    await Promise.all([connected(authorSocket), connected(bystanderSocket)]);
    const leaked = collect(bystanderSocket, 'notification:new');

    const incoming = nextEvent(authorSocket, 'notification:new');
    await api().put(`/api/v1/posts/${post.id}/like`).set(reader.auth);
    expect(await incoming).toMatchObject({ type: 'post_liked', recipient: author.user.id, isRead: false });
    await settle();
    expect(leaked).toHaveLength(0);
  });

  it('are recoverable through REST after being missed while offline', async () => {
    const author = await createUser();
    const reader = await createUser();
    const post = await createPost(author.user.id);

    // Author is not connected when the comment arrives
    await api().post(`/api/v1/posts/${post.id}/comments`).set(reader.auth).send({ content: 'Missed this live' });

    const socket = open(author.token);
    await connected(socket);
    const res = await api().get('/api/v1/notifications?unread=true').set(author.auth);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].type).toBe('post_commented');
  });

  it('delivers each event once after a reconnect', async () => {
    const author = await createUser();
    const post = await createPost(author.user.id);
    const socket = open(author.token, false);
    const received = collect(socket, 'notification:new');

    socket.connect();
    await connected(socket);
    socket.disconnect();
    socket.connect();
    await connected(socket);

    const reader = await createUser();
    await api().put(`/api/v1/posts/${post.id}/like`).set(reader.auth);
    await settle();
    expect(received).toHaveLength(1);
  });
});

describe('Moderation room', () => {
  it('delivers submissions to admins and reviewers only', async () => {
    const admin = await createUser({ role: 'admin' });
    const reviewer = await createStaff(['posts.review']);
    const otherStaff = await createStaff(['comments.moderate']);
    const regular = await createUser();
    const author = await createUser();
    const draft = await createPost(author.user.id, { status: 'draft' });

    const [a, r, o, u] = [admin, reviewer, otherStaff, regular].map((x) => open(x.token));
    await Promise.all([a, r, o, u].map(connected));
    const leakedToStaff = collect(o, 'post:submitted');
    const leakedToUser = collect(u, 'post:submitted');

    const toAdmin = nextEvent(a, 'post:submitted');
    const toReviewer = nextEvent(r, 'post:submitted');
    await api().post(`/api/v1/posts/${draft.id}/submit`).set(author.auth);

    expect(await toAdmin).toMatchObject({ postId: draft.id, kind: 'post' });
    expect(await toReviewer).toMatchObject({ postId: draft.id });
    await settle();
    expect(leakedToStaff).toHaveLength(0);
    expect(leakedToUser).toHaveLength(0);
  });

  it('cannot be joined by asking for it, and socket events cannot approve posts', async () => {
    const regular = await createUser();
    const author = await createUser();
    const pending = await createPost(author.user.id, { status: 'pending_review' });
    const socket = open(regular.token);
    await connected(socket);

    // Unknown or privileged event names are simply ignored by the server
    socket.emit('join', 'moderation');
    socket.emit('post:approve', { postId: pending.id });
    socket.emit('moderation:approve', { postId: pending.id });
    expect(await join(socket, pending.id)).toEqual({ ok: false, error: 'NOT_FOUND' });

    const leaked = collect(socket, 'post:submitted');
    const draft = await createPost(author.user.id, { status: 'draft' });
    await api().post(`/api/v1/posts/${draft.id}/submit`).set(author.auth);
    await settle();

    expect(leaked).toHaveLength(0);
    expect((await Post.findById(pending.id))!.status).toBe('pending_review');
  });

  it('drops a staff member from the room as soon as posts.review is revoked', async () => {
    const admin = await createUser({ role: 'admin' });
    const staff = await createStaff(['posts.review']);
    const socket = open(staff.token);
    await connected(socket);

    const dropped = nextEvent<string>(socket, 'disconnect');
    await api().put(`/api/v1/admin/users/${staff.user.id}/permissions`).set(admin.auth).send({ permissions: [] });
    expect(await dropped).toBe('io server disconnect');

    // Reconnecting re-reads permissions: no more moderation events
    socket.connect();
    await connected(socket);
    const leaked = collect(socket, 'post:submitted');
    const author = await createUser();
    const draft = await createPost(author.user.id, { status: 'draft' });
    await api().post(`/api/v1/posts/${draft.id}/submit`).set(author.auth);
    await settle();
    expect(leaked).toHaveLength(0);
    expect((await User.findById(staff.user.id))!.permissions).toEqual([]);
  });

  it('tells the author the outcome live', async () => {
    const admin = await createUser({ role: 'admin' });
    const author = await createUser();
    const pending = await createPost(author.user.id, { status: 'pending_review' });
    const socket = open(author.token);
    await connected(socket);

    const outcome = nextEvent(socket, 'post:rejected');
    await api().post(`/api/v1/moderation/posts/${pending.id}/reject`).set(admin.auth).send({ reason: 'Please cite your sources.' });
    expect(await outcome).toMatchObject({ postId: pending.id, reason: 'Please cite your sources.' });
  });
});

describe('Post rooms', () => {
  it('stream comment events to readers of that post only', async () => {
    const author = await createUser();
    const readerA = await createUser();
    const readerB = await createUser();
    const elsewhere = await createUser();
    const post = await createPost(author.user.id);
    const other = await createPost(author.user.id);

    const [a, b, e] = [readerA, readerB, elsewhere].map((x) => open(x.token));
    await Promise.all([a, b, e].map(connected));
    expect(await join(a, post.id)).toEqual({ ok: true });
    expect(await join(b, post.id)).toEqual({ ok: true });
    expect(await join(e, other.id)).toEqual({ ok: true });
    const leaked = collect(e, 'comment:created');

    const toB = nextEvent(b, 'comment:created');
    const res = await api().post(`/api/v1/posts/${post.id}/comments`).set(readerA.auth).send({ content: 'Live!' });
    const event = await toB;
    expect(event).toMatchObject({ postId: post.id, comment: { _id: res.body.data._id, content: 'Live!' } });
    expect(event.comment.author.email).toBeUndefined();

    const deleted = nextEvent(b, 'comment:deleted');
    await api().delete(`/api/v1/comments/${res.body.data._id}`).set(readerA.auth);
    expect(await deleted).toEqual({ postId: post.id, commentId: res.body.data._id });

    await settle();
    expect(leaked).toHaveLength(0);
  });

  it('refuse invalid ids and unpublished posts', async () => {
    const author = await createUser();
    const socket = open(author.token);
    await connected(socket);
    const draft = await createPost(author.user.id, { status: 'draft' });
    expect(await join(socket, 'not-an-id')).toEqual({ ok: false, error: 'INVALID_POST' });
    // Even the author cannot open a live room for a draft
    expect(await join(socket, draft.id)).toEqual({ ok: false, error: 'NOT_FOUND' });
  });
});
