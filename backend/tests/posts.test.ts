jest.mock('../src/utils/cloudinary.js', () => ({
  isCloudinaryConfigured: jest.fn(() => true),
  uploadImage: jest.fn(),
  deleteImage: jest.fn(),
}));

import { Post } from '../src/models/post.model.js';
import * as cloudinary from '../src/utils/cloudinary.js';
import { useTestDatabase, newApp, createUser, createPost, createCategory, ARTICLE_HTML } from './helpers.js';

useTestDatabase();

const mocked = cloudinary as jest.Mocked<typeof cloudinary>;
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);

describe('Drafting', () => {
  it('creates a draft with a clean slug, excerpt and reading time', async () => {
    const { auth } = await createUser();
    const category = await createCategory('Frontend Engineering');
    const res = await newApp()
      .post('/api/v1/posts')
      .set(auth)
      .send({ title: 'The Quiet Art of Margins', content: ARTICLE_HTML, category: category.id, tags: ['React', ' react ', 'Node.js'] });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      slug: 'the-quiet-art-of-margins',
      status: 'draft',
      publishedAt: null,
      tags: ['react', 'node.js'],
      readingTime: 1,
      category: { name: 'Frontend Engineering' },
    });
    expect(res.body.data.excerpt).toContain('sufficiently long');
    expect(res.body.data.author.email).toBeUndefined();
  });

  it('never lets the client set workflow or review fields', async () => {
    const { auth } = await createUser();
    for (const field of [
      { status: 'published' },
      { publishedAt: new Date().toISOString() },
      { reviewedBy: '0'.repeat(24) },
      { author: '0'.repeat(24) },
      { likeCount: 1000 },
      { slug: 'chosen-by-client' },
    ]) {
      const res = await newApp().post('/api/v1/posts').set(auth).send({ title: 'Valid title', ...field });
      expect(res.status).toBe(400);
    }
    expect(await Post.countDocuments()).toBe(0);
  });

  it('gives colliding titles distinct slugs and avoids reserved route names', async () => {
    const { auth } = await createUser();
    const a = await newApp().post('/api/v1/posts').set(auth).send({ title: 'Same Title' });
    const b = await newApp().post('/api/v1/posts').set(auth).send({ title: 'Same Title' });
    const reserved = await newApp().post('/api/v1/posts').set(auth).send({ title: 'Saved' });
    expect(a.body.data.slug).toBe('same-title');
    expect(b.body.data.slug).toMatch(/^same-title-[a-f0-9]{6}$/);
    expect(reserved.body.data.slug).not.toBe('saved');
  });

  it('sanitises article HTML', async () => {
    const { auth } = await createUser();
    const res = await newApp()
      .post('/api/v1/posts')
      .set(auth)
      .send({
        title: 'Unsafe content',
        content:
          '<p onclick="steal()">Hello <script>alert(1)</script><a href="javascript:alert(1)">x</a>' +
          '<a href="https://example.com">ok</a><img src=x onerror=alert(1)></p>',
      });
    const html: string = res.body.data.content;
    expect(html).not.toMatch(/script|onclick|onerror|javascript:|<img/i);
    expect(html).toContain('<a href="https://example.com" target="_blank" rel="noopener noreferrer nofollow">ok</a>');
  });

  it('validates input', async () => {
    const { auth } = await createUser();
    const short = await newApp().post('/api/v1/posts').set(auth).send({ title: 'Hi' });
    const badCategory = await newApp().post('/api/v1/posts').set(auth).send({ title: 'Valid title', category: 'gossip' });
    const unknownCategory = await newApp().post('/api/v1/posts').set(auth).send({ title: 'Valid title', category: 'a'.repeat(24) });
    const tooManyTags = await newApp().post('/api/v1/posts').set(auth).send({ title: 'Valid title', tags: ['a', 'b', 'c', 'd', 'e', 'f'] });
    [short, badCategory, unknownCategory, tooManyTags].forEach((res) => expect(res.status).toBe(400));
  });

  it('requires authentication', async () => {
    expect((await newApp().post('/api/v1/posts').send({ title: 'Anonymous post' })).status).toBe(401);
  });
});

