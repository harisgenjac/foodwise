import axios from 'axios';

// Backend origin, e.g. http://localhost:3000 locally; set VITE_API_URL for other environments.
export const API_ORIGIN: string = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const api = axios.create({
  baseURL: `${API_ORIGIN}/api`,
  withCredentials: true,
});

// Server-relative paths such as /uploads/logos/... become absolute URLs on the backend.
export const assetUrl = (path: string) => `${API_ORIGIN}${path}`;

export default api;
