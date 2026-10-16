import { TaxonomyService } from '../services/taxonomy.service.js';
import { auditContext } from '../services/audit.service.js';
import { sendResponse } from '../utils/apiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const TaxonomyController = {
  listCategories: asyncHandler(async (_req, res) => {
    sendResponse({ res, message: 'Categories retrieved', data: await TaxonomyService.listCategories() });
  }),

  createCategory: asyncHandler(async (req, res) => {
    const category = await TaxonomyService.createCategory(req.body, auditContext(req));
    sendResponse({ res, statusCode: 201, message: 'Category created', data: category });
  }),

  updateCategory: asyncHandler(async (req, res) => {
    const category = await TaxonomyService.updateCategory(req.params.id, req.body, auditContext(req));
    sendResponse({ res, message: 'Category updated', data: category });
  }),

  deleteCategory: asyncHandler(async (req, res) => {
    await TaxonomyService.deleteCategory(req.params.id, auditContext(req));
    sendResponse({ res, message: 'Category deleted' });
  }),

  listTags: asyncHandler(async (_req, res) => {
    sendResponse({ res, message: 'Tags retrieved', data: await TaxonomyService.listTags() });
  }),

  renameTag: asyncHandler(async (req, res) => {
    const data = await TaxonomyService.renameTag(req.params.tag, req.body.name, auditContext(req));
    sendResponse({ res, message: 'Tag renamed', data });
  }),

  deleteTag: asyncHandler(async (req, res) => {
    const data = await TaxonomyService.deleteTag(req.params.tag, auditContext(req));
    sendResponse({ res, message: 'Tag removed', data });
  }),
};
