import { z } from 'zod';

export const notificationPreferencesSchema = z.object({
  notifyOnUpdatesAvailable: z.boolean().default(true),
  notifyOnScanCompleted: z.boolean().default(true),
  notifyOnScanFailed: z.boolean().default(true),
  notifyOnUpdateCompleted: z.boolean().default(true),
  notifyOnUpdateFailed: z.boolean().default(true),
  notifyOnDeviceOffline: z.boolean().default(true),
  notifyOnUpdates: z.boolean().default(true),
  notifyOnFailures: z.boolean().default(true),
});

export const updateSettingsSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']).optional(),
  scanPreferences: z
    .object({
      scanMode: z.enum(['full', 'quick']).default('full'),
      scheduleIntervalDays: z.number().int().min(1).max(30).default(7),
    })
    .optional(),
  requireUpdateConfirmation: z.boolean().optional(),
  notificationPreferences: notificationPreferencesSchema.optional(),
  dataRetentionDays: z.number().int().min(7).max(365).optional(),
});

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
export type NotificationPreferences = z.infer<typeof notificationPreferencesSchema>;
