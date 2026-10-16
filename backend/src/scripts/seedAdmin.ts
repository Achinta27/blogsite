/**
 * Creates an administrator, or promotes and re-activates an existing account.
 *
 *   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='a long passphrase' ADMIN_NAME='Your Name' npm run seed:admin
 *
 * Credentials are read from the environment only and never printed.
 */
import mongoose from 'mongoose';
import { z } from 'zod';
import { connectDB } from '../config/db.js';
import { User } from '../models/user.model.js';

const input = z
  .object({
    ADMIN_EMAIL: z.string().trim().toLowerCase().email(),
    ADMIN_PASSWORD: z.string().min(12, 'ADMIN_PASSWORD must be at least 12 characters').max(72),
    ADMIN_NAME: z.string().trim().min(2).max(50).default('Administrator'),
  })
  .safeParse(process.env);

const run = async () => {
  if (!input.success) {
    console.error('Invalid admin seed input:');
    input.error.issues.forEach((i) => console.error(`  - ${i.path.join('.')}: ${i.message}`));
    process.exit(1);
  }
  const { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME } = input.data;

  await connectDB();
  let user = await User.findOne({ email: ADMIN_EMAIL }).select('+password');
  if (user) {
    user.role = 'admin';
    user.isActive = true;
    user.password = ADMIN_PASSWORD;
    await user.save();
    console.log(`Updated existing account ${ADMIN_EMAIL} to an active administrator.`);
  } else {
    user = await User.create({ name: ADMIN_NAME, email: ADMIN_EMAIL, password: ADMIN_PASSWORD, role: 'admin' });
    console.log(`Created administrator ${ADMIN_EMAIL}.`);
  }
  await mongoose.disconnect();
};

run().catch(async (error) => {
  console.error('Admin seed failed:', error.message);
  await mongoose.disconnect();
  process.exit(1);
});
