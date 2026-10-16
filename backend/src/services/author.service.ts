import { User } from '../models/user.model.js';
import { AppError } from '../utils/apiError.js';
import { PUBLIC_AUTHOR_FIELDS } from './post.service.js';

export class AuthorService {
  /** Public profile fields only: never email, role or account details. */
  static async getPublicProfile(authorId: string) {
    const author = await User.findOne({ _id: authorId, isActive: true })
      .select(`${PUBLIC_AUTHOR_FIELDS} createdAt`)
      .lean();
    if (!author) throw new AppError('Author not found', 404);
    return author;
  }
}
