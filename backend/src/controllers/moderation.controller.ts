import { ModerationService } from '../services/moderation.service.js';
import { auditContext } from '../services/audit.service.js';
import { sendResponse } from '../utils/apiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const ModerationController = {
  queue: asyncHandler(async (req, res) => {
    const { posts, meta } = await ModerationService.queue(req.query as any);
    sendResponse({ res, message: 'Moderation queue retrieved', data: posts, meta });
  }),

  review: asyncHandler(async (req, res) => {
    const data = await ModerationService.getForReview(req.params.id);
    sendResponse({ res, message: 'Submission retrieved', data });
  }),

  approve: asyncHandler(async (req, res) => {
    const post = await ModerationService.approve(req.params.id, req.user!, auditContext(req));
    sendResponse({ res, message: 'Approved and published', data: post });
  }),

  reject: asyncHandler(async (req, res) => {
    const post = await ModerationService.reject(req.params.id, req.body.reason, req.user!, auditContext(req));
    sendResponse({ res, message: 'Submission rejected', data: post });
  }),
};
