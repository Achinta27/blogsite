/**
 * Creates the default categories if they do not exist. Safe to run repeatedly.
 *
 *   npm run seed:categories
 */
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { Category } from '../models/category.model.js';
import { toSlugBase } from '../utils/slug.js';

const DEFAULTS = [
  ['Web Development', 'Building for the open web.'],
  ['Frontend Engineering', 'Interfaces, performance and the browser.'],
  ['Backend Engineering', 'APIs, data and services.'],
  ['DevOps', 'Shipping, operating and observing software.'],
  ['AI and Machine Learning', 'Models, data and their consequences.'],
  ['Career and Tutorials', 'Learning, growing and teaching.'],
];

const run = async () => {
  await connectDB();
  let created = 0;
  for (const [name, description] of DEFAULTS) {
    const result = await Category.updateOne(
      { slug: toSlugBase(name) },
      { $setOnInsert: { name, slug: toSlugBase(name), description } },
      { upsert: true }
    );
    created += result.upsertedCount;
  }
  console.log(`Categories ready (${created} created, ${DEFAULTS.length - created} already present).`);
  await mongoose.disconnect();
};

run().catch(async (error) => {
  console.error('Category seed failed:', error.message);
  await mongoose.disconnect();
  process.exit(1);
});
