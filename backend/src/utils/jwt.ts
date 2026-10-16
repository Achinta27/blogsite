import crypto from 'crypto';
import jwt, { SignOptions } from 'jsonwebtoken';
import { ENV } from '../config/env.js';

export interface AccessTokenPayload {
  userId: string;
}

export interface RefreshTokenPayload {
  userId: string;
  sid: string;
}

const ALGORITHM = 'HS256';

export const signAccessToken = (payload: AccessTokenPayload): string =>
  jwt.sign(payload, ENV.JWT_ACCESS_SECRET, {
    algorithm: ALGORITHM,
    expiresIn: ENV.JWT_ACCESS_EXPIRES_IN as SignOptions['expiresIn'],
  });

export const signRefreshToken = (payload: RefreshTokenPayload): string =>
  jwt.sign(payload, ENV.JWT_REFRESH_SECRET, {
    algorithm: ALGORITHM,
    expiresIn: ENV.JWT_REFRESH_EXPIRES_IN as SignOptions['expiresIn'],
    // A random jti guarantees every rotated token is distinct, even within the same second
    jwtid: crypto.randomUUID(),
  });

export const verifyAccessToken = (token: string): AccessTokenPayload =>
  jwt.verify(token, ENV.JWT_ACCESS_SECRET, { algorithms: [ALGORITHM] }) as AccessTokenPayload;

export const verifyRefreshToken = (token: string): RefreshTokenPayload & { exp: number } =>
  jwt.verify(token, ENV.JWT_REFRESH_SECRET, { algorithms: [ALGORITHM] }) as RefreshTokenPayload & {
    exp: number;
  };

/** Only a SHA-256 digest of each refresh token is persisted. */
export const hashToken = (token: string): string =>
  crypto.createHash('sha256').update(token).digest('hex');
