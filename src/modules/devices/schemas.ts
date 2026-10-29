import { z } from 'zod';

export const createPairingCodeSchema = z.object({
  deviceName: z.string().min(1, 'Device name is required').max(100).trim(),
});

export const deviceIdParamSchema = z.object({
  id: z.string().uuid('Invalid device ID format'),
});

export type CreatePairingCodeInput = z.infer<typeof createPairingCodeSchema>;
