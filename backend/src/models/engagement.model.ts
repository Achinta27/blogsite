import { Schema, model, Document, Types } from 'mongoose';

export interface IEngagement extends Document {
  user: Types.ObjectId;
  post: Types.ObjectId;
  createdAt: Date;
}

const engagementSchema = () => {
  const schema = new Schema<IEngagement>(
    {
      user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
      post: { type: Schema.Types.ObjectId, ref: 'Post', required: true },
    },
    { timestamps: { createdAt: true, updatedAt: false } }
  );
  // The database, not application code, guarantees one like/bookmark per user and post
  schema.index({ user: 1, post: 1 }, { unique: true });
  // "My bookmarks" newest first
  schema.index({ user: 1, createdAt: -1 });
  return schema;
};

export const Like = model<IEngagement>('Like', engagementSchema());
export const Bookmark = model<IEngagement>('Bookmark', engagementSchema());
