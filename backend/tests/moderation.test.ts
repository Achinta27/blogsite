import { Post } from '../src/models/post.model.js';
import { AuditLog } from '../src/models/auditLog.model.js';
import { Notification } from '../src/models/notification.model.js';
import { AuditService } from '../src/services/audit.service.js';
import { useTestDatabase, newApp, createUser, createStaff, createPost } from './helpers.js';

useTestDatabase();

const approve = (id: string, auth: Record<string, string>) => newApp().post(`/api/v1/moderation/posts/${id}/approve`).set(auth);
const reject = (id: string, auth: Record<string, string>, reason = 'Please add sources for the statistics you cite.') =>
  newApp().post(`/api/v1/moderation/posts/${id}/reject`).set(auth).send({ reason });

describe('Moderation permissions', () => {
  it('keeps regular users and guests out of the queue', async () => {
    const { auth } = await createUser();
    expect((await newApp().get('/api/v1/moderation/posts')).status).toBe(401);
    expect((await newApp().get('/api/v1/moderation/posts').set(auth)).status).toBe(403);
  });

  it('requires posts.review to see the queue', async () => {
    const without = await createStaff(['comments.moderate']);
    const withReview = await createStaff(['posts.review']);
    expect((await newApp().get('/api/v1/moderation/posts').set(without.auth)).status).toBe(403);
    expect((await newApp().get('/api/v1/moderation/posts').set(withReview.auth)).status).toBe(200);
  });

  it('does not let staff without posts.approve approve, even by calling the API directly', async () => {
    const author = await createUser();
    const reviewer = await createStaff(['posts.review', 'posts.reject']);
    const post = await createPost(author.user.id, { status: 'pending_review' });
    const res = await approve(post.id, reviewer.auth);
    expect(res.status).toBe(403);
    expect((await Post.findById(post.id))!.status).toBe('pending_review');
  });

  it('does not let staff without posts.reject reject', async () => {
    const author = await createUser();
    const approver = await createStaff(['posts.review', 'posts.approve']);
    const post = await createPost(author.user.id, { status: 'pending_review' });
    expect((await reject(post.id, approver.auth)).status).toBe(403);
  });

  it('does not let a regular user approve their own submission', async () => {
    const author = await createUser();
    const post = await createPost(author.user.id, { status: 'pending_review' });
    expect((await approve(post.id, author.auth)).status).toBe(403);
  });

  it('enforces a revoked permission on the very next request', async () => {
    const admin = await createUser({ role: 'admin' });
    const staff = await createStaff(['posts.review', 'posts.approve']);
    const author = await createUser();
    const first = await createPost(author.user.id, { status: 'pending_review' });
    const second = await createPost(author.user.id, { status: 'pending_review' });

    expect((await approve(first.id, staff.auth)).status).toBe(200);
    await newApp().put(`/api/v1/admin/users/${staff.user.id}/permissions`).set(admin.auth).send({ permissions: ['posts.review'] });
    // Same, still unexpired access token
    expect((await approve(second.id, staff.auth)).status).toBe(403);
  });

  it('stops staff from reviewing their own articles', async () => {
    const staff = await createStaff(['posts.review', 'posts.approve']);
    const post = await createPost(staff.user.id, { status: 'pending_review' });
    expect((await approve(post.id, staff.auth)).status).toBe(403);
  });
});

