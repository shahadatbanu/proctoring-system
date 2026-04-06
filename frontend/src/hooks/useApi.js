// src/hooks/useApi.js
import { useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

const BACKEND = process.env.REACT_APP_BACKEND_URL || 'http://localhost:5000';

/**
 * Generic authenticated API hook.
 * Returns { data, loading, error, request }
 *
 * Usage:
 *   const { data, loading, request } = useApi();
 *   await request('GET', '/api/exam');
 *   await request('POST', '/api/session/start', { examId });
 */
export default function useApi() {
  const { token } = useAuth();
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  const request = useCallback(async (method, path, body = null) => {
    setLoading(true);
    setError(null);
    try {
      const opts = {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      };
      if (body) opts.body = JSON.stringify(body);

      const res  = await fetch(`${BACKEND}${path}`, opts);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setData(json);
      return json;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [token]);

  const get    = useCallback((path)        => request('GET',    path),       [request]);
  const post   = useCallback((path, body)  => request('POST',   path, body), [request]);
  const patch  = useCallback((path, body)  => request('PATCH',  path, body), [request]);
  const del    = useCallback((path)        => request('DELETE',  path),       [request]);

  return { data, loading, error, request, get, post, patch, del };
}
