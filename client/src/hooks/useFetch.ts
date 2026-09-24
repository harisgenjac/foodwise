import { useState, useEffect } from 'react';
import api from '../api/axios.js';

export function useFetch<T>(
  url: string,
  dataKey: string,
  params: Record<string, string | number>
) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      const response = await api.get(url, { params });
      setData(response.data[dataKey]);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      fetchData();
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [url, JSON.stringify(params)]);

  return { data, loading, refetch: fetchData };
}