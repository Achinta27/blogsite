import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import passport from 'passport';
import { ENV } from './config/env.js';
import { configurePassport } from './config/passport.js';
import { createV1Router } from './routes/index.js';
import { notFoundHandler, errorHandler } from './middlewares/error.middleware.js';
import { createRateLimiters } from './middlewares/rateLimiter.js';
import { requestId } from './middlewares/requestId.middleware.js';

export const createApp = (): Application => {
  const app = express();
  const limiters = createRateLimiters();

  // req.ip only honours X-Forwarded-For for explicitly trusted proxy hops
  app.set('trust proxy', ENV.TRUST_PROXY);
  app.disable('x-powered-by');

  app.use(requestId);
  app.use(helmet());
  if (ENV.NODE_ENV === 'development') app.use(morgan('dev'));

  const allowedOrigins = ENV.IS_PRODUCTION
    ? ENV.CLIENT_ORIGINS
    : [...ENV.CLIENT_ORIGINS, 'http://localhost:5173', 'http://127.0.0.1:5173'];
  app.use(
    cors({
      origin: allowedOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
      exposedHeaders: ['X-Request-Id'],
    })
  );

  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  configurePassport();
  app.use(passport.initialize());

  app.use(limiters.general);
  app.use('/api/v1', createV1Router(limiters));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
