import { PostService } from '../services/post.service.js';
import { EngagementService } from '../services/engagement.service.js';
import { auditContext } from '../services/audit.service.js';
import { sendResponse } from '../utils/apiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const PostController = {
  listPublished: asyncHandler(async (req, res) => {
    const { posts, meta } = await PostService.listPublished(req.query as any);
    sendResponse({ res, message: 'Posts retrieved', data: posts, meta });
  }),

  suggest: asyncHandler(async (req, res) => {
    const data = await PostService.suggest(String(req.query.q ?? ''));
    sendResponse({ res, message: 'Suggestions retrieved', data });
  }),

  listMine: asyncHandler(async (req, res) => {
    const { posts, meta } = await PostService.listMine(req.user!.userId, req.query as any);
    sendResponse({ res, message: 'Your posts retrieved', data: posts, meta });
  }),

  /** Includes the viewer's like/bookmark state so the article page renders in one request. */
  getBySlug: asyncHandler(async (req, res) => {
    const post = await PostService.getBySlug(req.params.slug, req.user);
    const viewer = await EngagementService.viewerState(String(post._id), req.user?.userId);
    sendResponse({ res, message: 'Post retrieved', data: { ...post, viewer } });
  }),

  create: asyncHandler(async (req, res) => {
    const post = await PostService.createPost(req.body, req.user!.userId);
    sendResponse({ res, statusCode: 201, message: 'Draft created', data: post });
  }),

  update: asyncHandler(async (req, res) => {
    const post = await PostService.updatePost(req.params.id, req.body, req.user!);
    sendResponse({ res, message: 'Post saved', data: post });
  }),

  submit: asyncHandler(async (req, res) => {
    const post = await PostService.submitForReview(req.params.id, req.user!, auditContext(req));
    sendResponse({ res, message: 'Submitted for review', data: post });
  }),

  archive: asyncHandler(async (req, res) => {
    const post = await PostService.archive(req.params.id, req.user!, auditContext(req));
    sendResponse({ res, message: 'Post archived', data: post });
  }),

  unarchive: asyncHandler(async (req, res) => {
    const post = await PostService.unarchive(req.params.id, req.user!, auditContext(req));
    sendResponse({ res, message: 'Post moved back to drafts', data: post });
  }),

  discardRevision: asyncHandler(async (req, res) => {
    const post = await PostService.discardRevision(req.params.id, req.user!);
    sendResponse({ res, message: 'Changes discarded', data: post });
  }),

  remove: asyncHandler(async (req, res) => {
    await PostService.softDeletePost(req.params.id, req.user!, auditContext(req));
    sendResponse({ res, message: 'Post deleted' });
  }),

  setCover: asyncHandler(async (req, res) => {
    const alt = typeof req.body?.alt === 'string' ? req.body.alt.trim().slice(0, 200) : undefined;
    const post = await PostService.setCoverImage(req.params.id, req.files?.image, alt, req.user!);
    sendResponse({ res, message: 'Cover image updated', data: post });
  }),

  removeCover: asyncHandler(async (req, res) => {
    const post = await PostService.removeCoverImage(req.params.id, req.user!);
    sendResponse({ res, message: 'Cover image removed', data: post });
  }),

  like: asyncHandler(async (req, res) => {
    const data = await EngagementService.like(req.params.id, req.user!.userId);
    sendResponse({ res, message: 'Liked', data });
  }),

  unlike: asyncHandler(async (req, res) => {
    const data = await EngagementService.unlike(req.params.id, req.user!.userId);
    sendResponse({ res, message: 'Like removed', data });
  }),

  bookmark: asyncHandler(async (req, res) => {
    const data = await EngagementService.bookmark(req.params.id, req.user!.userId);
    sendResponse({ res, message: 'Saved', data });
  }),

  unbookmark: asyncHandler(async (req, res) => {
    const data = await EngagementService.unbookmark(req.params.id, req.user!.userId);
    sendResponse({ res, message: 'Removed from saved', data });
  }),

  bookmarks: asyncHandler(async (req, res) => {
    const { posts, meta } = await EngagementService.listBookmarks(req.user!.userId, req.query as any);
    sendResponse({ res, message: 'Saved posts retrieved', data: posts, meta });
  }),
};
