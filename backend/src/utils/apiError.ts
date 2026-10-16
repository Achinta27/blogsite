const DEFAULT_CODES: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  422: 'UNPROCESSABLE_ENTITY',
  429: 'TOO_MANY_REQUESTS',
  500: 'INTERNAL_ERROR',
  502: 'BAD_GATEWAY',
  503: 'SERVICE_UNAVAILABLE',
};

export const codeForStatus = (status: number): string => DEFAULT_CODES[status] || 'ERROR';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown[];

  constructor(message: string, statusCode = 500, code?: string, details?: unknown[]) {
    super(message);
    this.statusCode = statusCode;
    this.code = code || codeForStatus(statusCode);
    this.details = details;

    Error.captureStackTrace(this, this.constructor);
  }
}
