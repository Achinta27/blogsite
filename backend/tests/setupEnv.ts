// Runs before any module is imported, so config/env.ts sees a deterministic test setup.
// Values set here win over backend/.env because dotenv never overrides existing variables.
process.env.NODE_ENV = 'test';
process.env.CLIENT_URL = 'http://client.test';
process.env.API_URL = 'http://api.test';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-0123456789abcdefghijklmnop';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-0123456789abcdefghijklmnop';
process.env.JWT_ACCESS_EXPIRES_IN = '15m';
process.env.JWT_REFRESH_EXPIRES_IN = '7d';

// Google is "configured" with fake credentials so its redirect/state handling can be
// tested without contacting Google. Facebook is left unconfigured on purpose.
process.env.GOOGLE_CLIENT_ID = 'test-google-client-id';
process.env.GOOGLE_CLIENT_SECRET = 'test-google-client-secret';
process.env.FACEBOOK_APP_ID = '';
process.env.FACEBOOK_APP_SECRET = '';

// Cloudinary is mocked in tests; real credentials are never needed.
process.env.CLOUDINARY_CLOUD_NAME = '';
process.env.CLOUDINARY_API_KEY = '';
process.env.CLOUDINARY_API_SECRET = '';
