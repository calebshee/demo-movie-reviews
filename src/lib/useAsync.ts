import { useCallback, useEffect, useState, type DependencyList } from 'react';

export type AsyncState<T> =
  /** `data` holds the previous result while a reload is in flight (stale-while-revalidate). */
  | { status: 'loading'; data?: T; error?: undefined }
  | { status: 'success'; data: T; error?: undefined }
  | { status: 'error'; data?: undefined; error: Error };

/**
 * Runs `load` whenever deps change; ignores results from superseded runs so a slow
 * earlier request can never overwrite a newer one. `reload` re-runs it on demand.
 * Callers list in `deps` everything `load` reads.
 */
export function useAsync<T>(load: () => Promise<T>, deps: DependencyList): AsyncState<T> & { reload: () => void } {
  const [state, setState] = useState<AsyncState<T>>({ status: 'loading' });
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    let current = true;
    setState((prev) => ({ status: 'loading', data: prev.data }));
    load().then(
      (data) => current && setState({ status: 'success', data }),
      (error: unknown) =>
        current && setState({ status: 'error', error: error instanceof Error ? error : new Error(String(error)) }),
    );
    return () => {
      current = false;
    };
  }, [...deps, reloadCount]);

  const reload = useCallback(() => setReloadCount((n) => n + 1), []);
  return { ...state, reload };
}
