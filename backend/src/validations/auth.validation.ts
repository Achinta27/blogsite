import { z } from 'zod';

const email = z.string().trim().toLowerCase().email('Please enter a valid email address').max(254);

export const registerSchema = z.object({
  body: z
    .object({
      name: z.string().trim().min(2, 'Name must be at least 2 characters').max(50),
      email,
      // bcrypt only uses the first 72 bytes of a password
      password: z.string().min(8, 'Password must be at least 8 characters').max(72),
    })
    // Unknown keys such as `role` are rejected outright rather than silently ignored
    .strict(),
});

export const loginSchema = z.object({
  body: z.object({
    email,
    password: z.string().min(1, 'Password is required').max(72),
  }),
});

export const updateProfileSchema = z.object({
  body: z
    .object({
      name: z.string().trim().min(2, 'Name must be at least 2 characters').max(50).optional(),
      bio: z.string().trim().max(280).optional(),
    })
    .strict(),
});
