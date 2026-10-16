import http from 'http';
import mongoose from 'mongoose';
import { createApp } from './app.js';
import { connectDB } from './config/db.js';
import { ENV } from './config/env.js';
import { initSocket } from './socket/index.js';

const startServer = async () => {
  await connectDB();

  const server = http.createServer(createApp());
  // Live delivery layer next to the REST API (authenticated, server-controlled rooms)
  const io = initSocket(server);
  server.listen(ENV.PORT, () => {
    console.log(`[Server] ${ENV.NODE_ENV} mode on port ${ENV.PORT}`);
    if (!ENV.CLOUDINARY_ENABLED) console.warn('[Server] Cloudinary is not configured: cover uploads are disabled');
    if (!ENV.GOOGLE_ENABLED) console.warn('[Server] Google OAuth is not configured');
    if (!ENV.FACEBOOK_ENABLED) console.warn('[Server] Facebook OAuth is not configured');
  });

  const shutdown = () => {
    console.log('[Server] Shutting down...');
    io.close();
    server.close(async () => {
      await mongoose.disconnect();
      process.exit(0);
    });
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
};

startServer().catch((error) => {
  console.error('[Server] Fatal startup error:', error);
  process.exit(1);
});
