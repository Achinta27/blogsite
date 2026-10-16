import { User, IUser } from '../models/user.model.js';
import { Post } from '../models/post.model.js';
import { Comment } from '../models/comment.model.js';
import { Like } from '../models/engagement.model.js';
import { AuditLog } from '../models/auditLog.model.js';
import { AppError } from '../utils/apiError.js';
import { escapeRegex } from '../utils/content.js';
import { PERMISSION_DEPENDENCIES, type Permission, type UserRole } from '../config/permissions.js';
import { AuthService } from './auth.service.js';
import { AuditService, AuditContext } from './audit.service.js';
import { NotificationService } from './notification.service.js';
import { paginationMeta, CATEGORY_FIELDS } from './post.service.js';
import { realtime } from '../socket/realtime.js';

interface Page {
  page: number;
  limit: number;
}

const containsInsensitive = (value: string) => ({ $regex: escapeRegex(value), $options: 'i' });

const USER_LIST_FIELDS = 'name email role permissions isActive avatar createdAt';

/** Throws if `user` is the only remaining active administrator. */
const assertNotLastActiveAdmin = async (user: IUser) => {
  if (user.role !== 'admin' || !user.isActive) return;
  const others = await User.countDocuments({ role: 'admin', isActive: true, _id: { $ne: user._id } });
  if (others === 0) throw new AppError('At least one active administrator must remain', 409, 'LAST_ADMIN');
};

const assertPermissionDependencies = (permissions: Permission[]) => {
  for (const permission of permissions) {
    const missing = (PERMISSION_DEPENDENCIES[permission] ?? []).filter((p) => !permissions.includes(p));
    if (missing.length) {
      throw new AppError(`"${permission}" also requires ${missing.map((m) => `"${m}"`).join(', ')}`, 400, 'VALIDATION_ERROR');
    }
  }
};

export class AdminService {
  /**
   * Counting rules: totalPosts counts every record; posts by status exclude soft-deleted
   * ones; deletedPosts counts soft-deleted posts of any status; pendingReview includes
   * edits to published posts awaiting review.
   */
  static async getDashboard() {
    const [usersByRole, activeUsers, postsByStatus, totalPosts, deletedPosts, pendingRevisions, totalComments, totalLikes, recentActivity] =
      await Promise.all([
        User.aggregate<{ _id: string; count: number }>([{ $group: { _id: '$role', count: { $sum: 1 } } }]),
        User.countDocuments({ isActive: true }),
        Post.aggregate<{ _id: string; count: number }>([
          { $match: { isDeleted: false } },
          { $group: { _id: '$status', count: { $sum: 1 } } },
        ]),
        Post.countDocuments(),
        Post.countDocuments({ isDeleted: true }),
        Post.countDocuments({ isDeleted: false, 'revision.status': 'pending_review' }),
        Comment.countDocuments(),
        Like.countDocuments(),
        AuditLog.find().sort({ createdAt: -1 }).limit(10).populate('actor', 'name').lean(),
      ]);

    const roles = Object.fromEntries(usersByRole.map((r) => [r._id, r.count]));
    const statuses = Object.fromEntries(postsByStatus.map((s) => [s._id, s.count]));
    return {
      stats: {
        totalUsers: Object.values(roles).reduce((a: number, b) => a + (b as number), 0),
        activeUsers,
        admins: roles.admin ?? 0,
        staff: roles.staff ?? 0,
        totalPosts,
        publishedPosts: statuses.published ?? 0,
        draftPosts: statuses.draft ?? 0,
        pendingReview: (statuses.pending_review ?? 0) + pendingRevisions,
        rejectedPosts: statuses.rejected ?? 0,
        archivedPosts: statuses.archived ?? 0,
        deletedPosts,
        totalComments,
        totalLikes,
      },
      recentActivity,
    };
  }

