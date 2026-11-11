import api from '../lib/api';
import { Application, ApplicationDetail, MatchStatus, PaginatedResponse } from '../types/api';

export interface ListApplicationsParams {
  q?: string;
  deviceId?: string;
  status?: MatchStatus;
  source?: string;
  sort?: 'displayName' | 'installedVersion' | 'matchStatus' | 'updatedAt' | 'createdAt';
  order?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

export const applicationService = {
  async listApplications(params: ListApplicationsParams = {}): Promise<PaginatedResponse<Application>> {
    const response = await api.get<PaginatedResponse<Application>>('/applications', { params });
    return response.data;
  },

  async getApplicationById(id: string): Promise<ApplicationDetail> {
    const response = await api.get<ApplicationDetail>(`/applications/${id}`);
    return response.data;
  },
};

