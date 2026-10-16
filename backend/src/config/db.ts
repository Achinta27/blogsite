import mongoose from 'mongoose';
import { ENV } from './env.js';

export const connectDB = async (uri = ENV.MONGODB_URI): Promise<void> => {
  mongoose.set('strictQuery', true);
  const conn = await mongoose.connect(uri);
  // Build declared indexes (unique email/slug, TTL on sessions, text search, ...)
  await mongoose.connection.syncIndexes();
  if (ENV.NODE_ENV !== 'test') console.log(`[MongoDB] Connected: ${conn.connection.host}`);
};
