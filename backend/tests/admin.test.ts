import { Comment } from '../src/models/comment.model.js';
import { Session } from '../src/models/session.model.js';
import { User } from '../src/models/user.model.js';
import { AuditLog } from '../src/models/auditLog.model.js';
import { Notification } from '../src/models/notification.model.js';
import { AuthService } from '../src/services/auth.service.js';
import { useTestDatabase, newApp, createUser, createStaff, createPost } from './helpers.js';

useTestDatabase();

describe('Admin access control', () => {
  it('rejects guests, regular users and staff', async () => {
    const user = await createUser();
    const staff = await createStaff(['posts.review', 'posts.approve', 'posts.reject', 'comments.moderate', 'categories.manage']);
    for (const path of ['/dashboard', '/users', '/posts']) {
      expect((await newApp().get(`/api/v1/admin${path}`)).status).toBe(401);
      expect((await newApp().get(`/api/v1/admin${path}`).set(user.auth)).status).toBe(403);
      expect((await newApp().get(`/api/v1/admin${path}`).set(staff.auth)).status).toBe(403);
    }
  });

  it('prevents users and staff from changing roles or permissions, including their own', async () => {
    const user = await createUser();
    const staff = await createStaff(['posts.review']);
    expect((await newApp().patch(`/api/v1/admin/users/${user.user.id}/role`).set(user.auth).send({ role: 'admin' })).status).toBe(403);
    expect((await newApp().patch(`/api/v1/admin/users/${staff.user.id}/role`).set(staff.auth).send({ role: 'admin' })).status).toBe(403);
    expect(
      (await newApp().put(`/api/v1/admin/users/${staff.user.id}/permissions`).set(staff.auth).send({ permissions: ['posts.approve'] })).status
    ).toBe(403);
    expect((await User.findById(staff.user.id))!.permissions).toEqual(['posts.review']);
  });

  it('applies a demotion immediately, without waiting for the token to expire', async () => {
    const admin = await createUser({ role: 'admin' });
    const demoted = await createUser({ role: 'admin' });
    expect((await newApp().get('/api/v1/admin/dashboard').set(demoted.auth)).status).toBe(200);
    await newApp().patch(`/api/v1/admin/users/${demoted.user.id}/role`).set(admin.auth).send({ role: 'user' });
    expect((await newApp().get('/api/v1/admin/dashboard').set(demoted.auth)).status).toBe(403);
  });
});

describe('Staff management', () => {
  it('creates a staff account with permissions and audits it', async () => {
    const admin = await createUser({ role: 'admin' });
    const res = await newApp()
      .post('/api/v1/admin/staff')
      .set(admin.auth)
      .send({ name: 'Rita Reviewer', email: 'rita@example.com', password: 'a-long-staff-passphrase', permissions: ['posts.review'] });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ role: 'staff', permissions: ['posts.review'] });
    expect(res.body.data.password).toBeUndefined();
    expect(await AuditLog.countDocuments({ action: 'staff.created' })).toBe(1);
  });

  it('promotes a user to staff, grants and revokes permissions, and records each change', async () => {
    const admin = await createUser({ role: 'admin' });
    const { user } = await createUser();

    await newApp().patch(`/api/v1/admin/users/${user.id}/role`).set(admin.auth).send({ role: 'staff' });
    const grant = await newApp()
      .put(`/api/v1/admin/users/${user.id}/permissions`)
      .set(admin.auth)
      .send({ permissions: ['posts.review', 'posts.approve'] });
    expect(grant.body.data.permissions).toEqual(['posts.review', 'posts.approve']);

    await newApp().put(`/api/v1/admin/users/${user.id}/permissions`).set(admin.auth).send({ permissions: ['posts.review'] });
    const changes = await AuditLog.find({ action: 'staff.permissions_changed', resourceId: user.id }).sort({ createdAt: 1 }).lean();
    expect(changes.map((c) => c.newState)).toEqual([
      { permissions: ['posts.review', 'posts.approve'], granted: ['posts.review', 'posts.approve'], revoked: [] },
      { permissions: ['posts.review'], granted: [], revoked: ['posts.approve'] },
    ]);
    expect(String(changes[0].actor)).toBe(admin.user.id);
    expect(await Notification.countDocuments({ recipient: user._id, type: 'staff_permissions_changed' })).toBe(2);
  });

  it('rejects unknown permissions, missing dependencies and permissions for non-staff', async () => {
    const admin = await createUser({ role: 'admin' });
    const staff = await createStaff([]);
    const { user } = await createUser();
    const put = (id: string, permissions: string[]) =>
      newApp().put(`/api/v1/admin/users/${id}/permissions`).set(admin.auth).send({ permissions });
    expect((await put(staff.user.id, ['everything'])).status).toBe(400);
    expect((await put(staff.user.id, ['posts.approve'])).status).toBe(400);
    expect((await put(user.id, ['posts.review'])).status).toBe(409);
  });

  it('clears permissions when a staff member is demoted', async () => {
    const admin = await createUser({ role: 'admin' });
    const staff = await createStaff(['posts.review', 'posts.approve']);
    const res = await newApp().patch(`/api/v1/admin/users/${staff.user.id}/role`).set(admin.auth).send({ role: 'user' });
    expect(res.body.data).toMatchObject({ role: 'user', permissions: [] });
  });

  it('shows a staff member’s recent actions', async () => {
    const admin = await createUser({ role: 'admin' });
    const staff = await createStaff(['posts.review', 'posts.approve']);
    const author = await createUser();
    const post = await createPost(author.user.id, { status: 'pending_review' });
    await newApp().post(`/api/v1/moderation/posts/${post.id}/approve`).set(staff.auth);

    const res = await newApp().get(`/api/v1/admin/users/${staff.user.id}`).set(admin.auth);
    expect(res.body.data.moderationCounts).toEqual({ 'post.approved': 1 });
    expect(res.body.data.recentActions[0].action).toBe('post.approved');
  });
});

