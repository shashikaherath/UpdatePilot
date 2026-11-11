import api from '../lib/api';
import { Device, PairingCodeResponse, ScanJobResponse } from '../types/api';

export const deviceService = {
  async listDevices(): Promise<Device[]> {
    const response = await api.get<{ data: Device[] }>('/devices');
    return response.data.data;
  },

  async createPairingCode(deviceName: string): Promise<PairingCodeResponse> {
    const response = await api.post<PairingCodeResponse>('/devices/pairing-codes', { deviceName });
    return response.data;
  },

  async autoEnrollDevice(payload: {
    deviceName: string;
    machineId?: string;
    osInfo?: string;
    agentVersion?: string;
  }): Promise<{ deviceId: string; deviceName: string; deviceToken: string; isNew: boolean }> {
    const response = await api.post<{ deviceId: string; deviceName: string; deviceToken: string; isNew: boolean }>(
      '/devices/auto-enroll',
      payload
    );
    return response.data;
  },

  async revokeDevice(id: string): Promise<{ success: boolean; message: string }> {
    const response = await api.delete<{ success: boolean; message: string }>(`/devices/${id}`);
    return response.data;
  },

  async startScan(deviceId: string, scanMode: 'full' | 'quick' = 'full'): Promise<ScanJobResponse> {
    const response = await api.post<ScanJobResponse>(`/devices/${deviceId}/scans`, { scanMode });
    return response.data;
  },

  async getScanStatus(scanOrJobId: string): Promise<{
    scanId: string;
    jobId: string;
    state: string;
    scannedCount: number;
    foundCount: number;
    errorSummary: string | null;
  }> {
    const response = await api.get(`/scans/${scanOrJobId}`);
    return response.data;
  },
};

