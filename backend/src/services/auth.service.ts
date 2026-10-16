import { Types } from 'mongoose';
import { User, IUser } from '../models/user.model.js';
import { Session } from '../models/session.model.js';
import { AppError } from '../utils/apiError.js';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashToken,
} from '../utils/jwt.js';

const MAX_SESSIONS_PER_USER = 5;

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

export interface AuthResult {
  user: IUser;
  tokens: IssuedTokens;
}

interface RegisterDTO {
  name: string;
  email: string;
  password: string;
}

interface OAuthProfileDTO {
  provider: 'google' | 'facebook';
  providerId: string;
  email?: string;
  emailVerified: boolean;
  name: string;
  avatar?: string;
}

const invalidSession = () =>
  new AppError('Your session has expired. Please sign in again.', 401, 'INVALID_SESSION');

export class AuthService {
  /** Creates a new server-side session and the tokens bound to it. */
  static async createSession(userId: string, userAgent = ''): Promise<IssuedTokens> {
    const sessionId = new Types.ObjectId();
    const refreshToken = signRefreshToken({ userId, sid: sessionId.toString() });
    const { exp } = verifyRefreshToken(refreshToken);
    const refreshExpiresAt = new Date(exp * 1000);

    await Session.create({
      _id: sessionId,
      user: userId,
      tokenHash: hashToken(refreshToken),
      expiresAt: refreshExpiresAt,
      userAgent: userAgent.slice(0, 300),
    });

    // Cap concurrent sessions: drop the oldest beyond the limit
    const stale = await Session.find({ user: userId })
      .sort({ updatedAt: -1 })
      .skip(MAX_SESSIONS_PER_USER)
      .select('_id')
      .lean();
    if (stale.length) await Session.deleteMany({ _id: { $in: stale.map((s) => s._id) } });

    return { accessToken: signAccessToken({ userId }), refreshToken, refreshExpiresAt };
  }

  static async register(dto: RegisterDTO, userAgent?: string): Promise<AuthResult> {
    const email = dto.email.trim().toLowerCase();
    if (await User.exists({ email })) {
      throw new AppError('An account with this email already exists', 409);
    }

    // Role is never taken from the request: public registration always creates a regular user
    const user = await User.create({ name: dto.name, email, password: dto.password, role: 'user' });
    const tokens = await this.createSession(user.id, userAgent);
    return { user, tokens };
  }

  static async login(email: string, password: string, userAgent?: string): Promise<AuthResult> {
    const user = await User.findOne({ email: email.trim().toLowerCase() }).select('+password');

    // Same message for unknown email, OAuth-only account and wrong password
    if (!user || !(await user.comparePassword(password))) {
      throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
    }
    if (!user.isActive) {
      throw new AppError('This account has been deactivated', 403, 'ACCOUNT_DISABLED');
    }

    const tokens = await this.createSession(user.id, userAgent);
    return { user, tokens };
  }

  /**
   * Rotates a refresh token. The session stores only the hash of the latest token, and
   * the swap is a compare-and-set, so each token can be exchanged exactly once. Presenting
   * an already-rotated token is treated as theft: the whole session is revoked.
   */
  static async refresh(refreshToken: string): Promise<AuthResult> {
    let payload: { userId: string; sid: string };
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      throw invalidSession();
    }
    if (!Types.ObjectId.isValid(payload.sid)) throw invalidSession();

    const newRefreshToken = signRefreshToken({ userId: payload.userId, sid: payload.sid });
    const { exp } = verifyRefreshToken(newRefreshToken);
    const refreshExpiresAt = new Date(exp * 1000);

    const rotated = await Session.findOneAndUpdate(
      {
        _id: payload.sid,
        user: payload.userId,
        tokenHash: hashToken(refreshToken),
        expiresAt: { $gt: new Date() },
      },
      { $set: { tokenHash: hashToken(newRefreshToken), expiresAt: refreshExpiresAt } },
      { new: true }
    );

    if (!rotated) {
      // A valid signature for a live session with a different hash means token reuse
      const deleted = await Session.findOneAndDelete({ _id: payload.sid, user: payload.userId });
      if (deleted) {
        throw new AppError(
          'This session was revoked because a refresh token was reused. Please sign in again.',
          401,
          'TOKEN_REUSE'
        );
      }
      throw invalidSession();
    }

    const user = await User.findById(payload.userId);
    if (!user || !user.isActive) {
      await Session.deleteOne({ _id: payload.sid });
      throw invalidSession();
    }

    return {
      user,
      tokens: {
        accessToken: signAccessToken({ userId: user.id }),
        refreshToken: newRefreshToken,
        refreshExpiresAt,
      },
    };
  }

  /** Revokes the session that a refresh token belongs to. Invalid tokens are ignored. */
  static async logout(refreshToken?: string): Promise<void> {
    if (!refreshToken) return;
    try {
      const { sid, userId } = verifyRefreshToken(refreshToken);
      await Session.deleteOne({ _id: sid, user: userId });
    } catch {
      // Nothing to revoke
    }
  }

  static async revokeAllSessions(userId: string): Promise<void> {
    await Session.deleteMany({ user: userId });
  }

  static async getMe(userId: string): Promise<IUser> {
    const user = await User.findById(userId);
    if (!user) throw new AppError('User not found', 404);
    return user;
  }

  static async updateProfile(userId: string, dto: { name?: string; bio?: string }): Promise<IUser> {
    const user = await User.findById(userId);
    if (!user) throw new AppError('User not found', 404);
    if (dto.name !== undefined) user.name = dto.name;
    if (dto.bio !== undefined) user.bio = dto.bio;
    await user.save();
    return user;
  }

  /**
   * Finds or creates the user for a verified OAuth profile.
   * - An existing link (provider id) always wins.
   * - Otherwise an existing account is linked by email only when the provider has
   *   verified that email, so nobody can take over an account with an unverified address.
   * - New accounts always get the regular `user` role.
   */
  static async findOrCreateOAuthUser(profile: OAuthProfileDTO): Promise<IUser> {
    const idField = profile.provider === 'google' ? 'googleId' : 'facebookId';

    let user = await User.findOne({ [idField]: profile.providerId });

    if (!user) {
      if (!profile.email) {
        throw new AppError('Your provider did not share an email address', 400, 'OAUTH_EMAIL_REQUIRED');
      }
      if (!profile.emailVerified) {
        throw new AppError('Your provider email address is not verified', 400, 'OAUTH_EMAIL_UNVERIFIED');
      }

      const email = profile.email.toLowerCase();
      user = await User.findOne({ email });

      if (user) {
        user.set(idField, profile.providerId);
        if (!user.avatar && profile.avatar) user.avatar = profile.avatar;
        await user.save();
      } else {
        const name = profile.name.trim().slice(0, 50);
        user = await User.create({
          name: name.length >= 2 ? name : 'Reader',
          email,
          role: 'user',
          avatar: profile.avatar || '',
          [idField]: profile.providerId,
        });
      }
    }

    if (!user.isActive) {
      throw new AppError('This account has been deactivated', 403, 'ACCOUNT_DISABLED');
    }
    return user;
  }
}