describe('Submitting for review', () => {
  it('moves a complete draft to pending_review', async () => {
    const { user, auth } = await createUser();
    const draft = await createPost(user.id, { status: 'draft' });
    const res = await newApp().post(`/api/v1/posts/${draft.id}/submit`).set(auth);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: 'pending_review', publishedAt: null });
    expect(res.body.data.submittedAt).toEqual(expect.any(String));
  });

  it('refuses incomplete drafts', async () => {
    const { user, auth } = await createUser();
    const empty = await createPost(user.id, { status: 'draft', content: '<p> </p>' });
    const uncategorised = await createPost(user.id, { status: 'draft', category: null });
    for (const post of [empty, uncategorised]) {
      const res = await newApp().post(`/api/v1/posts/${post.id}/submit`).set(auth);
      expect(res.status).toBe(400);
    }
  });

  it("cannot be done for someone else's post", async () => {
    const owner = await createUser();
    const other = await createUser();
    const draft = await createPost(owner.user.id, { status: 'draft' });
    expect((await newApp().post(`/api/v1/posts/${draft.id}/submit`).set(other.auth)).status).toBe(403);
  });

  it('withdraws a pending submission back to draft when the author edits it', async () => {
    const { user, auth } = await createUser();
    const pending = await createPost(user.id, { status: 'pending_review' });
    const res = await newApp().patch(`/api/v1/posts/${pending.id}`).set(auth).send({ subtitle: 'Second thoughts' });
    expect(res.body.data.status).toBe('draft');
  });
});

describe('Editing published posts', () => {
  it('stores edits as a revision and leaves the live article unchanged', async () => {
    const { user, auth } = await createUser();
    const post = await createPost(user.id, { title: 'Original title' });

    const res = await newApp().patch(`/api/v1/posts/${post.id}`).set(auth).send({ title: 'Edited title', content: '<p>Rewritten body text here.</p>' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: 'published', title: 'Original title', revision: { title: 'Edited title', status: 'draft' } });

    const pub = await newApp().get(`/api/v1/posts/${post.slug}`);
    expect(pub.body.data.title).toBe('Original title');
    expect(pub.body.data.revision).toBeUndefined();
    expect(pub.body.data.content).toBe(ARTICLE_HTML);
  });

  it('submits a revision for review without unpublishing the post', async () => {
    const { user, auth } = await createUser();
    const post = await createPost(user.id);
    await newApp().patch(`/api/v1/posts/${post.id}`).set(auth).send({ subtitle: 'New subtitle' });
    const res = await newApp().post(`/api/v1/posts/${post.id}/submit`).set(auth);
    expect(res.body.data).toMatchObject({ status: 'published', revision: { status: 'pending_review', subtitle: 'New subtitle' } });
    expect((await newApp().get('/api/v1/posts')).body.data).toHaveLength(1);
  });

  it('can discard a revision', async () => {
    const { user, auth } = await createUser();
    const post = await createPost(user.id);
    await newApp().patch(`/api/v1/posts/${post.id}`).set(auth).send({ subtitle: 'Maybe not' });
    const res = await newApp().delete(`/api/v1/posts/${post.id}/revision`).set(auth);
    expect(res.body.data.revision).toBeNull();
  });

  it('archives and un-archives (back to draft, needing review again)', async () => {
    const { user, auth } = await createUser();
    const post = await createPost(user.id);
    const archived = await newApp().post(`/api/v1/posts/${post.id}/archive`).set(auth);
    expect(archived.body.data.status).toBe('archived');
    expect((await newApp().get(`/api/v1/posts/${post.slug}`)).status).toBe(404);
    expect((await newApp().patch(`/api/v1/posts/${post.id}`).set(auth).send({ subtitle: 'x' })).status).toBe(409);

    const restored = await newApp().post(`/api/v1/posts/${post.id}/unarchive`).set(auth);
    expect(restored.body.data.status).toBe('draft');
  });
});

