import axios, { AxiosError } from 'axios';
import { ApiError } from '../types/api';

const rawBaseUrl = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api/v1').replace(/\/+$/, '');
const baseURL = rawBaseUrl.endsWith('/api/v1') ? rawBaseUrl : `${rawBaseUrl}/api/v1`;

const api = axios.create({
  baseURL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Attach Authorization Bearer token if available (supports cross-site cookie restrictions)
api.interceptors.request.use((reqConfig) => {
  const token = localStorage.getItem('updatepilot_session_token');
  if (token && reqConfig.headers && !reqConfig.headers.Authorization) {
    reqConfig.headers.Authorization = `Bearer ${token}`;
  }
  return reqConfig;
});

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      // Dispatch custom event for 401 Unauthorized so AuthContext can react
      window.dispatchEvent(new CustomEvent('auth:unauthorized'));
    }
    return Promise.reject(error);
  }
);

export function getApiErrorMessage(error: unknown, fallback = 'An unexpected error occurred'): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as ApiError | undefined;
    if (data?.error?.message) {
      if (data.error.details?.issues && data.error.details.issues.length > 0) {
        return `${data.error.message}: ${data.error.details.issues.map((i) => i.message).join(', ')}`;
      }
      return data.error.message;
    }
    if (typeof (error.response?.data as { message?: string })?.message === 'string') {
      return (error.response?.data as { message: string }).message;
    }
    if (error.response?.status === 404) {
      return `Endpoint not found (404): ${error.config?.url || 'requested resource'}. Please verify backend route configuration.`;
    }
    if (error.response?.status === 401) {
      return 'Session expired or invalid credentials. Please sign in again.';
    }
    if (error.response?.status === 403) {
      return 'Access denied (403). You do not have permission to perform this action.';
    }
    if (error.response?.status === 500) {
      return 'Internal server error (500). Please check backend logs and database connectivity.';
    }
    if (error.response?.status === 503) {
      return 'Service temporarily unavailable (503). The database or backend may be starting up.';
    }
    if (error.code === 'ERR_NETWORK' || error.message === 'Network Error') {
      return 'Network Error: Unable to communicate with the backend. Please ensure the backend on Render is awake and CORS allows this origin.';
    }
    if (error.message) {
      return error.message;
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return fallback;
}

export default api;
