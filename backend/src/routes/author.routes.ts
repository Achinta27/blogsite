import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AuthorService } from '../services/author.service.js';
import { sendResponse } from '../utils/apiResponse.js';
import { validateRequest } from '../middlewares/validation.middleware.js';
import { idParams } from '../validations/common.validation.js';

const router = Router();

// The author's published posts come from GET /posts?author=:id (published-only by design)
router.get(
  '/:id',
  validateRequest(z.object({ params: idParams })),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const author = await AuthorService.getPublicProfile(req.params.id);
      sendResponse({ res, message: 'Author retrieved', data: author });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