describe('Ownership', () => {
  it("prevents users from editing or deleting other users' posts", async () => {
    const owner = await createUser();
    const intruder = await createUser();
    const post = await createPost(owner.user.id);

    expect((await newApp().patch(`/api/v1/posts/${post.id}`).set(intruder.auth).send({ title: 'Hijacked' })).status).toBe(403);
    expect((await newApp().delete(`/api/v1/posts/${post.id}`).set(intruder.auth)).status).toBe(403);
    expect((await newApp().post(`/api/v1/posts/${post.id}/archive`).set(intruder.auth)).status).toBe(403);
    expect((await Post.findById(post.id))!.title).not.toBe('Hijacked');
  });

  it('does not let staff edit other people’s posts, even with moderation permissions', async () => {
    const owner = await createUser();
    const staff = await createUser({ role: 'staff', permissions: ['posts.review', 'posts.approve', 'comments.moderate'] });
    const post = await createPost(owner.user.id, { status: 'draft' });
    expect((await newApp().patch(`/api/v1/posts/${post.id}`).set(staff.auth).send({ title: 'Staff edit' })).status).toBe(403);
  });

  it('lets an admin remove any post', async () => {
    const owner = await createUser();
    const admin = await createUser({ role: 'admin' });
    const post = await createPost(owner.user.id);
    expect((await newApp().delete(`/api/v1/posts/${post.id}`).set(admin.auth)).status).toBe(200);
  });

  it('rejects malformed ids', async () => {
    const { auth } = await createUser();
    expect((await newApp().patch('/api/v1/posts/not-an-id').set(auth).send({ title: 'Whatever' })).status).toBe(400);
  });
});

describe('Visibility', () => {
  it('lists only published, non-deleted posts publicly, without review fields', async () => {
    const { user } = await createUser();
    const visible = await createPost(user.id, { title: 'Visible one', rejectionReason: '' });
    for (const status of ['draft', 'pending_review', 'rejected', 'archived']) await createPost(user.id, { status });
    await createPost(user.id, { isDeleted: true, deletedAt: new Date() });

    const res = await newApp().get('/api/v1/posts');
    expect(res.body.data.map((p: { _id: string }) => p._id)).toEqual([visible.id]);
    expect(res.body.data[0].content).toBeUndefined();
    expect(res.body.data[0]).not.toHaveProperty('rejectionReason');
    expect(res.body.data[0]).not.toHaveProperty('reviewedBy');
  });

  it('excludes unpublished posts from search, author and tag queries', async () => {
    const { user } = await createUser();
    await createPost(user.id, { status: 'pending_review', title: 'Secret typography plans', tags: ['type'] });
    for (const query of ['search=typography', `author=${user.id}`, 'tag=type']) {
      expect((await newApp().get(`/api/v1/posts?${query}`)).body.data).toHaveLength(0);
    }
  });

  it('hides non-published posts from everyone but the author and admins', async () => {
    const author = await createUser();
    const other = await createUser();
    const staff = await createUser({ role: 'staff', permissions: ['posts.review'] });
    const admin = await createUser({ role: 'admin' });
    for (const status of ['draft', 'pending_review', 'rejected']) {
      const post = await createPost(author.user.id, { status });
      expect((await newApp().get(`/api/v1/posts/${post.slug}`)).status).toBe(404);
      expect((await newApp().get(`/api/v1/posts/${post.slug}`).set(other.auth)).status).toBe(404);
      // Staff review submissions through the moderation API, not the public one
      expect((await newApp().get(`/api/v1/posts/${post.slug}`).set(staff.auth)).status).toBe(404);
      expect((await newApp().get(`/api/v1/posts/${post.slug}`).set(author.auth)).status).toBe(200);
      expect((await newApp().get(`/api/v1/posts/${post.slug}`).set(admin.auth)).status).toBe(200);
    }
  });

  it('never serves a deleted post', async () => {
    const author = await createUser();
    const post = await createPost(author.user.id);
    await newApp().delete(`/api/v1/posts/${post.id}`).set(author.auth);
    expect((await newApp().get(`/api/v1/posts/${post.slug}`).set(author.auth)).status).toBe(404);
    expect(await Post.findById(post.id)).toMatchObject({ isDeleted: true });
  });

  it("shows the author's own posts in every state, with rejection feedback", async () => {
    const author = await createUser();
    await createPost(author.user.id, { status: 'draft' });
    await createPost(author.user.id, { status: 'rejected', rejectionReason: 'Needs sources for the claims.' });
    await createPost(author.user.id);

    const all = await newApp().get('/api/v1/posts/mine').set(author.auth);
    const rejected = await newApp().get('/api/v1/posts/mine?status=rejected').set(author.auth);
    expect(all.body.meta.total).toBe(3);
    expect(rejected.body.data[0].rejectionReason).toBe('Needs sources for the claims.');
  });
});

