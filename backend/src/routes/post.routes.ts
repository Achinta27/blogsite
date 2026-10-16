import { Router } from 'express';
import { PostController } from '../controllers/post.controller.js';
import { CommentController } from '../controllers/comment.controller.js';
import { authenticate, optionalAuth } from '../middlewares/auth.middleware.js';
import { validateRequest } from '../middlewares/validation.middleware.js';
import { coverUpload } from '../middlewares/upload.middleware.js';
import { logActivity } from '../middlewares/activityLogger.js';
import {
  createPostSchema,
  updatePostSchema,
  listPostsSchema,
  myPostsSchema,
  slugParamsSchema,
  postIdSchema,
  coverAltSchema,
  bookmarksSchema,
  suggestSchema,
} from '../validations/post.validation.js';
import { createCommentSchema, listCommentsSchema } from '../validations/comment.validation.js';

const router = Router();
const byId = validateRequest(postIdSchema);

// Public listing (published posts only)
router.get('/', validateRequest(listPostsSchema), PostController.listPublished);
router.get('/suggest', validateRequest(suggestSchema), PostController.suggest);

// The signed-in user's workspace (declared before /:slug)
router.get('/mine', authenticate, validateRequest(myPostsSchema), PostController.listMine);
router.get('/saved', authenticate, validateRequest(bookmarksSchema), PostController.bookmarks);

// Published posts are public; drafts and submissions only for their author or an admin
router.get('/:slug', optionalAuth, validateRequest(slugParamsSchema), PostController.getBySlug);

// Authoring (owner or admin; status changes only through the workflow endpoints)
router.post('/', authenticate, validateRequest(createPostSchema), PostController.create);
router.patch('/:id', authenticate, validateRequest(updatePostSchema), PostController.update);
router.delete('/:id', authenticate, byId, PostController.remove);
router.post('/:id/submit', authenticate, byId, PostController.submit);
router.post('/:id/archive', authenticate, byId, PostController.archive);
router.post('/:id/unarchive', authenticate, byId, PostController.unarchive);
router.delete('/:id/revision', authenticate, byId, PostController.discardRevision);

// Cover image (multipart/form-data, field "image", optional "alt")
router.put('/:id/cover', authenticate, coverUpload, validateRequest(coverAltSchema), PostController.setCover);
router.delete('/:id/cover', authenticate, byId, PostController.removeCover);

// Engagement (published posts only)
router.put('/:id/like', authenticate, byId, PostController.like);
router.delete('/:id/like', authenticate, byId, PostController.unlike);
router.put('/:id/bookmark', authenticate, byId, PostController.bookmark);
router.delete('/:id/bookmark', authenticate, byId, PostController.unbookmark);

// Comments belonging to a post
router.get('/:postId/comments', validateRequest(listCommentsSchema), CommentController.list);
router.post(
  '/:postId/comments',
  authenticate,
  validateRequest(createCommentSchema),
  logActivity('comment.created', 'post', 'postId'),
  CommentController.create
);

export default router;
