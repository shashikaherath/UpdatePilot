import { z } from 'zod';

export const startScanBodySchema = z.object({
  scanMode: z.enum(['full', 'quick']).default('full'),
});

export const scanDeviceParamSchema = z.object({
  id: z.string().uuid('Invalid device ID format'),
});

export const scanIdParamSchema = z.object({
  id: z.string().uuid('Invalid scan/job ID format'),
});

export type StartScanInput = z.infer<typeof startScanBodySchema>;
