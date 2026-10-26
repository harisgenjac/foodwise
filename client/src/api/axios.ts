import axios from 'axios';
import { translateServerData } from '../i18n/serverMessages.js';

// Backend origin, e.g. http://localhost:3000 locally; set VITE_API_URL for other environments.
export const API_ORIGIN: string = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const api = axios.create({
  baseURL: `${API_ORIGIN}/api`,
  withCredentials: true,
});

// Server texts (`error`, `message`, CSV `rowErrors`) arrive in English; show them in the interface language.
api.interceptors.response.use(
  (response) => {
    response.data = translateServerData(response.data);
    return response;
  },
  (error) => {
    if (axios.isAxiosError(error) && error.response) {
      error.response.data = translateServerData(error.response.data);
    }
    return Promise.reject(error);
  },
);

// Server-relative paths such as /uploads/logos/... become absolute URLs on the backend.
export const assetUrl = (path: string) => `${API_ORIGIN}${path}`;

export default api;
