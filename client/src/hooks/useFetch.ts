import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import api from '../api/axios.js';

const DEBOUNCE_MS = 500;

// The params without paging, so a page change (Load more, a page number) is not debounced.
const filterKeyOf = (params: Record<string, string | number>) => {
  const { limit: _limit, offset: _offset, ...filters } = params;
  return JSON.stringify(filters);
};

interface UseFetchOptions {
  // A new value (e.g. the selected tab) starts a different list: the old data is dropped right away,
  // `loading` is set again, and the request goes out without the debounce.
  resetKey?: string;
}

export function useFetch<T>(
  url: string,
  dataKey: string,
  params: Record<string, string | number>,
  { resetKey = '' }: UseFetchOptions = {}
) {
  const [data, setData] = useState<T[]>([]);
  // Set by paginated endpoints that return { total }; null otherwise.
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState(false);
  // Only the latest request may update the state; anything else is an outdated response.
  const controllerRef = useRef<AbortController | null>(null);
  const hasLoadedRef = useRef(false);
  const paramsKey = JSON.stringify(params);
  const filterKey = filterKeyOf(params);
  const lastFilterKeyRef = useRef(filterKey);
  const lastResetKeyRef = useRef(resetKey);

  // Reset during render, so the previous list is never shown, not even for one frame, under a new key.
  const [shownResetKey, setShownResetKey] = useState(resetKey);
  if (shownResetKey !== resetKey) {
    setShownResetKey(resetKey);
    setData([]);
    setTotal(null);
    setError(false);
    setLoading(true);
  }

  const fetchData = useCallback(async () => {
    // Abort the previous request so a slow, outdated response cannot overwrite a newer one.
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const isCurrent = () => controllerRef.current === controller;
    setFetching(true);
    try {
      const response = await api.get(url, { params: JSON.parse(paramsKey), signal: controller.signal });
      // A response that arrives anyway after a newer request started (or the params changed) is dropped.
      if (!isCurrent()) return;
      setData(response.data[dataKey]);
      setTotal(typeof response.data.total === 'number' ? response.data.total : null);
      setError(false);
      hasLoadedRef.current = true;
    } catch (err) {
      if (axios.isCancel(err) || !isCurrent()) return;
      console.error(err);
      setError(true);
    } finally {
      if (isCurrent()) {
        setLoading(false);
        setFetching(false);
      }
    }
  }, [url, dataKey, paramsKey]);

  useEffect(() => {
    // The first load, page changes and a new resetKey start right away; filter changes (typing) are debounced.
    const filtersChanged = lastFilterKeyRef.current !== filterKey;
    const resetChanged = lastResetKeyRef.current !== resetKey;
    lastFilterKeyRef.current = filterKey;
    lastResetKeyRef.current = resetKey;
    if (filtersChanged || resetChanged) {
      // The request in flight is for the old filters: drop it now, not only when the debounced one starts.
      controllerRef.current?.abort();
      controllerRef.current = null;
    }
    const debounce = hasLoadedRef.current && filtersChanged && !resetChanged;
    const timeoutId = setTimeout(fetchData, debounce ? DEBOUNCE_MS : 0);
    return () => clearTimeout(timeoutId);
  }, [fetchData, filterKey, resetKey]);

  useEffect(() => () => controllerRef.current?.abort(), []);

  return { data, total, loading, fetching, error, refetch: fetchData };
}
