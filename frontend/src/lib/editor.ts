const MAX_COVER_BYTES = 5 * 1024 * 1024;
export const ACCEPTED_COVER_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** Client-side checks for fast feedback. The API re-validates size and real file content. */
export const validateCoverFile = (file: File): string | null => {
  if (!ACCEPTED_COVER_TYPES.includes(file.type)) return 'Choose a JPEG, PNG or WebP image.';
  if (file.size > MAX_COVER_BYTES) return 'Images must be 5 MB or smaller.';
  return null;
};

/** Returns true when editor HTML has no visible text. */
export const isEditorEmpty = (html: string) => !html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
