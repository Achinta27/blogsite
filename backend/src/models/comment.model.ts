import { Schema, model, Document, Types } from 'mongoose';

export interface IComment extends Document {
  post: Types.ObjectId;
  author: Types.ObjectId;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}

const commentSchema = new Schema<IComment>(
  {
    post: { type: Schema.Types.ObjectId, ref: 'Post', required: [true, 'Post reference is required'] },
    author: { type: Schema.Types.ObjectId, ref: 'User', required: [true, 'Author is required'], index: true },
    content: {
      type: String,
      required: [true, 'Comment content is required'],
      trim: true,
      minlength: 1,
      maxlength: 2000,
    },
  },
  { timestamps: true }
);

// Comment thread for a post, oldest first
commentSchema.index({ post: 1, createdAt: 1 });

export const Comment = model<IComment>('Comment', commentSchema);
