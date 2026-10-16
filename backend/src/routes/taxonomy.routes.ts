import { Router } from 'express';
import { TaxonomyController } from '../controllers/taxonomy.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { requirePermission } from '../middlewares/rbac.middleware.js';
import { validateRequest } from '../middlewares/validation.middleware.js';
import {
  createCategorySchema,
  updateCategorySchema,
  categoryIdSchema,
  tagParamsSchema,
  renameTagSchema,
} from '../validations/taxonomy.validation.js';

export const categoryRoutes = Router();
categoryRoutes.get('/', TaxonomyController.listCategories);
categoryRoutes.post('/', authenticate, requirePermission('categories.manage'), validateRequest(createCategorySchema), TaxonomyController.createCategory);
categoryRoutes.patch('/:id', authenticate, requirePermission('categories.manage'), validateRequest(updateCategorySchema), TaxonomyController.updateCategory);
categoryRoutes.delete('/:id', authenticate, requirePermission('categories.manage'), validateRequest(categoryIdSchema), TaxonomyController.deleteCategory);

export const tagRoutes = Router();
tagRoutes.get('/', TaxonomyController.listTags);
tagRoutes.patch('/:tag', authenticate, requirePermission('categories.manage'), validateRequest(renameTagSchema), TaxonomyController.renameTag);
tagRoutes.delete('/:tag', authenticate, requirePermission('categories.manage'), validateRequest(tagParamsSchema), TaxonomyController.deleteTag);
