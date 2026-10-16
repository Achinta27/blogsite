import { Category, ICategory } from '../models/category.model.js';
import { Post } from '../models/post.model.js';
import { AppError } from '../utils/apiError.js';
import { toSlugBase } from '../utils/slug.js';
import { AuditService, AuditContext } from './audit.service.js';

const PUBLIC_FILTER = { status: 'published', isDeleted: false };

/** Lower-case, trimmed, single-spaced: "  Node.JS " and "node.js" are the same tag. */
const normalizeTag = (tag: string) => tag.trim().toLowerCase().replace(/\s+/g, ' ');

const categorySlug = (name: string) => {
  const slug = toSlugBase(name);
  if (slug === 'post') throw new AppError('Category name must contain letters or numbers', 400, 'VALIDATION_ERROR');
  return slug;
};

export class TaxonomyService {
  /** Every category with its number of published posts (for navigation and admin). */
  static async listCategories() {
    const [categories, counts] = await Promise.all([
      Category.find().sort({ name: 1 }).lean(),
      Post.aggregate<{ _id: unknown; count: number }>([
        { $match: PUBLIC_FILTER },
        { $group: { _id: '$category', count: { $sum: 1 } } },
      ]),
    ]);
    const byId = new Map(counts.map((c) => [String(c._id), c.count]));
    return categories.map((c) => ({ ...c, publishedCount: byId.get(String(c._id)) ?? 0 }));
  }

  static async findCategoryBySlug(slug: string): Promise<ICategory> {
    const category = await Category.findOne({ slug });
    if (!category) throw new AppError('Category not found', 404);
    return category;
  }

  static async assertCategoryExists(id: string) {
    if (!(await Category.exists({ _id: id }))) {
      throw new AppError('Choose an existing category', 400, 'VALIDATION_ERROR', [{ field: 'category', message: 'Unknown category' }]);
    }
  }

  static async createCategory(input: { name: string; description?: string }, ctx: AuditContext) {
    const category = await Category.create({ name: input.name, slug: categorySlug(input.name), description: input.description ?? '' });
    await AuditService.log(ctx, {
      action: 'category.created',
      resourceType: 'category',
      resourceId: category.id,
      newState: { name: category.name, slug: category.slug },
    });
    return category;
  }

  static async updateCategory(id: string, input: { name?: string; description?: string }, ctx: AuditContext) {
    const category = await Category.findById(id);
    if (!category) throw new AppError('Category not found', 404);
    const previousState = { name: category.name, slug: category.slug, description: category.description };
    if (input.name !== undefined) {
      category.name = input.name;
      category.slug = categorySlug(input.name);
    }
    if (input.description !== undefined) category.description = input.description;
    await category.save();
    await AuditService.log(ctx, {
      action: 'category.updated',
      resourceType: 'category',
      resourceId: category.id,
      previousState,
      newState: { name: category.name, slug: category.slug, description: category.description },
    });
    return category;
  }

  /** Refuses to delete a category that any post (including deleted or draft posts) still uses. */
  static async deleteCategory(id: string, ctx: AuditContext) {
    const category = await Category.findById(id);
    if (!category) throw new AppError('Category not found', 404);
    const inUse = await Post.exists({ $or: [{ category: id }, { 'revision.category': id }] });
    if (inUse) throw new AppError('This category is still used by posts. Move them to another category first.', 409);
    await category.deleteOne();
    await AuditService.log(ctx, {
      action: 'category.deleted',
      resourceType: 'category',
      resourceId: id,
      previousState: { name: category.name, slug: category.slug },
    });
  }

  /** Most used tags on published posts. */
  static async listTags(limit = 50) {
    return Post.aggregate<{ tag: string; count: number }>([
      { $match: PUBLIC_FILTER },
      { $unwind: '$tags' },
      { $group: { _id: '$tags', count: { $sum: 1 } } },
      { $sort: { count: -1, _id: 1 } },
      { $limit: limit },
      { $project: { _id: 0, tag: '$_id', count: 1 } },
    ]);
  }

  /** Renames (or merges into an existing) tag across live posts and pending revisions. */
  static async renameTag(from: string, to: string, ctx: AuditContext) {
    const oldTag = normalizeTag(from);
    const newTag = normalizeTag(to);
    if (oldTag === newTag) return { modified: 0 };
    const replace = (field: string) => [
      {
        $set: {
          [field]: {
            $setUnion: [{ $filter: { input: `$${field}`, cond: { $ne: ['$$this', oldTag] } } }, [newTag]],
          },
        },
      },
    ];
    const [live, revisions] = await Promise.all([
      Post.updateMany({ tags: oldTag }, replace('tags')),
      Post.updateMany({ 'revision.tags': oldTag }, replace('revision.tags')),
    ]);
    if (live.matchedCount + revisions.matchedCount === 0) throw new AppError('Tag not found', 404);
    await AuditService.log(ctx, {
      action: 'tag.renamed',
      resourceType: 'tag',
      resourceId: oldTag,
      previousState: { tag: oldTag },
      newState: { tag: newTag },
    });
    return { modified: live.modifiedCount + revisions.modifiedCount };
  }

  static async deleteTag(tag: string, ctx: AuditContext) {
    const name = normalizeTag(tag);
    const [live, revisions] = await Promise.all([
      Post.updateMany({ tags: name }, { $pull: { tags: name } }),
      Post.updateMany({ 'revision.tags': name }, { $pull: { 'revision.tags': name } }),
    ]);
    if (live.matchedCount + revisions.matchedCount === 0) throw new AppError('Tag not found', 404);
    await AuditService.log(ctx, { action: 'tag.deleted', resourceType: 'tag', resourceId: name, previousState: { tag: name } });
    return { modified: live.modifiedCount + revisions.modifiedCount };
  }
}
