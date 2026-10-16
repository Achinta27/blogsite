/**
 * One-off migration for posts created by earlier versions of Margin. Safe to run repeatedly.
 * - Posts without a status were always public: they become `published` (publishedAt = createdAt).
 * - String categories (the old fixed list) become Category documents referenced by id.
 * - Excerpt, reading time and like count are filled in where missing.
 *
 *   npm run migrate:posts
 */
import mongoose, { Types } from 'mongoose';
import { connectDB } from '../config/db.js';
import { Category } from '../models/category.model.js';
import { htmlToText, readingTimeMinutes, buildExcerpt } from '../utils/content.js';
import { toSlugBase } from '../utils/slug.js';

const run = async () => {
  await connectDB();
  // Raw collection access: legacy documents do not match the current schema types
  const posts = mongoose.connection.collection('posts');
  let migrated = 0;

  for await (const doc of posts.find({})) {
    const set: Record<string, unknown> = {};

    if (!doc.status) {
      set.status = 'published';
      set.publishedAt = doc.publishedAt || doc.createdAt;
    }
    if (typeof doc.category === 'string') {
      const name = doc.category.charAt(0).toUpperCase() + doc.category.slice(1);
      const slug = toSlugBase(name);
      await Category.updateOne({ slug }, { $setOnInsert: { name, slug, description: '' } }, { upsert: true });
      set.category = (await Category.findOne({ slug }).select('_id').lean())!._id as Types.ObjectId;
    }
    const text = htmlToText(doc.content || '');
    if (doc.readingTime === undefined) set.readingTime = readingTimeMinutes(text);
    if (!doc.excerpt) set.excerpt = buildExcerpt(text);
    if (doc.likeCount === undefined) set.likeCount = 0;

    if (Object.keys(set).length) {
      await posts.updateOne({ _id: doc._id }, { $set: set });
      migrated += 1;
    }
  }
  console.log(`Migrated ${migrated} post(s).`);
  await mongoose.disconnect();
};

run().catch(async (error) => {
  console.error('Migration failed:', error.message);
  await mongoose.disconnect();
  process.exit(1);
});
