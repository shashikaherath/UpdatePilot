import axios, { AxiosError } from 'axios';
import { ApiError } from '../types/api';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001/api/v1',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
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
