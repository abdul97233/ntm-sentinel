import { useCallback, useEffect, useRef, useState } from 'react';

export interface QueryState<T> {
  status: 'idle' | 'loading' | 'ready' | 'error';
  data?: T;
  error?: string;
}

/**
 * Small async-loader hook for on-demand DevLens collections. Nothing runs until
 * `run()` is called (or `auto` is set), keeping page work user-initiated.
 */
export function useDevLensQuery<T>(fetcher: () => Promise<T>, deps: unknown[], auto = false) {
  const [state, setState] = useState<QueryState<T>>({ status: 'idle' });
  const seq = useRef(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const run = useCallback(async () => {
    const id = ++seq.current;
    setState((s) => ({ ...s, status: 'loading', error: undefined }));
    try {
      const data = await fetcherRef.current();
      if (id === seq.current) setState({ status: 'ready', data });
    } catch (err) {
      if (id === seq.current) setState({ status: 'error', error: err instanceof Error ? err.message : String(err) });
    }
  }, []);

  useEffect(() => {
    seq.current++;
    setState({ status: 'idle' });
    if (auto) void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { ...state, run, setData: (data: T) => setState({ status: 'ready', data }) };
}
