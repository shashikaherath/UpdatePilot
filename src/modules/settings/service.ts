import { prisma } from '../../config/prisma.js';
import { UpdateSettingsInput } from './schemas.js';

export class SettingsService {
  async getSettings(userId: string) {
    let settings = await prisma.userSettings.findUnique({
      where: { userId },
    });

    if (!settings) {
      settings = await prisma.userSettings.create({
        data: {
          userId,
          theme: 'system',
          scanPreferences: { scanMode: 'full', scheduleIntervalDays: 7 },
          requireUpdateConfirmation: true,
          notificationPreferences: { notifyOnUpdates: true, notifyOnFailures: true },
          dataRetentionDays: 90,
        },
      });
    }

    return {
      theme: settings.theme,
      scanPreferences: settings.scanPreferences,
      requireUpdateConfirmation: settings.requireUpdateConfirmation,
      notificationPreferences: settings.notificationPreferences,
      dataRetentionDays: settings.dataRetentionDays,
      updatedAt: settings.updatedAt.toISOString(),
    };
  }

  async updateSettings(userId: string, input: UpdateSettingsInput) {
    const data: any = {};
    if (input.theme !== undefined) data.theme = input.theme;
    if (input.scanPreferences !== undefined) data.scanPreferences = input.scanPreferences;
    if (input.requireUpdateConfirmation !== undefined)
      data.requireUpdateConfirmation = input.requireUpdateConfirmation;
    if (input.notificationPreferences !== undefined)
      data.notificationPreferences = input.notificationPreferences;
    if (input.dataRetentionDays !== undefined) data.dataRetentionDays = input.dataRetentionDays;

    const updated = await prisma.$transaction(async (tx) => {
      const settings = await tx.userSettings.upsert({
        where: { userId },
        update: data,
        create: {
          userId,
          theme: input.theme || 'system',
          scanPreferences: input.scanPreferences || { scanMode: 'full', scheduleIntervalDays: 7 },
          requireUpdateConfirmation: input.requireUpdateConfirmation ?? true,
          notificationPreferences: input.notificationPreferences || {
            notifyOnUpdates: true,
            notifyOnFailures: true,
          },
          dataRetentionDays: input.dataRetentionDays ?? 90,
        },
      });

      await tx.auditEvent.create({
        data: {
          actorType: 'USER',
          actorUserId: userId,
          eventType: 'SETTINGS_UPDATED',
          targetType: 'UserSettings',
          targetId: settings.id,
          safeMetadata: data,
        },
      });

      return settings;
    });

    return {
      theme: updated.theme,
      scanPreferences: updated.scanPreferences,
      requireUpdateConfirmation: updated.requireUpdateConfirmation,
      notificationPreferences: updated.notificationPreferences,
      dataRetentionDays: updated.dataRetentionDays,
      updatedAt: updated.updatedAt.toISOString(),
    };
  }
}

export const settingsService = new SettingsService();
