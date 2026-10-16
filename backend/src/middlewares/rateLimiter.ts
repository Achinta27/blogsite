import rateLimit from 'express-rate-limit';

/**
 * Limiters are created per app instance (see app.ts) so each instance has its own
 * in-memory counters. Note: the in-memory store is not shared between processes;
 * a multi-instance deployment needs a shared store (e.g. Redis) for a global limit.
 */
const limiter = (windowMs: number, max: number, message: string) =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message, error: { code: 'TOO_MANY_REQUESTS' } },
  });

export const createRateLimiters = () => ({
  // Login and registration: brute-force protection
  credentials: limiter(
    15 * 60 * 1000,
    20,
    'Too many attempts from this IP. Please try again in 15 minutes.'
  ),
  // Token refresh happens on every page load, so it gets a looser budget
  refresh: limiter(15 * 60 * 1000, 60, 'Too many session refreshes. Please try again later.'),
  general: limiter(60 * 1000, 300, 'Too many requests. Please slow down.'),
});

export type RateLimiters = ReturnType<typeof createRateLimiters>;
