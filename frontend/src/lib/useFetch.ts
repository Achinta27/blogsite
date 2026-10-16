import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from '../api/client';

interface FetchState<T> {
  data: T | undefined;
  error: string | null;
  /** HTTP status of the last failure, if any (e.g. 404). */
  status: number | null;
  loading: boolean;
  reload: () => void;
  setData: (updater: (current: T | undefined) => T | undefined) => void;
}

/**
 * Runs `load` whenever `deps` change and tracks loading/error state. Responses from
 * superseded requests are ignored, so fast filter changes never show stale results.
 */
export function useFetch<T>(load: () => Promise<T>, deps: unknown[]): FetchState<T> {
  const [data, setDataState] = useState<T>();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  const latest = useRef(0);

  useEffect(() => {
    const id = ++latest.current;
    setLoading(true);
    setError(null);
    setStatus(null);
    load()
      .then((result) => id === latest.current && setDataState(result))
      .catch((err) => {
        if (id !== latest.current) return;
        setError(errorMessage(err));
        setStatus(err?.response?.status ?? null);
      })
      .finally(() => id === latest.current && setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const setData = useCallback((updater: (current: T | undefined) => T | undefined) => setDataState(updater), []);

  return { data, error, status, loading, reload, setData };
}
