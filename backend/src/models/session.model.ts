import { Schema, model, Document, Types } from 'mongoose';

/**
 * One document per signed-in device. Holds the SHA-256 hash of the *current* refresh
 * token only; rotation overwrites it, so a previously issued token no longer matches.
 */
export interface ISession extends Document {
  user: Types.ObjectId;
  tokenHash: string;
  expiresAt: Date;
  userAgent: string;
  createdAt: Date;
  updatedAt: Date;
}

const sessionSchema = new Schema<ISession>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    userAgent: { type: String, default: '', maxlength: 300 },
  },
  { timestamps: true }
);

// MongoDB removes expired sessions automatically
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Session = model<ISession>('Session', sessionSchema);
