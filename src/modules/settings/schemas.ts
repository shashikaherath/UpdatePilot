import { z } from 'zod';

export const updateSettingsSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']).optional(),
  scanPreferences: z
    .object({
      scanMode: z.enum(['full', 'quick']).default('full'),
      scheduleIntervalDays: z.number().int().min(1).max(30).default(7),
    })
    .optional(),
  requireUpdateConfirmation: z.boolean().optional(),
  notificationPreferences: z
    .object({
      notifyOnUpdates: z.boolean().default(true),
      notifyOnFailures: z.boolean().default(true),
    })
    .optional(),
  dataRetentionDays: z.number().int().min(7).max(365).optional(),
});

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
