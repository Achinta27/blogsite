import jwt from 'jsonwebtoken';
import {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  hashToken,
} from '../src/utils/jwt.js';

describe('JWT utilities', () => {
  const userId = '60d0fe4f5311236168a109ca';

  it('signs and verifies access tokens', () => {
    expect(verifyAccessToken(signAccessToken({ userId })).userId).toBe(userId);
  });

  it('signs refresh tokens bound to a session, unique on every call', () => {
    const a = signRefreshToken({ userId, sid: 'abc' });
    const b = signRefreshToken({ userId, sid: 'abc' });
    expect(a).not.toBe(b);
    expect(verifyRefreshToken(a)).toMatchObject({ userId, sid: 'abc' });
  });

  it('does not accept a refresh token as an access token or vice versa', () => {
    expect(() => verifyAccessToken(signRefreshToken({ userId, sid: 'abc' }))).toThrow();
    expect(() => verifyRefreshToken(signAccessToken({ userId }))).toThrow();
  });

  it('rejects the "none" algorithm', () => {
    const unsigned = jwt.sign({ userId }, '', { algorithm: 'none' });
    expect(() => verifyAccessToken(unsigned)).toThrow();
  });

  it('hashes tokens deterministically', () => {
    expect(hashToken('x')).toBe(hashToken('x'));
    expect(hashToken('x')).toHaveLength(64);
  });
});