  static async listUsers(query: Page & { search?: string; role?: UserRole; status?: 'active' | 'inactive' }) {
    const filter: Record<string, unknown> = {};
    if (query.search) filter.$or = [{ name: containsInsensitive(query.search) }, { email: containsInsensitive(query.search) }];
    if (query.role) filter.role = query.role;
    if (query.status) filter.isActive = query.status === 'active';

    const [users, total] = await Promise.all([
      User.find(filter)
        .select(USER_LIST_FIELDS)
        .sort({ createdAt: -1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .lean(),
      User.countDocuments(filter),
    ]);
    return { users, meta: paginationMeta(query, total) };
  }

  /** One account with its recent actions (what a staff member has done). */
  static async getUser(userId: string) {
    const user = await User.findById(userId).select(USER_LIST_FIELDS).lean();
    if (!user) throw new AppError('User not found', 404);
    const [recentActions, moderationCounts] = await Promise.all([
      AuditLog.find({ actor: userId }).sort({ createdAt: -1 }).limit(25).lean(),
      AuditLog.aggregate<{ _id: string; count: number }>([
        { $match: { actor: user._id, action: { $in: ['post.approved', 'post.rejected', 'comment.moderated'] } } },
        { $group: { _id: '$action', count: { $sum: 1 } } },
      ]),
    ]);
    return { user, recentActions, moderationCounts: Object.fromEntries(moderationCounts.map((c) => [c._id, c.count])) };
  }

  /** Creates a staff account with an initial password the admin hands over out of band. */
  static async createStaff(
    input: { name: string; email: string; password: string; permissions: Permission[] },
    ctx: AuditContext
  ) {
    assertPermissionDependencies(input.permissions);
    if (await User.exists({ email: input.email })) throw new AppError('An account with this email already exists', 409);
    const user = await User.create({ ...input, role: 'staff' });
    await AuditService.log(ctx, {
      action: 'staff.created',
      resourceType: 'user',
      resourceId: user.id,
      newState: { role: 'staff', permissions: user.permissions },
    });
    return User.findById(user.id).select(USER_LIST_FIELDS).lean();
  }

  /**
   * Changes a role. Leaving the staff role clears permissions (enforced by the model).
   * The user's sockets are reconnected so their rooms match the new role immediately.
   */
  static async updateUserRole(userId: string, role: UserRole, ctx: AuditContext) {
    const user = await User.findById(userId);
    if (!user) throw new AppError('User not found', 404);
    if (user.role === role) return User.findById(userId).select(USER_LIST_FIELDS).lean();
    if (role !== 'admin') await assertNotLastActiveAdmin(user);

    const previousState = { role: user.role, permissions: [...user.permissions] };
    user.role = role;
    await user.save();

    await AuditService.log(ctx, {
      action: 'user.role_changed',
      resourceType: 'user',
      resourceId: user.id,
      previousState,
      newState: { role: user.role, permissions: user.permissions },
    });
    await NotificationService.notify({
      recipients: [user._id],
      actorId: ctx.actorId,
      type: 'role_changed',
      message: `Your role is now ${role}`,
      resourceType: 'user',
      resourceId: user._id,
      link: role === 'user' ? '/' : '/admin',
    });
    realtime.disconnectUser(user.id);
    return User.findById(userId).select(USER_LIST_FIELDS).lean();
  }

  /** Replaces a staff member's permission set; grants and revocations are audited separately. */
  static async setPermissions(userId: string, permissions: Permission[], ctx: AuditContext) {
    if (userId === ctx.actorId) throw new AppError('You cannot change your own permissions', 403);
    assertPermissionDependencies(permissions);

    const user = await User.findById(userId);
    if (!user) throw new AppError('User not found', 404);
    if (user.role !== 'staff') throw new AppError('Permissions can only be assigned to staff accounts', 409);

    const before = [...user.permissions];
    const next = [...new Set(permissions)];
    const granted = next.filter((p) => !before.includes(p));
    const revoked = before.filter((p) => !next.includes(p));
    if (!granted.length && !revoked.length) return User.findById(userId).select(USER_LIST_FIELDS).lean();

    user.permissions = next;
    await user.save();

    await AuditService.log(ctx, {
      action: 'staff.permissions_changed',
      resourceType: 'user',
      resourceId: user.id,
      previousState: { permissions: before },
      newState: { permissions: next, granted, revoked },
    });
    const parts = [granted.length && `granted ${granted.join(', ')}`, revoked.length && `revoked ${revoked.join(', ')}`].filter(Boolean);
    await NotificationService.notify({
      recipients: [user._id],
      actorId: ctx.actorId,
      type: 'staff_permissions_changed',
      message: `Your permissions were updated: ${parts.join('; ')}`,
      resourceType: 'user',
      resourceId: user._id,
      link: '/admin',
    });
    realtime.disconnectUser(user.id);
    return User.findById(userId).select(USER_LIST_FIELDS).lean();
  }

  /** Deactivation is immediate: sessions are revoked, sockets dropped, API calls rejected. */
  static async updateUserStatus(userId: string, isActive: boolean, ctx: AuditContext) {
    if (userId === ctx.actorId) throw new AppError('You cannot change the status of your own account', 409);
    const user = await User.findById(userId);
    if (!user) throw new AppError('User not found', 404);
    if (user.isActive === isActive) return User.findById(userId).select(USER_LIST_FIELDS).lean();
    if (!isActive) await assertNotLastActiveAdmin(user);

    user.isActive = isActive;
    await user.save();
    if (!isActive) {
      await AuthService.revokeAllSessions(user.id);
      realtime.disconnectUser(user.id);
    }

    await AuditService.log(ctx, {
      action: isActive ? 'user.activated' : 'user.deactivated',
      resourceType: 'user',
      resourceId: user.id,
      previousState: { isActive: !isActive },
      newState: { isActive },
    });
    if (user.role === 'staff') {
      await NotificationService.notify({
        recipients: [user._id],
        actorId: ctx.actorId,
        type: 'account_status_changed',
        message: isActive ? 'Your staff account was reactivated' : 'Your staff account was deactivated',
        resourceType: 'user',
        resourceId: user._id,
      });
    }
    return User.findById(userId).select(USER_LIST_FIELDS).lean();
  }

  /** Every post in any state, for administrative views. */
  static async listPosts(query: Page & { search?: string; status?: string }) {
    const filter: Record<string, unknown> = {};
    if (query.status === 'deleted') filter.isDeleted = true;
    else if (query.status) Object.assign(filter, { status: query.status, isDeleted: false });
    if (query.search) filter.title = containsInsensitive(query.search);

    const [posts, total] = await Promise.all([
      Post.find(filter)
        .select('-content -revision.content')
        .sort({ updatedAt: -1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .populate('author', 'name email')
        .populate('category', CATEGORY_FIELDS)
        .populate('reviewedBy', 'name')
        .lean(),
      Post.countDocuments(filter),
    ]);
    return { posts, meta: paginationMeta(query, total) };
  }

  static async listAuditLogs(
    query: Page & { actor?: string; action?: string; resourceType?: string; resourceId?: string; from?: Date; to?: Date }
  ) {
    const filter: Record<string, unknown> = {};
    if (query.actor) filter.actor = query.actor;
    if (query.action) filter.action = query.action;
    if (query.resourceType) filter.resourceType = query.resourceType;
    if (query.resourceId) filter.resourceId = query.resourceId;
    if (query.from || query.to) {
      filter.createdAt = { ...(query.from ? { $gte: query.from } : {}), ...(query.to ? { $lte: query.to } : {}) };
    }

    const [logs, total, actions] = await Promise.all([
      AuditLog.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .populate('actor', 'name email role')
        .lean(),
      AuditLog.countDocuments(filter),
      AuditLog.distinct('action'),
    ]);
    return { logs, meta: { ...paginationMeta(query, total), actions: (actions as string[]).sort() } };
  }
}
