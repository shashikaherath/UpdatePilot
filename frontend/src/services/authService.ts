import api from '../lib/api';
import { AuthResponse } from '../types/api';

export const authService = {
  async register(credentials: { email: string; password: string }): Promise<AuthResponse> {
    const response = await api.post<AuthResponse>('/auth/register', credentials);
    return response.data;
  },

  async login(credentials: { email: string; password: string }): Promise<AuthResponse> {
    const response = await api.post<AuthResponse>('/auth/login', credentials);
    return response.data;
  },

  async logout(): Promise<void> {
    await api.post('/auth/logout');
  },
};
