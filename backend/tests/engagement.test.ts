import { Like, Bookmark } from '../src/models/engagement.model.js';
import { Notification } from '../src/models/notification.model.js';
import { Post } from '../src/models/post.model.js';
import { useTestDatabase, newApp, createUser, createPost } from './helpers.js';

useTestDatabase();

describe('Likes', () => {
  it('likes once, counts once and notifies the author once', async () => {
    const author = await createUser();
    const reader = await createUser();
    const post = await createPost(author.user.id);

    const first = await newApp().put(`/api/v1/posts/${post.id}/like`).set(reader.auth);
    const second = await newApp().put(`/api/v1/posts/${post.id}/like`).set(reader.auth);
    expect(first.body.data).toEqual({ liked: true, likeCount: 1 });
    expect(second.body.data).toEqual({ liked: true, likeCount: 1 });
    expect(await Like.countDocuments()).toBe(1);

    // Unlike and like again: still a single notification
    await newApp().delete(`/api/v1/posts/${post.id}/like`).set(reader.auth);
    await newApp().put(`/api/v1/posts/${post.id}/like`).set(reader.auth);
    expect(await Notification.countDocuments({ recipient: author.user._id, type: 'post_liked' })).toBe(1);
    expect((await Post.findById(post.id))!.likeCount).toBe(1);
  });

  it('is deduplicated by the database even under concurrent requests', async () => {
    const author = await createUser();
    const reader = await createUser();
    const post = await createPost(author.user.id);
    await Promise.all(Array.from({ length: 5 }, () => newApp().put(`/api/v1/posts/${post.id}/like`).set(reader.auth)));
    expect(await Like.countDocuments()).toBe(1);
    expect((await Post.findById(post.id))!.likeCount).toBe(1);
  });

  it('does not let authors like their own articles', async () => {
    const author = await createUser();
    const post = await createPost(author.user.id);
    expect((await newApp().put(`/api/v1/posts/${post.id}/like`).set(author.auth)).status).toBe(400);
  });

  it('refuses likes on unpublished or deleted posts', async () => {
    const author = await createUser();
    const reader = await createUser();
    const draft = await createPost(author.user.id, { status: 'pending_review' });
    const deleted = await createPost(author.user.id, { isDeleted: true });
    for (const post of [draft, deleted]) {
      expect((await newApp().put(`/api/v1/posts/${post.id}/like`).set(reader.auth)).status).toBe(404);
    }
  });

  it('reports the viewer state on the article', async () => {
    const author = await createUser();
    const reader = await createUser();
    const post = await createPost(author.user.id);
    await newApp().put(`/api/v1/posts/${post.id}/like`).set(reader.auth);
    const res = await newApp().get(`/api/v1/posts/${post.slug}`).set(reader.auth);
    expect(res.body.data.viewer).toEqual({ liked: true, bookmarked: false });
    expect((await newApp().get(`/api/v1/posts/${post.slug}`)).body.data.viewer).toEqual({ liked: false, bookmarked: false });
  });
});

describe('Bookmarks', () => {
  it('saves posts uniquely and lists only those still public', async () => {
    const author = await createUser();
    const reader = await createUser();
    const kept = await createPost(author.user.id);
    const later = await createPost(author.user.id);

    await newApp().put(`/api/v1/posts/${kept.id}/bookmark`).set(reader.auth);
    await newApp().put(`/api/v1/posts/${kept.id}/bookmark`).set(reader.auth);
    await newApp().put(`/api/v1/posts/${later.id}/bookmark`).set(reader.auth);
    expect(await Bookmark.countDocuments()).toBe(2);

    await Post.updateOne({ _id: later._id }, { status: 'archived' });
    const res = await newApp().get('/api/v1/posts/saved').set(reader.auth);
    expect(res.body.data.map((p: any) => p._id)).toEqual([kept.id]);
    expect(res.body.meta.total).toBe(1);
  });

  it('removes a bookmark', async () => {
    const author = await createUser();
    const reader = await createUser();
    const post = await createPost(author.user.id);
    await newApp().put(`/api/v1/posts/${post.id}/bookmark`).set(reader.auth);
    await newApp().delete(`/api/v1/posts/${post.id}/bookmark`).set(reader.auth);
    expect(await Bookmark.countDocuments()).toBe(0);
  });
});

describe('Notifications', () => {
  it('reaches the post author when someone comments, but not for their own comments', async () => {
    const author = await createUser();
    const reader = await createUser();
    const post = await createPost(author.user.id);
    await newApp().post(`/api/v1/posts/${post.id}/comments`).set(reader.auth).send({ content: 'Great read' });
    await newApp().post(`/api/v1/posts/${post.id}/comments`).set(author.auth).send({ content: 'Thanks!' });

    const forAuthor = await newApp().get('/api/v1/notifications').set(author.auth);
    expect(forAuthor.body.data).toHaveLength(1);
    expect(forAuthor.body.data[0]).toMatchObject({ type: 'post_commented', isRead: false, actor: { name: reader.user.name } });
    expect((await newApp().get('/api/v1/notifications').set(reader.auth)).body.data).toHaveLength(0);
  });

  it('persists read state, scoped to the recipient', async () => {
    const author = await createUser();
    const reader = await createUser();
    const intruder = await createUser();
    const post = await createPost(author.user.id);
    await newApp().put(`/api/v1/posts/${post.id}/like`).set(reader.auth);
    const [notification] = (await newApp().get('/api/v1/notifications').set(author.auth)).body.data;

    expect((await newApp().patch(`/api/v1/notifications/${notification._id}/read`).set(intruder.auth)).status).toBe(404);
    expect((await newApp().get('/api/v1/notifications/unread-count').set(author.auth)).body.data.unread).toBe(1);

    expect((await newApp().patch(`/api/v1/notifications/${notification._id}/read`).set(author.auth)).status).toBe(200);
    expect((await newApp().get('/api/v1/notifications/unread-count').set(author.auth)).body.data.unread).toBe(0);
    expect((await Notification.findById(notification._id))!.isRead).toBe(true);
  });

  it('marks everything read and filters unread', async () => {
    const author = await createUser();
    const post = await createPost(author.user.id);
    for (let i = 0; i < 3; i++) {
      const reader = await createUser();
      await newApp().put(`/api/v1/posts/${post.id}/like`).set(reader.auth);
    }
    expect((await newApp().get('/api/v1/notifications?unread=true').set(author.auth)).body.data).toHaveLength(3);
    await newApp().patch('/api/v1/notifications/read-all').set(author.auth);
    const res = await newApp().get('/api/v1/notifications?unread=true').set(author.auth);
    expect(res.body.data).toHaveLength(0);
    expect(res.body.meta.unread).toBe(0);
  });

  it('requires authentication', async () => {
    expect((await newApp().get('/api/v1/notifications')).status).toBe(401);
  });
});
