import axios from 'axios';
import api from '../lib/api';
import { DashboardData, HealthResponse } from '../types/api';

export const dashboardService = {
  async getDashboard(): Promise<DashboardData> {
    const response = await api.get<{ data: DashboardData }>('/dashboard');
    return response.data.data;
  },

  async getHealth(): Promise<HealthResponse> {
    // If baseURL is http://localhost:3001/api/v1, /health is at http://localhost:3001/health
    const apiBase = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001/api/v1';
    let healthUrl = '/health';
    try {
      const parsed = new URL(apiBase);
      healthUrl = `${parsed.origin}/health`;
    } catch {
      // Fallback relative url for proxy
      healthUrl = '/health';
    }

    const response = await axios.get<HealthResponse>(healthUrl, {
      withCredentials: true,
      timeout: 5000,
    });
    return response.data;
  },
};