describe('Listing, filtering and pagination', () => {
  it('paginates and caps the page size', async () => {
    const { user } = await createUser();
    const category = await createCategory();
    for (let i = 0; i < 12; i++) await createPost(user.id, { category: category._id });

    const page2 = await newApp().get('/api/v1/posts?page=2&limit=5');
    expect(page2.body.data).toHaveLength(5);
    expect(page2.body.meta).toMatchObject({ page: 2, limit: 5, total: 12, totalPages: 3, hasNextPage: true });
    expect((await newApp().get('/api/v1/posts?limit=500')).status).toBe(400);
  });

  it('filters by category slug, tag, author and search text', async () => {
    const a = await createUser();
    const b = await createUser();
    const design = await createCategory('Frontend Engineering');
    await createPost(a.user.id, { title: 'Typography for the web', category: design._id, tags: ['css'] });
    await createPost(b.user.id, { title: 'Quarterly earnings explained' });

    const titles = (res: any) => res.body.data.map((p: any) => p.title);
    expect(titles(await newApp().get('/api/v1/posts?category=frontend-engineering'))).toEqual(['Typography for the web']);
    expect(titles(await newApp().get('/api/v1/posts?tag=CSS'))).toEqual(['Typography for the web']);
    expect(titles(await newApp().get(`/api/v1/posts?author=${b.user.id}`))).toEqual(['Quarterly earnings explained']);
    expect(titles(await newApp().get('/api/v1/posts?search=typography'))).toEqual(['Typography for the web']);
    expect((await newApp().get('/api/v1/posts?category=nope')).status).toBe(404);
  });

  it('matches partial words in search', async () => {
    const { user } = await createUser();
    await createPost(user.id, { title: 'Typography for the web', tags: ['css'] });
    const res = await newApp().get('/api/v1/posts?search=typo');
    expect(res.body.data.map((p: any) => p.title)).toEqual(['Typography for the web']);
  });
});

describe('Search suggestions', () => {
  it('suggests published articles, sections and topics as the user types', async () => {
    const { user } = await createUser();
    const design = await createCategory('Design Systems');
    await createPost(user.id, { title: 'A primer on design tokens', category: design._id, tags: ['design-tokens'] });
    await createPost(user.id, { title: 'Designing calm interfaces', tags: ['design-tokens'] });
    await createPost(user.id, { title: 'Unrelated piece', subtitle: 'about nothing' });
    await createPost(user.id, { status: 'pending_review', title: 'Design secrets in review' });

    const res = await newApp().get('/api/v1/posts/suggest?q=desig');
    expect(res.status).toBe(200);
    const titles = res.body.data.posts.map((p: any) => p.title);
    expect(titles[0]).toBe('Designing calm interfaces'); // title starting with the query ranks first
    expect(titles).toContain('A primer on design tokens');
    expect(titles).not.toContain('Design secrets in review');
    expect(titles).not.toContain('Unrelated piece');
    expect(res.body.data.posts[0].author).not.toHaveProperty('email');
    expect(res.body.data.categories.map((c: any) => c.name)).toEqual(['Design Systems']);
    expect(res.body.data.tags).toEqual([{ tag: 'design-tokens', count: 2 }]);
  });

  it('returns nothing for an empty query and rejects overly long ones', async () => {
    const res = await newApp().get('/api/v1/posts/suggest?q=');
    expect(res.body.data).toEqual({ posts: [], categories: [], tags: [] });
    expect((await newApp().get(`/api/v1/posts/suggest?q=${'a'.repeat(101)}`)).status).toBe(400);
  });
});

