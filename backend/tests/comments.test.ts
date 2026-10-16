import { Comment } from '../src/models/comment.model.js';
import { AuditLog } from '../src/models/auditLog.model.js';
import { useTestDatabase, newApp, createUser, createStaff, createPost } from './helpers.js';

useTestDatabase();

describe('Comments', () => {
  it('can be added to a published post and listed publicly without exposing emails', async () => {
    const author = await createUser();
    const reader = await createUser();
    const post = await createPost(author.user.id);

    const created = await newApp().post(`/api/v1/posts/${post.id}/comments`).set(reader.auth).send({ content: '  Lovely piece.  ' });
    expect(created.status).toBe(201);
    expect(created.body.data.content).toBe('Lovely piece.');

    const list = await newApp().get(`/api/v1/posts/${post.id}/comments`);
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].author.name).toBe(reader.user.name);
    expect(list.body.data[0].author.email).toBeUndefined();
  });

  it('takes the author from the token, not the request body', async () => {
    const author = await createUser();
    const reader = await createUser();
    const post = await createPost(author.user.id);
    const res = await newApp()
      .post(`/api/v1/posts/${post.id}/comments`)
      .set(reader.auth)
      .send({ content: 'Hi', author: author.user.id });
    expect(res.status).toBe(400);
    expect(await Comment.countDocuments()).toBe(0);
  });

  it('rejects empty or whitespace-only comments', async () => {
    const author = await createUser();
    const post = await createPost(author.user.id);
    for (const content of ['', '   ', '\u0000\u0007']) {
      const res = await newApp().post(`/api/v1/posts/${post.id}/comments`).set(author.auth).send({ content });
      expect(res.status).toBe(400);
    }
  });

  it('cannot be added to drafts or deleted posts, which also expose no comments', async () => {
    const author = await createUser();
    const draft = await createPost(author.user.id, { status: 'draft' });
    const deleted = await createPost(author.user.id, { isDeleted: true, deletedAt: new Date() });
    await Comment.create({ post: deleted.id, author: author.user.id, content: 'Before deletion' });

    for (const post of [draft, deleted]) {
      expect((await newApp().post(`/api/v1/posts/${post.id}/comments`).set(author.auth).send({ content: 'Hi' })).status).toBe(404);
      expect((await newApp().get(`/api/v1/posts/${post.id}/comments`)).status).toBe(404);
    }
  });

  it('requires authentication to comment', async () => {
    const author = await createUser();
    const post = await createPost(author.user.id);
    expect((await newApp().post(`/api/v1/posts/${post.id}/comments`).send({ content: 'Hi' })).status).toBe(401);
  });

  describe('ownership', () => {
    const setup = async () => {
      const author = await createUser();
      const commenter = await createUser();
      const other = await createUser();
      const admin = await createUser({ role: 'admin' });
      const post = await createPost(author.user.id);
      const comment = await Comment.create({ post: post.id, author: commenter.user.id, content: 'Original' });
      return { commenter, other, admin, comment };
    };

    it('lets the author edit and delete their own comment', async () => {
      const { commenter, comment } = await setup();
      const edit = await newApp().patch(`/api/v1/comments/${comment.id}`).set(commenter.auth).send({ content: 'Edited' });
      expect(edit.status).toBe(200);
      expect(edit.body.data.content).toBe('Edited');
      expect((await newApp().delete(`/api/v1/comments/${comment.id}`).set(commenter.auth)).status).toBe(200);
      expect(await Comment.countDocuments()).toBe(0);
    });

    it("prevents other users from editing or deleting someone else's comment", async () => {
      const { other, comment } = await setup();
      expect((await newApp().patch(`/api/v1/comments/${comment.id}`).set(other.auth).send({ content: 'Hacked' })).status).toBe(403);
      expect((await newApp().delete(`/api/v1/comments/${comment.id}`).set(other.auth)).status).toBe(403);
      expect((await Comment.findById(comment.id))!.content).toBe('Original');
    });

    it('lets admins delete (moderate) but not rewrite comments', async () => {
      const { admin, comment } = await setup();
      expect((await newApp().patch(`/api/v1/comments/${comment.id}`).set(admin.auth).send({ content: 'Rewritten' })).status).toBe(403);
      expect((await newApp().delete(`/api/v1/comments/${comment.id}`).set(admin.auth)).status).toBe(200);
    });

    it('returns 404 for unknown comments', async () => {
      const { commenter } = await setup();
      expect((await newApp().delete(`/api/v1/comments/${'a'.repeat(24)}`).set(commenter.auth)).status).toBe(404);
    });
  });

  describe('staff moderation', () => {
    it('lets staff with comments.moderate remove comments, audited with the reason', async () => {
      const author = await createUser();
      const moderator = await createStaff(['comments.moderate']);
      const post = await createPost(author.user.id);
      const comment = await Comment.create({ post: post.id, author: author.user.id, content: 'Spam spam spam' });

      const res = await newApp().delete(`/api/v1/comments/${comment.id}`).set(moderator.auth).send({ reason: 'Spam' });
      expect(res.status).toBe(200);
      const log = await AuditLog.findOne({ action: 'comment.moderated' }).lean();
      expect(log).toMatchObject({ actorRole: 'staff', reason: 'Spam', resourceId: comment.id });
    });

    it('denies staff without comments.moderate', async () => {
      const author = await createUser();
      const reviewer = await createStaff(['posts.review']);
      const post = await createPost(author.user.id);
      const comment = await Comment.create({ post: post.id, author: author.user.id, content: 'Fine comment' });
      expect((await newApp().delete(`/api/v1/comments/${comment.id}`).set(reviewer.auth)).status).toBe(403);
      expect((await newApp().get('/api/v1/moderation/comments').set(reviewer.auth)).status).toBe(403);
    });

    it('lists comments with their post for moderators', async () => {
      const author = await createUser();
      const moderator = await createStaff(['comments.moderate']);
      const post = await createPost(author.user.id, { title: 'Commented article' });
      await Comment.create({ post: post.id, author: author.user.id, content: 'Needs moderation' });
      const res = await newApp().get('/api/v1/moderation/comments?search=moderation').set(moderator.auth);
      expect(res.body.data[0]).toMatchObject({ content: 'Needs moderation', post: { title: 'Commented article' } });
    });
  });
});
