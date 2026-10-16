import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const DEV_ACCESS_SECRET = 'dev-only-access-secret-change-me-0123456789';
const DEV_REFRESH_SECRET = 'dev-only-refresh-secret-change-me-0123456789';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  MONGODB_URI: z.string().min(1).default('mongodb://127.0.0.1:27017/margin'),
  // Comma-separated list of allowed browser origins. The first one is used for OAuth redirects.
  CLIENT_URL: z.string().min(1).default('http://localhost:5173'),
  API_URL: z.string().url().default('http://localhost:5000'),
  // Number of reverse-proxy hops to trust for req.ip (0 = trust none).
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),

  JWT_ACCESS_SECRET: z.string().min(32).default(DEV_ACCESS_SECRET),
  JWT_REFRESH_SECRET: z.string().min(32).default(DEV_REFRESH_SECRET),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  CLOUDINARY_FOLDER: z.string().default('blogsystem'),

  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CALLBACK_URL: z.string().url().optional(),
  FACEBOOK_APP_ID: z.string().optional(),
  FACEBOOK_APP_SECRET: z.string().optional(),
  FACEBOOK_CALLBACK_URL: z.string().url().optional(),
});

const parsed = schema.safeParse(
  // Treat empty strings in .env as "not set"
  Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== ''))
);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(`Invalid environment configuration:\n${issues}`);
}

const env = parsed.data;

if (env.NODE_ENV === 'production') {
  const missing: string[] = [];
  if (!process.env.MONGODB_URI) missing.push('MONGODB_URI');
  if (!process.env.CLIENT_URL) missing.push('CLIENT_URL');
  if (!process.env.API_URL) missing.push('API_URL');
  if (env.JWT_ACCESS_SECRET === DEV_ACCESS_SECRET) missing.push('JWT_ACCESS_SECRET');
  if (env.JWT_REFRESH_SECRET === DEV_REFRESH_SECRET) missing.push('JWT_REFRESH_SECRET');
  if (missing.length) {
    throw new Error(`Missing required production configuration: ${missing.join(', ')}`);
  }
}

if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
  throw new Error('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different');
}

const clientOrigins = env.CLIENT_URL.split(',').map((o) => o.trim().replace(/\/$/, ''));

export const ENV = {
  ...env,
  CLIENT_ORIGINS: clientOrigins,
  CLIENT_URL: clientOrigins[0],
  IS_PRODUCTION: env.NODE_ENV === 'production',
  CLOUDINARY_ENABLED: Boolean(
    env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET
  ),
  GOOGLE_ENABLED: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
  FACEBOOK_ENABLED: Boolean(env.FACEBOOK_APP_ID && env.FACEBOOK_APP_SECRET),
  GOOGLE_CALLBACK_URL: env.GOOGLE_CALLBACK_URL || `${env.API_URL}/api/v1/auth/google/callback`,
  FACEBOOK_CALLBACK_URL: env.FACEBOOK_CALLBACK_URL || `${env.API_URL}/api/v1/auth/facebook/callback`,
};
