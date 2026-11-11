import { z } from 'zod';

export const createPairingCodeSchema = z.object({
  deviceName: z.string().min(1, 'Device name is required').max(100).trim(),
});

export const autoEnrollDeviceSchema = z.object({
  deviceName: z.string().min(1, 'Device name is required').max(100).trim(),
  machineId: z.string().min(1, 'Machine ID is required').max(150).trim().optional(),
  osInfo: z.string().max(255).optional(),
  agentVersion: z.string().max(50).optional(),
});

export const deviceIdParamSchema = z.object({
  id: z.string().uuid('Invalid device ID format'),
});

export type CreatePairingCodeInput = z.infer<typeof createPairingCodeSchema>;
export type AutoEnrollDeviceInput = z.infer<typeof autoEnrollDeviceSchema>;