describe('Dashboard', () => {
  it('reports counts using the documented rules', async () => {
    const admin = await createUser({ role: 'admin' });
    const writer = await createUser();
    await createStaff(['posts.review']);
    await createUser({ isActive: false });
    const published = await createPost(writer.user.id);
    await createPost(writer.user.id, { status: 'draft' });
    await createPost(writer.user.id, { status: 'pending_review' });
    await createPost(writer.user.id, { isDeleted: true });
    await Comment.create({ post: published.id, author: writer.user.id, content: 'One' });

    const res = await newApp().get('/api/v1/admin/dashboard').set(admin.auth);
    expect(res.body.data.stats).toMatchObject({
      totalUsers: 4,
      activeUsers: 3,
      admins: 1,
      staff: 1,
      totalPosts: 4,
      publishedPosts: 1,
      draftPosts: 1,
      pendingReview: 1,
      deletedPosts: 1,
      totalComments: 1,
    });
  });
});

describe('User management', () => {
  it('paginates and searches users without exposing secrets', async () => {
    const admin = await createUser({ role: 'admin', name: 'Admin Person' });
    for (let i = 0; i < 4; i++) await createUser();
    await createUser({ name: 'Findable Writer', email: 'find.me@example.com' });

    const page = await newApp().get('/api/v1/admin/users?page=1&limit=3').set(admin.auth);
    expect(page.body.data).toHaveLength(3);
    expect(page.body.meta).toMatchObject({ total: 6, totalPages: 2 });
    page.body.data.forEach((u: Record<string, unknown>) => expect(u.password).toBeUndefined());

    const search = await newApp().get('/api/v1/admin/users?search=find.me').set(admin.auth);
    expect(search.body.data.map((u: any) => u.name)).toEqual(['Findable Writer']);
    expect((await newApp().get('/api/v1/admin/users?search=.*').set(admin.auth)).body.data).toHaveLength(0);
  });

  it('protects the last active administrator', async () => {
    const admin = await createUser({ role: 'admin' });
    await createUser({ role: 'admin', isActive: false });
    const res = await newApp().patch(`/api/v1/admin/users/${admin.user.id}/role`).set(admin.auth).send({ role: 'staff' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('LAST_ADMIN');
  });

  it('deactivates accounts, revoking sessions and tokens immediately', async () => {
    const admin = await createUser({ role: 'admin' });
    const target = await createStaff(['posts.review']);
    await AuthService.createSession(target.user.id);

    const res = await newApp().patch(`/api/v1/admin/users/${target.user.id}/status`).set(admin.auth).send({ isActive: false });
    expect(res.body.data.isActive).toBe(false);
    expect(await Session.countDocuments({ user: target.user.id })).toBe(0);
    expect((await newApp().get('/api/v1/moderation/posts').set(target.auth)).status).toBe(403);
    expect(await AuditLog.countDocuments({ action: 'user.deactivated', resourceId: target.user.id })).toBe(1);
  });

  it('does not let an admin deactivate their own account', async () => {
    const admin = await createUser({ role: 'admin' });
    await createUser({ role: 'admin' });
    expect((await newApp().patch(`/api/v1/admin/users/${admin.user.id}/status`).set(admin.auth).send({ isActive: false })).status).toBe(409);
  });
});

describe('Post moderation views', () => {
  it('lists posts by any status, including soft-deleted ones', async () => {
    const admin = await createUser({ role: 'admin' });
    const writer = await createUser();
    await createPost(writer.user.id);
    await createPost(writer.user.id, { status: 'rejected' });
    const deleted = await createPost(writer.user.id, { isDeleted: true, deletedAt: new Date() });

    expect((await newApp().get('/api/v1/admin/posts').set(admin.auth)).body.meta.total).toBe(3);
    expect((await newApp().get('/api/v1/admin/posts?status=deleted').set(admin.auth)).body.data.map((p: any) => p._id)).toEqual([deleted.id]);
    expect((await newApp().get('/api/v1/admin/posts?status=rejected').set(admin.auth)).body.data).toHaveLength(1);
  });

  it('refuses to restore a post that is not deleted', async () => {
    const admin = await createUser({ role: 'admin' });
    const post = await createPost((await createUser()).user.id);
    expect((await newApp().patch(`/api/v1/admin/posts/${post.id}/restore`).set(admin.auth)).status).toBe(409);
  });
});
