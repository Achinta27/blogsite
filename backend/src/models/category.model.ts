import { Schema, model, Document } from 'mongoose';

export interface ICategory extends Document {
  name: string;
  /** Lower-case, URL-safe form of the name; unique, so "DevOps" and "devops " cannot both exist. */
  slug: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
}

const categorySchema = new Schema<ICategory>(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 60 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: { type: String, trim: true, maxlength: 200, default: '' },
  },
  { timestamps: true }
);

export const Category = model<ICategory>('Category', categorySchema);
