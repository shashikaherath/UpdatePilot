import api from '../lib/api';
import {
  UpdateCandidateItem,
  UpdatePreviewResponse,
  ExecuteUpdateResponse,
  JobDetail,
  PaginatedResponse,
} from '../types/api';

export interface ListUpdatesParams {
  deviceId?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}

export const updateService = {
  async listUpdates(params: ListUpdatesParams = {}): Promise<PaginatedResponse<UpdateCandidateItem>> {
    const response = await api.get<PaginatedResponse<UpdateCandidateItem>>('/updates', { params });
    return response.data;
  },

  async previewUpdate(candidateId: string): Promise<UpdatePreviewResponse> {
    const response = await api.post<UpdatePreviewResponse>(`/updates/${candidateId}/preview`);
    return response.data;
  },

  async executeUpdate(
    candidateId: string,
    previewToken: string,
    idempotencyKey?: string
  ): Promise<ExecuteUpdateResponse> {
    const key = idempotencyKey || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `idemp_${Date.now()}`);
    const response = await api.post<ExecuteUpdateResponse>(
      `/updates/${candidateId}/execute`,
      { previewToken },
      {
        headers: {
          'Idempotency-Key': key,
        },
      }
    );
    return response.data;
  },

  async getJob(jobId: string): Promise<JobDetail> {
    const response = await api.get<JobDetail>(`/jobs/${jobId}`);
    return response.data;
  },
};