describe('Approving and rejecting', () => {
  it('publishes an approved submission and records who approved it', async () => {
    const author = await createUser();
    const staff = await createStaff(['posts.review', 'posts.approve']);
    const post = await createPost(author.user.id, { status: 'pending_review' });

    const res = await approve(post.id, staff.auth);
    expect(res.status).toBe(200);
    const saved = (await Post.findById(post.id))!;
    expect(saved.status).toBe('published');
    expect(saved.publishedAt).toBeInstanceOf(Date);
    expect(String(saved.reviewedBy)).toBe(staff.user.id);

    const log = await AuditLog.findOne({ action: 'post.approved', resourceId: post.id }).lean();
    expect(log).toMatchObject({
      actorRole: 'staff',
      previousState: { status: 'pending_review', kind: 'post' },
      newState: { status: 'published' },
    });
    expect(String(log!.actor)).toBe(staff.user.id);
    expect(log!.requestId).toEqual(expect.any(String));

    expect((await newApp().get(`/api/v1/posts/${post.slug}`)).status).toBe(200);
  });

  it('requires a reason to reject, records it and tells the author', async () => {
    const author = await createUser();
    const admin = await createUser({ role: 'admin' });
    const post = await createPost(author.user.id, { status: 'pending_review', title: 'Hot take' });

    expect((await reject(post.id, admin.auth, 'no')).status).toBe(400);
    const res = await reject(post.id, admin.auth);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: 'rejected', rejectionReason: 'Please add sources for the statistics you cite.' });

    const log = await AuditLog.findOne({ action: 'post.rejected' }).lean();
    expect(log!.reason).toBe('Please add sources for the statistics you cite.');
    const notification = await Notification.findOne({ recipient: author.user._id, type: 'post_rejected' }).lean();
    expect(notification!.message).toContain('Please add sources');
  });

  it('applies an approved revision to the live post without resetting publishedAt', async () => {
    const author = await createUser();
    const admin = await createUser({ role: 'admin' });
    const publishedAt = new Date('2025-01-01T00:00:00Z');
    const post = await createPost(author.user.id, { title: 'Before', publishedAt });

    await newApp().patch(`/api/v1/posts/${post.id}`).set(author.auth).send({ title: 'After' });
    await newApp().post(`/api/v1/posts/${post.id}/submit`).set(author.auth);
    expect((await approve(post.id, admin.auth)).status).toBe(200);

    const saved = (await Post.findById(post.id))!;
    expect(saved.title).toBe('After');
    expect(saved.revision).toBeNull();
    expect(saved.publishedAt!.toISOString()).toBe(publishedAt.toISOString());
    expect(saved.slug).toBe(post.slug);
  });

  it('rejects a revision while keeping the live version public', async () => {
    const author = await createUser();
    const admin = await createUser({ role: 'admin' });
    const post = await createPost(author.user.id, { title: 'Live title' });
    await newApp().patch(`/api/v1/posts/${post.id}`).set(author.auth).send({ title: 'Clickbait title' });
    await newApp().post(`/api/v1/posts/${post.id}/submit`).set(author.auth);

    await reject(post.id, admin.auth);
    const pub = await newApp().get(`/api/v1/posts/${post.slug}`);
    expect(pub.body.data.title).toBe('Live title');
    const own = await newApp().get(`/api/v1/posts/${post.slug}`).set(author.auth);
    expect(own.body.data.revision).toMatchObject({ status: 'rejected', title: 'Clickbait title' });
  });

  it('refuses to decide on posts that are not awaiting review', async () => {
    const author = await createUser();
    const admin = await createUser({ role: 'admin' });
    const draft = await createPost(author.user.id, { status: 'draft' });
    expect((await approve(draft.id, admin.auth)).status).toBe(409);
  });

  it('lets only one of two simultaneous decisions win', async () => {
    const author = await createUser();
    const admin = await createUser({ role: 'admin' });
    const post = await createPost(author.user.id, { status: 'pending_review' });
    const [a, b] = await Promise.all([approve(post.id, admin.auth), reject(post.id, admin.auth)]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(await AuditLog.countDocuments({ resourceId: post.id, action: { $in: ['post.approved', 'post.rejected'] } })).toBe(1);
  });

  it('rolls the status change back when the audit record cannot be written', async () => {
    const author = await createUser();
    const admin = await createUser({ role: 'admin' });
    const post = await createPost(author.user.id, { status: 'pending_review' });
    const spy = jest.spyOn(AuditService, 'record').mockRejectedValueOnce(new Error('audit store down'));
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    expect((await approve(post.id, admin.auth)).status).toBe(500);
    expect((await Post.findById(post.id))!.status).toBe('pending_review');
    spy.mockRestore();
  });
});

