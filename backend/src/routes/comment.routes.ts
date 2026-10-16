import { Router } from 'express';
import { CommentController } from '../controllers/comment.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { validateRequest } from '../middlewares/validation.middleware.js';
import { updateCommentSchema, deleteCommentSchema } from '../validations/comment.validation.js';

// Listing and creation live under /posts/:postId/comments (see post.routes.ts)
const router = Router();

// Author only
router.patch('/:id', authenticate, validateRequest(updateCommentSchema), CommentController.update);
// Author, admin, or staff with comments.moderate (checked in the service)
router.delete('/:id', authenticate, validateRequest(deleteCommentSchema), CommentController.remove);

export default router;
