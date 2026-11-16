import api from '../lib/api';
import { DashboardData, HealthResponse } from '../types/api';

export const dashboardService = {
  async getDashboard(): Promise<DashboardData> {
    const response = await api.get<{ data: DashboardData }>('/dashboard');
    return response.data.data;
  },

  async getHealth(): Promise<HealthResponse> {
    const response = await api.get<HealthResponse>('/health', {
      timeout: 8000,
    });
    return response.data;
  },
};
