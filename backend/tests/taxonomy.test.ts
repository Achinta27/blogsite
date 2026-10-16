import { Category } from '../src/models/category.model.js';
import { Post } from '../src/models/post.model.js';
import { useTestDatabase, newApp, createUser, createStaff, createPost, createCategory } from './helpers.js';

useTestDatabase();

describe('Categories', () => {
  it('lists categories publicly with published counts', async () => {
    const author = await createUser();
    const devops = await createCategory('DevOps');
    await createPost(author.user.id, { category: devops._id });
    await createPost(author.user.id, { category: devops._id, status: 'draft' });

    const res = await newApp().get('/api/v1/categories');
    expect(res.body.data.find((c: any) => c.slug === 'devops')).toMatchObject({ name: 'DevOps', publishedCount: 1 });
  });

  it('can be managed by admins and by staff with categories.manage only', async () => {
    const admin = await createUser({ role: 'admin' });
    const manager = await createStaff(['categories.manage']);
    const reviewer = await createStaff(['posts.review']);
    const user = await createUser();

    expect((await newApp().post('/api/v1/categories').set(user.auth).send({ name: 'Nope' })).status).toBe(403);
    expect((await newApp().post('/api/v1/categories').set(reviewer.auth).send({ name: 'Nope' })).status).toBe(403);
    expect((await newApp().post('/api/v1/categories').set(manager.auth).send({ name: 'Web Development' })).status).toBe(201);
    expect((await newApp().post('/api/v1/categories').set(admin.auth).send({ name: 'Backend Engineering' })).status).toBe(201);
  });

  it('prevents duplicates that differ only in case or spacing', async () => {
    const admin = await createUser({ role: 'admin' });
    await newApp().post('/api/v1/categories').set(admin.auth).send({ name: 'DevOps' });
    const dup = await newApp().post('/api/v1/categories').set(admin.auth).send({ name: '  devops ' });
    expect(dup.status).toBe(409);
    expect(await Category.countDocuments()).toBe(1);
  });

  it('refuses to delete a category still used by posts', async () => {
    const admin = await createUser({ role: 'admin' });
    const author = await createUser();
    const used = await createCategory('Used');
    const unused = await createCategory('Unused');
    await createPost(author.user.id, { category: used._id, isDeleted: true });

    expect((await newApp().delete(`/api/v1/categories/${used.id}`).set(admin.auth)).status).toBe(409);
    expect((await newApp().delete(`/api/v1/categories/${unused.id}`).set(admin.auth)).status).toBe(200);
  });

  it('renames and records the change in the audit log', async () => {
    const admin = await createUser({ role: 'admin' });
    const category = await createCategory('Dev Ops');
    const res = await newApp().patch(`/api/v1/categories/${category.id}`).set(admin.auth).send({ name: 'DevOps' });
    expect(res.body.data).toMatchObject({ name: 'DevOps', slug: 'devops' });
    const logs = await newApp().get('/api/v1/admin/audit-logs?action=category.updated').set(admin.auth);
    expect(logs.body.data[0]).toMatchObject({ previousState: { name: 'Dev Ops' }, newState: { name: 'DevOps' } });
  });
});

describe('Tags', () => {
  it('lists tags used on published posts by popularity', async () => {
    const author = await createUser();
    await createPost(author.user.id, { tags: ['react', 'node.js'] });
    await createPost(author.user.id, { tags: ['react'] });
    await createPost(author.user.id, { tags: ['secret'], status: 'draft' });
    const res = await newApp().get('/api/v1/tags');
    expect(res.body.data).toEqual([
      { tag: 'react', count: 2 },
      { tag: 'node.js', count: 1 },
    ]);
  });

  it('renames (merging duplicates) and deletes tags across posts', async () => {
    const manager = await createStaff(['categories.manage']);
    const author = await createUser();
    const a = await createPost(author.user.id, { tags: ['reactjs', 'react'] });
    const b = await createPost(author.user.id, { tags: ['reactjs'] });

    expect((await newApp().patch('/api/v1/tags/reactjs').set(manager.auth).send({ name: 'React' })).status).toBe(200);
    expect((await Post.findById(a.id))!.tags).toEqual(['react']);
    expect((await Post.findById(b.id))!.tags).toEqual(['react']);

    await newApp().delete('/api/v1/tags/react').set(manager.auth);
    expect((await Post.findById(a.id))!.tags).toEqual([]);
  });

  it('is protected', async () => {
    const user = await createUser();
    expect((await newApp().delete('/api/v1/tags/react').set(user.auth)).status).toBe(403);
  });
});
