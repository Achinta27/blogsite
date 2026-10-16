import { z } from 'zod';
import { idParams, pagination } from './common.validation.js';

export const listNotificationsSchema = z.object({
  query: z.object({
    ...pagination,
    limit: pagination.limit.default(20),
    unread: z.enum(['true', 'false']).optional().transform((v) => v === 'true'),
  }),
});

export const notificationIdSchema = z.object({ params: idParams });
