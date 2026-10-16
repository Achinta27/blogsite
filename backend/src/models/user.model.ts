import { Schema, model, Document } from 'mongoose';
import bcrypt from 'bcryptjs';
import { PERMISSIONS, ROLES, type Permission, type UserRole } from '../config/permissions.js';

export type { UserRole };

export interface IUser extends Document {
  name: string;
  email: string;
  password?: string;
  role: UserRole;
  /** Only meaningful for staff; always empty for other roles. */
  permissions: Permission[];
  isActive: boolean;
  avatar?: string;
  bio?: string;
  googleId?: string;
  facebookId?: string;
  comparePassword(candidatePassword: string): Promise<boolean>;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: [true, 'Name is required'], trim: true, minlength: 2, maxlength: 50 },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
    },
    // Absent for accounts created through OAuth only
    password: { type: String, select: false },
    role: { type: String, enum: ROLES, default: 'user' },
    permissions: { type: [{ type: String, enum: PERMISSIONS }], default: [] },
    isActive: { type: Boolean, default: true },
    avatar: { type: String, default: '' },
    bio: { type: String, trim: true, maxlength: 280, default: '' },
    googleId: { type: String, select: false },
    facebookId: { type: String, select: false },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret.password;
        delete ret.googleId;
        delete ret.facebookId;
        delete ret.__v;
        return ret;
      },
    },
  }
);

userSchema.index({ googleId: 1 }, { unique: true, sparse: true });
userSchema.index({ facebookId: 1 }, { unique: true, sparse: true });
// "Last active admin" checks, moderator lookups and admin filtering
userSchema.index({ role: 1, isActive: 1 });

// Invariant: permissions exist only on staff accounts, without duplicates
userSchema.pre('validate', function (next) {
  this.permissions = this.role === 'staff' ? [...new Set(this.permissions)] : [];
  next();
});

userSchema.pre('save', async function (next) {
  if (!this.isModified('password') || !this.password) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = async function (candidatePassword: string): Promise<boolean> {
  if (!this.password) return false;
  return bcrypt.compare(candidatePassword, this.password);
};

export const User = model<IUser>('User', userSchema);