describe('Queue, history and notifications', () => {
  it('notifies admins and reviewers (not other staff or the author) when a post is submitted', async () => {
    const admin = await createUser({ role: 'admin' });
    const reviewer = await createStaff(['posts.review']);
    const unrelatedStaff = await createStaff(['comments.moderate']);
    const author = await createUser();
    const draft = await createPost(author.user.id, { status: 'draft' });

    await newApp().post(`/api/v1/posts/${draft.id}/submit`).set(author.auth);
    const recipients = (await Notification.find({ type: 'post_submitted' }).lean()).map((n) => String(n.recipient)).sort();
    expect(recipients).toEqual([admin.user.id, reviewer.user.id].sort());
    expect(unrelatedStaff).toBeDefined();
  });

  it('lists new submissions and pending revisions oldest first', async () => {
    const reviewer = await createStaff(['posts.review']);
    const author = await createUser();
    const older = await createPost(author.user.id, { status: 'pending_review', submittedAt: new Date('2025-01-01') });
    const revised = await createPost(author.user.id, {
      revision: { title: 'Edit', content: '<p>Edited content that is long enough.</p>', tags: [], status: 'pending_review', submittedAt: new Date('2025-02-01'), readingTime: 1 },
    });
    await createPost(author.user.id, { status: 'draft' });

    const res = await newApp().get('/api/v1/moderation/posts').set(reviewer.auth);
    expect(res.body.data.map((p: any) => p._id)).toEqual([older.id, revised.id]);
    expect(res.body.data[0].content).toBeUndefined();
  });

  it('shows the full submission and its moderation history to reviewers', async () => {
    const author = await createUser();
    const admin = await createUser({ role: 'admin' });
    const reviewer = await createStaff(['posts.review']);
    const draft = await createPost(author.user.id, { status: 'draft' });
    await newApp().post(`/api/v1/posts/${draft.id}/submit`).set(author.auth);
    await reject(draft.id, admin.auth);

    const res = await newApp().get(`/api/v1/moderation/posts/${draft.id}`).set(reviewer.auth);
    expect(res.status).toBe(200);
    expect(res.body.data.post.content).toBeDefined();
    expect(res.body.data.history.map((h: any) => h.action)).toEqual(['post.rejected', 'post.submitted']);
    expect(res.body.data.history[0].actor.name).toBe(admin.user.name);
  });
});

describe('Audit log integrity', () => {
  it('cannot be modified or deleted through the application', async () => {
    const log = await AuditLog.create({ action: 'test', resourceType: 'post' });
    await expect(AuditLog.updateOne({ _id: log._id }, { action: 'tampered' })).rejects.toThrow(/immutable/);
    await expect(AuditLog.deleteOne({ _id: log._id })).rejects.toThrow(/immutable/);
    log.action = 'tampered';
    await expect(log.save()).rejects.toThrow(/immutable/);
  });

  it('is admin-only unless audit_logs.view is granted', async () => {
    const admin = await createUser({ role: 'admin' });
    const reviewer = await createStaff(['posts.review']);
    const auditor = await createStaff(['audit_logs.view']);
    const user = await createUser();
    expect((await newApp().get('/api/v1/admin/audit-logs').set(user.auth)).status).toBe(403);
    expect((await newApp().get('/api/v1/admin/audit-logs').set(reviewer.auth)).status).toBe(403);
    expect((await newApp().get('/api/v1/admin/audit-logs').set(auditor.auth)).status).toBe(200);
    expect((await newApp().get('/api/v1/admin/audit-logs').set(admin.auth)).status).toBe(200);
    // Audit access does not open the rest of the admin area
    expect((await newApp().get('/api/v1/admin/users').set(auditor.auth)).status).toBe(403);
  });

  it('filters by action and resource', async () => {
    const admin = await createUser({ role: 'admin' });
    const author = await createUser();
    const post = await createPost(author.user.id, { status: 'pending_review' });
    await approve(post.id, admin.auth);
    const res = await newApp().get(`/api/v1/admin/audit-logs?action=post.approved&resourceType=post&resourceId=${post.id}`).set(admin.auth);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].actor.name).toBe(admin.user.name);
    expect(res.body.meta.actions).toContain('post.approved');
  });
});
