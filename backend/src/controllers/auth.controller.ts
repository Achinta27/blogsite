import crypto from 'crypto';
import { Request, Response, NextFunction, CookieOptions } from 'express';
import passport from 'passport';
import { AuthService, AuthResult } from '../services/auth.service.js';
import { sendResponse } from '../utils/apiResponse.js';
import { AuthenticatedRequest } from '../middlewares/auth.middleware.js';
import { ENV } from '../config/env.js';
import { isProviderEnabled } from '../config/passport.js';
import { AppError } from '../utils/apiError.js';
import { AuditService, auditContext } from '../services/audit.service.js';

export const REFRESH_COOKIE = 'refreshToken';
const OAUTH_STATE_COOKIE = 'oauthState';
const AUTH_COOKIE_PATH = '/api/v1/auth';

const baseCookieOptions = (): CookieOptions => ({
  httpOnly: true,
  // SameSite=None is only accepted by browsers on Secure cookies
  secure: ENV.IS_PRODUCTION || ENV.COOKIE_SAMESITE === 'none',
  sameSite: ENV.COOKIE_SAMESITE,
  path: AUTH_COOKIE_PATH,
});

const setRefreshCookie = (res: Response, token: string, expires: Date) =>
  res.cookie(REFRESH_COOKIE, token, { ...baseCookieOptions(), expires });

const clearRefreshCookie = (res: Response) => res.clearCookie(REFRESH_COOKIE, baseCookieOptions());

/** Never exposes the refresh token in the body; it lives only in the HttpOnly cookie. */
const sendAuthResult = (res: Response, result: AuthResult, statusCode: number, message: string) => {
  setRefreshCookie(res, result.tokens.refreshToken, result.tokens.refreshExpiresAt);
  res.locals.actorId = result.user.id;
  res.locals.actorRole = result.user.role;
  sendResponse({
    res,
    statusCode,
    message,
    data: { user: result.user, accessToken: result.tokens.accessToken },
  });
};

type Provider = 'google' | 'facebook';
const SCOPES: Record<Provider, string[]> = {
  google: ['profile', 'email'],
  facebook: ['email', 'public_profile'],
};

const redirectToClient = (res: Response, path: string) => res.redirect(`${ENV.CLIENT_URL}${path}`);

export class AuthController {
  static async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { name, email, password } = req.body;
      const result = await AuthService.register({ name, email, password }, req.get('user-agent'));
      sendAuthResult(res, result, 201, 'Registration successful');
    } catch (error) {
      next(error);
    }
  }

  static async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email, password } = req.body;
      const result = await AuthService.login(email, password, req.get('user-agent'));
      sendAuthResult(res, result, 200, 'Login successful');
    } catch (error) {
      next(error);
    }
  }

  static async refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const token = req.cookies?.[REFRESH_COOKIE];
      if (!token) throw new AppError('No active session', 401, 'INVALID_SESSION');
      const result = await AuthService.refresh(token);
      sendAuthResult(res, result, 200, 'Session refreshed');
    } catch (error) {
      clearRefreshCookie(res);
      next(error);
    }
  }

  static async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await AuthService.logout(req.cookies?.[REFRESH_COOKIE]);
      clearRefreshCookie(res);
      sendResponse({ res, message: 'Logged out successfully' });
    } catch (error) {
      next(error);
    }
  }

  static async getMe(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = await AuthService.getMe(req.user!.userId);
      sendResponse({ res, message: 'Current user retrieved', data: user });
    } catch (error) {
      next(error);
    }
  }

  static async updateMe(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = await AuthService.updateProfile(req.user!.userId, req.body);
      sendResponse({ res, message: 'Profile updated', data: user });
    } catch (error) {
      next(error);
    }
  }

  /** Redirects to the provider with a random `state` that is also kept in an HttpOnly cookie. */
  static oauthStart(provider: Provider) {
    return (req: Request, res: Response, next: NextFunction): void => {
      if (!isProviderEnabled(provider)) {
        return redirectToClient(res, `/login?oauth_error=unavailable&provider=${provider}`);
      }
      const state = crypto.randomBytes(24).toString('hex');
      res.cookie(OAUTH_STATE_COOKIE, state, {
        ...baseCookieOptions(),
        // Must survive the top-level redirect back from the provider
        sameSite: 'lax',
        secure: ENV.IS_PRODUCTION,
        maxAge: 10 * 60 * 1000,
      });
      passport.authenticate(provider, { session: false, scope: SCOPES[provider], state })(req, res, next);
    };
  }

  /**
   * Validates `state`, lets Passport exchange the code, then creates our own session and
   * sends the browser back to the client. No token is ever placed in the redirect URL:
   * the client calls /auth/refresh, which reads the HttpOnly cookie set here.
   */
  static oauthCallback(provider: Provider) {
    return (req: Request, res: Response, next: NextFunction): void => {
      const fail = (reason: string) => redirectToClient(res, `/login?oauth_error=${reason}&provider=${provider}`);

      if (!isProviderEnabled(provider)) return fail('unavailable');

      const expectedState = req.cookies?.[OAUTH_STATE_COOKIE];
      res.clearCookie(OAUTH_STATE_COOKIE, { ...baseCookieOptions(), sameSite: 'lax', secure: ENV.IS_PRODUCTION });

      if (req.query.error) return fail('cancelled');

      const receivedState = typeof req.query.state === 'string' ? req.query.state : '';
      const stateMatches =
        Boolean(expectedState) &&
        expectedState.length === receivedState.length &&
        crypto.timingSafeEqual(Buffer.from(expectedState), Buffer.from(receivedState));
      if (!stateMatches) return fail('state');

      passport.authenticate(provider, { session: false }, async (err: unknown, user: Express.User | false) => {
        if (err || !user) {
          const code = err instanceof AppError ? err.code.toLowerCase() : 'failed';
          return fail(code);
        }
        try {
          const tokens = await AuthService.createSession(user.userId, req.get('user-agent'));
          setRefreshCookie(res, tokens.refreshToken, tokens.refreshExpiresAt);
          void AuditService.log(
            { ...auditContext(req), actorId: user.userId, actorRole: user.role },
            { action: `auth.oauth_login.${provider}`, resourceType: 'session', resourceId: user.userId }
          );
          redirectToClient(res, '/auth/callback');
        } catch (error) {
          next(error);
        }
      })(req, res, next);
    };
  }
}