describe('Restore', () => {
  it('restores a deleted post with its previous status (a draft stays private)', async () => {
    const author = await createUser();
    const admin = await createUser({ role: 'admin' });
    const draft = await createPost(author.user.id, { status: 'draft', isDeleted: true, deletedAt: new Date() });
    const res = await newApp().patch(`/api/v1/admin/posts/${draft.id}/restore`).set(admin.auth);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ isDeleted: false, deletedAt: null, status: 'draft' });
  });

  it('is admin-only', async () => {
    const author = await createUser();
    const post = await createPost(author.user.id, { isDeleted: true, deletedAt: new Date() });
    expect((await newApp().patch(`/api/v1/admin/posts/${post.id}/restore`).set(author.auth)).status).toBe(403);
  });
});

describe('Cover images', () => {
  beforeEach(() => {
    mocked.isCloudinaryConfigured.mockReturnValue(true);
    mocked.uploadImage.mockResolvedValue({ url: 'https://res.cloudinary.com/demo/new.png', publicId: 'margin/covers/new' });
    mocked.deleteImage.mockResolvedValue(undefined);
  });

  const old = { url: 'https://res.cloudinary.com/demo/old.png', publicId: 'margin/covers/old', alt: 'Old' };
  const upload = (postId: string, auth: Record<string, string>, data = PNG, filename = 'cover.png') =>
    newApp().put(`/api/v1/posts/${postId}/cover`).set(auth).attach('image', data, filename).field('alt', 'A quiet desk');

  it('uploads a valid image onto a draft', async () => {
    const author = await createUser();
    const post = await createPost(author.user.id, { status: 'draft' });
    const res = await upload(post.id, author.auth);
    expect(res.status).toBe(200);
    expect(res.body.data.coverImage).toEqual({ url: 'https://res.cloudinary.com/demo/new.png', publicId: 'margin/covers/new', alt: 'A quiet desk' });
  });

  it('puts a new cover for a published post into its revision and keeps the live image', async () => {
    const author = await createUser();
    const post = await createPost(author.user.id, { coverImage: old });
    const res = await upload(post.id, author.auth);
    expect(res.body.data.coverImage.publicId).toBe('margin/covers/old');
    expect(res.body.data.revision.coverImage.publicId).toBe('margin/covers/new');
    // The live image is still referenced, so it is not deleted
    expect(mocked.deleteImage).not.toHaveBeenCalled();
  });

  it('deletes the replaced image of a draft once nothing references it', async () => {
    const author = await createUser();
    const post = await createPost(author.user.id, { status: 'draft', coverImage: old });
    await upload(post.id, author.auth);
    expect(mocked.deleteImage).toHaveBeenCalledWith('margin/covers/old');
  });

  it('rejects files whose content is not a supported image, whatever the filename says', async () => {
    const author = await createUser();
    const post = await createPost(author.user.id, { status: 'draft' });
    const res = await upload(post.id, author.auth, Buffer.from('<?php system($_GET["c"]); ?> padding'), 'evil.png');
    expect(res.status).toBe(415);
    expect(mocked.uploadImage).not.toHaveBeenCalled();
  });

  it('rejects files larger than 5 MB', async () => {
    const author = await createUser();
    const post = await createPost(author.user.id, { status: 'draft' });
    const res = await upload(post.id, author.auth, Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)]));
    expect(res.status).toBe(413);
    expect(mocked.uploadImage).not.toHaveBeenCalled();
  });

  it('leaves the post untouched when the upload fails', async () => {
    const author = await createUser();
    const post = await createPost(author.user.id, { status: 'draft', coverImage: old });
    mocked.uploadImage.mockRejectedValue(new Error('network down'));
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const res = await upload(post.id, author.auth);
    expect(res.status).toBe(502);
    expect((await Post.findById(post.id))!.toObject().coverImage).toEqual(old);
  });

  it('only lets the owner or an admin change the cover', async () => {
    const author = await createUser();
    const other = await createUser();
    const post = await createPost(author.user.id, { status: 'draft' });
    expect((await upload(post.id, other.auth)).status).toBe(403);
    expect(mocked.uploadImage).not.toHaveBeenCalled();
  });

  it('answers 503 when Cloudinary is not configured', async () => {
    mocked.isCloudinaryConfigured.mockReturnValue(false);
    const author = await createUser();
    const post = await createPost(author.user.id, { status: 'draft' });
    expect((await upload(post.id, author.auth)).status).toBe(503);
  });
});
