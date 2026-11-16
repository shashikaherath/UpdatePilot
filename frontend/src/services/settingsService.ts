import api from '../lib/api';
import { UserSettings, NotificationPreferences } from '../types/api';

export interface UpdateSettingsInput {
  theme?: 'light' | 'dark' | 'system';
  scanPreferences?: {
    scanMode: 'full' | 'quick';
    scheduleIntervalDays: number;
  };
  requireUpdateConfirmation?: boolean;
  notificationPreferences?: NotificationPreferences;
  dataRetentionDays?: number;
}

export const settingsService = {
  async getSettings(): Promise<UserSettings> {
    const response = await api.get<UserSettings>('/settings');
    return response.data;
  },

  async updateSettings(data: UpdateSettingsInput): Promise<UserSettings> {
    const response = await api.patch<UserSettings>('/settings', data);
    return response.data;
  },
};

