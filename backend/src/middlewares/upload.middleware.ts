import fileUpload from 'express-fileupload';

const MAX_COVER_BYTES = 5 * 1024 * 1024;

/**
 * Multipart parsing for the cover-image endpoint only. Files are kept in memory
 * (bounded by the size limit) and never written to local disk. Oversized files are
 * truncated rather than aborting the connection, so the service can answer with a 413.
 */
export const coverUpload = fileUpload({
  limits: { fileSize: MAX_COVER_BYTES, files: 1, fields: 5 },
  abortOnLimit: false,
  useTempFiles: false,
  safeFileNames: true,
  parseNested: false,
});
