import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import api from '../api/axios.js';

const DEBOUNCE_MS = 500;

export function useFetch<T>(
  url: string,
  dataKey: string,
  params: Record<string, string | number>
) {
  const [data, setData] = useState<T[]>([]);
  // Set by paginated endpoints that return { total }; null otherwise.
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const hasLoadedRef = useRef(false);
  const paramsKey = JSON.stringify(params);

  const fetchData = useCallback(async () => {
    // Abort the previous request so a slow, outdated response cannot overwrite a newer one.
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setFetching(true);
    try {
      const response = await api.get(url, { params: JSON.parse(paramsKey), signal: controller.signal });
      setData(response.data[dataKey]);
      setTotal(typeof response.data.total === 'number' ? response.data.total : null);
      setError(false);
      hasLoadedRef.current = true;
    } catch (err) {
      if (axios.isCancel(err)) return;
      console.error(err);
      setError(true);
    } finally {
      if (controllerRef.current === controller) {
        setLoading(false);
        setFetching(false);
      }
    }
  }, [url, dataKey, paramsKey]);

  useEffect(() => {
    // The first load starts right away; later changes (typing in a filter) are debounced.
    const timeoutId = setTimeout(fetchData, hasLoadedRef.current ? DEBOUNCE_MS : 0);
    return () => clearTimeout(timeoutId);
  }, [fetchData]);

  useEffect(() => () => controllerRef.current?.abort(), []);

  return { data, total, loading, fetching, error, refetch: fetchData };
}
