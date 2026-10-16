import { CommentService } from '../services/comment.service.js';
import { auditContext } from '../services/audit.service.js';
import { sendResponse } from '../utils/apiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const CommentController = {
  list: asyncHandler(async (req, res) => {
    const { comments, meta } = await CommentService.listForPost(req.params.postId, req.query as any);
    sendResponse({ res, message: 'Comments retrieved', data: comments, meta });
  }),

  create: asyncHandler(async (req, res) => {
    const comment = await CommentService.create(req.params.postId, req.user!.userId, req.body.content);
    sendResponse({ res, statusCode: 201, message: 'Comment added', data: comment });
  }),

  update: asyncHandler(async (req, res) => {
    const comment = await CommentService.update(req.params.id, req.body.content, req.user!);
    sendResponse({ res, message: 'Comment updated', data: comment });
  }),

  remove: asyncHandler(async (req, res) => {
    await CommentService.remove(req.params.id, req.user!, auditContext(req), req.body?.reason);
    sendResponse({ res, message: 'Comment deleted' });
  }),

  listForModeration: asyncHandler(async (req, res) => {
    const { comments, meta } = await CommentService.listForModeration(req.query as any);
    sendResponse({ res, message: 'Comments retrieved', data: comments, meta });
  }),
};
