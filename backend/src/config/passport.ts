import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as FacebookStrategy } from 'passport-facebook';
import { ENV } from './env.js';
import { AuthService } from '../services/auth.service.js';

/**
 * Registers only the providers whose credentials are configured. Sessions are not used:
 * after the callback we issue our own refresh-token session (see auth.controller.ts).
 */
export const configurePassport = (): void => {
  if (ENV.GOOGLE_ENABLED) {
    passport.use(
      new GoogleStrategy(
        {
          clientID: ENV.GOOGLE_CLIENT_ID!,
          clientSecret: ENV.GOOGLE_CLIENT_SECRET!,
          callbackURL: ENV.GOOGLE_CALLBACK_URL,
        },
        async (_accessToken, _refreshToken, profile, done) => {
          try {
            const email = profile.emails?.[0];
            const user = await AuthService.findOrCreateOAuthUser({
              provider: 'google',
              providerId: profile.id,
              email: email?.value,
              emailVerified: Boolean(email?.verified),
              name: profile.displayName || email?.value?.split('@')[0] || '',
              avatar: profile.photos?.[0]?.value,
            });
            done(null, { userId: user.id, role: user.role, permissions: user.permissions });
          } catch (error) {
            done(error as Error);
          }
        }
      )
    );
  }

  if (ENV.FACEBOOK_ENABLED) {
    passport.use(
      new FacebookStrategy(
        {
          clientID: ENV.FACEBOOK_APP_ID!,
          clientSecret: ENV.FACEBOOK_APP_SECRET!,
          callbackURL: ENV.FACEBOOK_CALLBACK_URL,
          profileFields: ['id', 'displayName', 'emails', 'photos'],
          enableProof: true,
        },
        async (_accessToken, _refreshToken, profile, done) => {
          try {
            const email = profile.emails?.[0]?.value;
            const user = await AuthService.findOrCreateOAuthUser({
              provider: 'facebook',
              providerId: profile.id,
              email,
              // Facebook only returns email addresses the user has confirmed
              emailVerified: Boolean(email),
              name: profile.displayName || email?.split('@')[0] || '',
              avatar: profile.photos?.[0]?.value,
            });
            done(null, { userId: user.id, role: user.role, permissions: user.permissions });
          } catch (error) {
            done(error as Error);
          }
        }
      )
    );
  }
};

export const isProviderEnabled = (provider: 'google' | 'facebook'): boolean =>
  provider === 'google' ? ENV.GOOGLE_ENABLED : ENV.FACEBOOK_ENABLED;
