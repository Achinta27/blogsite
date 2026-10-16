import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import type { ApiResponse, User } from '../types';

export const API_BASE_URL = import.meta.env.VITE_API_URL || '/api/v1';

/**
 * The access token lives in memory only. The refresh token is an HttpOnly cookie that
 * JavaScript never sees; a page reload restores the session through /auth/refresh.
 */
let accessToken: string | null = null;
export const setAccessToken = (token: string | null) => {
  accessToken = token;
};
/** Read by the Socket.IO client on every (re)connect handshake. */
export const getAccessToken = () => accessToken;

export const api = axios.create({ baseURL: API_BASE_URL, withCredentials: true });

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

export interface SessionPayload {
  user: User;
  accessToken: string;
}

/**
 * Single-flight refresh: concurrent callers (parallel 401s, React StrictMode's double
 * effect) share one request. Rotation makes each refresh token single-use, so two
 * parallel refreshes would otherwise trip the server's reuse detection.
 */
let refreshInFlight: Promise<SessionPayload> | null = null;
export const refreshSession = (): Promise<SessionPayload> => {
  if (!refreshInFlight) {
    refreshInFlight = axios
      .post<ApiResponse<SessionPayload>>(`${API_BASE_URL}/auth/refresh`, null, { withCredentials: true })
      .then((res) => {
        setAccessToken(res.data.data.accessToken);
        return res.data.data;
      })
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
};

export const SESSION_EXPIRED_EVENT = 'margin:session-expired';

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;
    const isAuthEndpoint = original?.url?.startsWith('/auth/login') || original?.url?.startsWith('/auth/register');

    if (error.response?.status !== 401 || !original || original._retried || isAuthEndpoint || !accessToken) {
      return Promise.reject(error);
    }

    original._retried = true;
    try {
      await refreshSession();
      return api(original);
    } catch (refreshError) {
      setAccessToken(null);
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
      return Promise.reject(refreshError);
    }
  }
);

/** Extracts a readable message from an API error. */
export const errorMessage = (error: unknown, fallback = 'Something went wrong. Please try again.'): string => {
  if (axios.isAxiosError(error)) {
    const body = error.response?.data as { message?: string; error?: { details?: { message: string }[] } } | undefined;
    const detail = body?.error?.details?.[0]?.message;
    if (body?.message === 'Validation error' && detail) return detail;
    if (body?.message) return body.message;
    if (!error.response) return 'Cannot reach the server. Check your connection and try again.';
  }
  return fallback;
};

/** Field-level validation messages keyed by field name. */
export const fieldErrors = (error: unknown): Record<string, string> => {
  if (!axios.isAxiosError(error)) return {};
  const details = (error.response?.data as { error?: { details?: { field: string; message: string }[] } })?.error?.details;
  return Object.fromEntries((details || []).map((d) => [d.field, d.message]));
};
