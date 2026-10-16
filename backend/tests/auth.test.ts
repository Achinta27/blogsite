import jwt from 'jsonwebtoken';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { User } from '../src/models/user.model.js';
import { Session } from '../src/models/session.model.js';
import { AuthService } from '../src/services/auth.service.js';
import { useTestDatabase, newApp, createUser, refreshCookieFrom } from './helpers.js';

useTestDatabase();

const registration = { name: 'Ada Lovelace', email: 'Ada@Example.com', password: 'analytical-engine' };

describe('Registration', () => {
  it('creates a regular user, sets an HttpOnly refresh cookie and never returns secrets', async () => {
    const res = await newApp().post('/api/v1/auth/register').send(registration);

    expect(res.status).toBe(201);
    expect(res.body.data.user).toMatchObject({ name: 'Ada Lovelace', email: 'ada@example.com', role: 'user' });
    expect(res.body.data.accessToken).toEqual(expect.any(String));
    expect(res.body.data.user.password).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toMatch(/refreshToken/);

    const cookie = ([] as string[]).concat(res.headers['set-cookie']).find((c) => c.startsWith('refreshToken='))!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Path=\/api\/v1\/auth/);
  });

  it('stores a bcrypt hash, not the password', async () => {
    await newApp().post('/api/v1/auth/register').send(registration);
    const user = await User.findOne({ email: 'ada@example.com' }).select('+password');
    expect(user!.password).not.toBe(registration.password);
    expect(user!.password).toMatch(/^\$2[aby]\$12\$/);
  });

  it('rejects a duplicate email regardless of case', async () => {
    await newApp().post('/api/v1/auth/register').send(registration);
    const res = await newApp()
      .post('/api/v1/auth/register')
      .send({ ...registration, email: 'ADA@example.COM' });
    expect(res.status).toBe(409);
    expect(await User.countDocuments()).toBe(1);
  });

  it('cannot be used to create an administrator', async () => {
    const res = await newApp()
      .post('/api/v1/auth/register')
      .send({ ...registration, role: 'admin' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(await User.countDocuments({ role: 'admin' })).toBe(0);
  });

  it('validates input', async () => {
    const res = await newApp().post('/api/v1/auth/register').send({ name: 'A', email: 'nope', password: 'short' });
    expect(res.status).toBe(400);
    const fields = res.body.error.details.map((d: { field: string }) => d.field);
    expect(fields).toEqual(expect.arrayContaining(['name', 'email', 'password']));
  });
});

describe('Login', () => {
  beforeEach(async () => {
    await newApp().post('/api/v1/auth/register').send(registration);
  });

  it('succeeds with correct credentials', async () => {
    const res = await newApp()
      .post('/api/v1/auth/login')
      .send({ email: 'ada@example.com', password: registration.password });
    expect(res.status).toBe(200);
    expect(refreshCookieFrom(res)).toBeDefined();
    expect(res.body.data.accessToken).toEqual(expect.any(String));
  });

  it('fails with a wrong password or unknown email using the same message', async () => {
    const wrong = await newApp().post('/api/v1/auth/login').send({ email: 'ada@example.com', password: 'nope-nope' });
    const unknown = await newApp().post('/api/v1/auth/login').send({ email: 'who@example.com', password: 'nope-nope' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.message).toBe(unknown.body.message);
  });

  it('refuses deactivated accounts', async () => {
    await User.updateOne({ email: 'ada@example.com' }, { isActive: false });
    const res = await newApp()
      .post('/api/v1/auth/login')
      .send({ email: 'ada@example.com', password: registration.password });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ACCOUNT_DISABLED');
  });
});

describe('Access tokens', () => {
  it('rejects requests without a token', async () => {
    const res = await newApp().get('/api/v1/auth/me');
    expect(res.status).toBe(401);
  });

  it('rejects a tampered token', async () => {
    const { token } = await createUser();
    const res = await newApp().get('/api/v1/auth/me').set('Authorization', `Bearer ${token}x`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });

  it('rejects a token signed with another secret', async () => {
    const { user } = await createUser();
    const forged = jwt.sign({ userId: user.id }, 'not-the-real-secret-not-the-real-secret');
    const res = await newApp().get('/api/v1/auth/me').set('Authorization', `Bearer ${forged}`);
    expect(res.status).toBe(401);
  });

  it('rejects an expired token', async () => {
    const { user } = await createUser();
    const expired = jwt.sign({ userId: user.id }, process.env.JWT_ACCESS_SECRET!, { expiresIn: -10 });
    const res = await newApp().get('/api/v1/auth/me').set('Authorization', `Bearer ${expired}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_EXPIRED');
  });

  it('stops working as soon as the account is deactivated', async () => {
    const { user, auth } = await createUser();
    expect((await newApp().get('/api/v1/auth/me').set(auth)).status).toBe(200);
    await User.updateOne({ _id: user._id }, { isActive: false });
    expect((await newApp().get('/api/v1/auth/me').set(auth)).status).toBe(403);
  });
});

describe('Refresh token rotation', () => {
  const login = async () => {
    await newApp().post('/api/v1/auth/register').send(registration);
    const res = await newApp()
      .post('/api/v1/auth/login')
      .send({ email: 'ada@example.com', password: registration.password });
    return refreshCookieFrom(res)!;
  };

  it('stores only a hash of the refresh token', async () => {
    const cookie = await login();
    const raw = cookie.split('=')[1];
    const sessions = await Session.find().lean();
    expect(sessions.length).toBeGreaterThan(0);
    sessions.forEach((s) => expect(s.tokenHash).not.toBe(raw));
  });

  it('issues a new refresh token and access token', async () => {
    const cookie = await login();
    const res = await newApp().post('/api/v1/auth/refresh').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toEqual(expect.any(String));
    const rotated = refreshCookieFrom(res);
    expect(rotated).toBeDefined();
    expect(rotated).not.toBe(cookie);
  });

  it('detects reuse of a rotated token and revokes the session', async () => {
    const original = await login();
    const first = await newApp().post('/api/v1/auth/refresh').set('Cookie', original);
    const rotated = refreshCookieFrom(first)!;

    const reuse = await newApp().post('/api/v1/auth/refresh').set('Cookie', original);
    expect(reuse.status).toBe(401);
    expect(reuse.body.error.code).toBe('TOKEN_REUSE');

    // The legitimate holder of the newer token is also signed out
    const afterReuse = await newApp().post('/api/v1/auth/refresh').set('Cookie', rotated);
    expect(afterReuse.status).toBe(401);
  });

  it('requires a refresh cookie', async () => {
    const res = await newApp().post('/api/v1/auth/refresh');
    expect(res.status).toBe(401);
  });

  it('rejects refresh requests from an untrusted origin', async () => {
    const cookie = await login();
    const res = await newApp()
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookie)
      .set('Origin', 'https://evil.example');
    expect(res.status).toBe(403);
  });

  it('logout revokes the session and clears the cookie', async () => {
    const cookie = await login();
    const sessionsBefore = await Session.countDocuments();

    const res = await newApp().post('/api/v1/auth/logout').set('Cookie', cookie);
    expect(res.status).toBe(200);
    const cleared = ([] as string[]).concat(res.headers['set-cookie']).find((c) => c.startsWith('refreshToken='))!;
    expect(cleared).toMatch(/refreshToken=;/);
    expect(cleared).toMatch(/Expires=Thu, 01 Jan 1970/);
    expect(await Session.countDocuments()).toBe(sessionsBefore - 1);

    const refresh = await newApp().post('/api/v1/auth/refresh').set('Cookie', cookie);
    expect(refresh.status).toBe(401);
  });

  it('refuses to refresh for a deactivated account', async () => {
    const cookie = await login();
    await User.updateOne({ email: 'ada@example.com' }, { isActive: false });
    const res = await newApp().post('/api/v1/auth/refresh').set('Cookie', cookie);
    expect(res.status).toBe(401);
  });
});

describe('Rate limiting', () => {
  it('limits repeated login attempts', async () => {
    const app = request(createApp());
    const attempts = [];
    for (let i = 0; i < 20; i++) {
      attempts.push(await app.post('/api/v1/auth/login').send({ email: 'x@example.com', password: 'wrong-pass' }));
    }
    expect(attempts.every((r) => r.status === 401)).toBe(true);

    const blocked = await app.post('/api/v1/auth/login').send({ email: 'x@example.com', password: 'wrong-pass' });
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('TOO_MANY_REQUESTS');
  });
});

describe('Profile', () => {
  it('lets a user update their name and bio but not their role', async () => {
    const { auth } = await createUser();
    const ok = await newApp().patch('/api/v1/auth/me').set(auth).send({ name: 'New Name', bio: 'Writes about tea.' });
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({ name: 'New Name', bio: 'Writes about tea.', role: 'user' });

    const escalate = await newApp().patch('/api/v1/auth/me').set(auth).send({ role: 'admin' });
    expect(escalate.status).toBe(400);
  });
});

describe('OAuth', () => {
  it('redirects to Google with a state value that is also stored in an HttpOnly cookie', async () => {
    const res = await newApp().get('/api/v1/auth/google');
    expect(res.status).toBe(302);
    const location = new URL(res.headers.location);
    expect(location.hostname).toBe('accounts.google.com');
    const state = location.searchParams.get('state');
    expect(state).toMatch(/^[a-f0-9]{48}$/);

    const cookie = ([] as string[]).concat(res.headers['set-cookie']).find((c) => c.startsWith('oauthState='))!;
    expect(cookie).toContain(state);
    expect(cookie).toMatch(/HttpOnly/i);
  });

  it('rejects a callback whose state does not match', async () => {
    const res = await newApp()
      .get('/api/v1/auth/google/callback?code=abc&state=forged')
      .set('Cookie', 'oauthState=expected');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('http://client.test/login?oauth_error=state&provider=google');
  });

  it('handles a cancelled consent screen', async () => {
    const res = await newApp().get('/api/v1/auth/google/callback?error=access_denied&state=x').set('Cookie', 'oauthState=x');
    expect(res.headers.location).toBe('http://client.test/login?oauth_error=cancelled&provider=google');
  });

  it('reports an unconfigured provider instead of failing obscurely', async () => {
    const res = await newApp().get('/api/v1/auth/facebook');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('http://client.test/login?oauth_error=unavailable&provider=facebook');
  });

  describe('account linking', () => {
    const profile = {
      provider: 'google' as const,
      providerId: 'google-123',
      email: 'grace@example.com',
      emailVerified: true,
      name: 'Grace Hopper',
    };

    it('creates new OAuth users with the regular role', async () => {
      const user = await AuthService.findOrCreateOAuthUser(profile);
      expect(user.role).toBe('user');
      expect(user.email).toBe('grace@example.com');
    });

    it('links a verified provider email to an existing account', async () => {
      const { user: existing } = await createUser({ email: 'grace@example.com' });
      const linked = await AuthService.findOrCreateOAuthUser(profile);
      expect(linked.id).toBe(existing.id);
      const again = await AuthService.findOrCreateOAuthUser({ ...profile, email: 'changed@example.com' });
      expect(again.id).toBe(existing.id);
    });

    it('refuses to link an unverified provider email', async () => {
      await createUser({ email: 'grace@example.com' });
      await expect(AuthService.findOrCreateOAuthUser({ ...profile, emailVerified: false })).rejects.toMatchObject({
        code: 'OAUTH_EMAIL_UNVERIFIED',
      });
    });

    it('refuses deactivated accounts', async () => {
      await createUser({ email: 'grace@example.com', isActive: false });
      await expect(AuthService.findOrCreateOAuthUser(profile)).rejects.toMatchObject({ code: 'ACCOUNT_DISABLED' });
    });
  });
});
