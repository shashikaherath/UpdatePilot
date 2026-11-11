import api from '../lib/api';
import { AuditEventItem, JobKind, JobStatus, PaginatedResponse } from '../types/api';

export interface ListHistoryParams {
  type?: JobKind;
  deviceId?: string;
  outcome?: JobStatus;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}

export const historyService = {
  async getHistory(params: ListHistoryParams = {}): Promise<PaginatedResponse<AuditEventItem>> {
    const response = await api.get<PaginatedResponse<AuditEventItem>>('/history', { params });
    return response.data;
  },

  async exportCsv(params: ListHistoryParams = {}): Promise<Blob> {
    const response = await api.get('/history/export', {
      params,
      responseType: 'blob',
    });
    return response.data as Blob;
  },
};

