import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { User, UserRole } from '../src/models/user.model.js';
import { Post } from '../src/models/post.model.js';
import { Category } from '../src/models/category.model.js';
import { signAccessToken } from '../src/utils/jwt.js';
import { resetTransactionSupportCache } from '../src/utils/transaction.js';
import type { Permission } from '../src/config/permissions.js';

let mongo: MongoMemoryReplSet;

/**
 * Isolated in-memory MongoDB per test file. A single-node replica set, so moderation
 * transitions run inside real transactions exactly as on Atlas.
 */
export const useTestDatabase = () => {
  beforeAll(async () => {
    mongo = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
    await mongoose.connect(mongo.getUri());
    await mongoose.connection.syncIndexes();
    resetTransactionSupportCache();
  });

  afterEach(async () => {
    const collections = await mongoose.connection.db!.collections();
    // Audit entries are immutable through Mongoose, so clear them via the raw driver
    await Promise.all(collections.map((c) => c.deleteMany({})));
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  });
};

export const newApp = () => request(createApp());

let counter = 0;

/** Inserts a user directly and returns a valid access token for it (bypasses the auth limiter). */
export const createUser = async (
  overrides: { role?: UserRole; isActive?: boolean; name?: string; email?: string; permissions?: Permission[] } = {}
) => {
  counter += 1;
  const user = await User.create({
    name: overrides.name || `Writer ${counter}`,
    email: overrides.email || `writer${counter}@example.com`,
    password: 'correct horse battery',
    role: overrides.role || 'user',
    permissions: overrides.permissions || [],
    isActive: overrides.isActive ?? true,
  });
  const token = signAccessToken({ userId: user.id });
  return { user, token, auth: { Authorization: `Bearer ${token}` } };
};

export const createStaff = (permissions: Permission[]) => createUser({ role: 'staff', permissions });

export const createCategory = async (name = `Category ${++counter}`) =>
  Category.create({ name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), description: '' });

export const ARTICLE_HTML =
  '<h2>Introduction</h2><p>This is a <strong>sufficiently long</strong> article body for publishing.</p>';

/** Inserts a post directly in any state (published by default, with a category). */
export const createPost = async (authorId: string, overrides: Record<string, unknown> = {}) => {
  counter += 1;
  const status = (overrides.status as string) || 'published';
  const category = overrides.category ?? (await createCategory())._id;
  return Post.create({
    title: `Article number ${counter}`,
    slug: `article-number-${counter}`,
    content: ARTICLE_HTML,
    excerpt: 'An excerpt',
    author: authorId,
    status,
    category,
    publishedAt: status === 'published' ? new Date() : null,
    submittedAt: status === 'pending_review' ? new Date() : null,
    ...overrides,
  });
};

/** Extracts the refresh-token cookie ("refreshToken=...") from a Set-Cookie header. */
export const refreshCookieFrom = (res: request.Response): string | undefined => {
  const cookies = ([] as string[]).concat(res.headers['set-cookie'] || []);
  return cookies.find((c) => c.startsWith('refreshToken=') && !c.startsWith('refreshToken=;'))?.split(';')[0];
};
