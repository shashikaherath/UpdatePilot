import { z } from 'zod';

export const listUpdatesQuerySchema = z.object({
  deviceId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const updateCandidateIdParamSchema = z.object({
  id: z.string().uuid('Invalid update candidate ID format'),
});

export const executeUpdateBodySchema = z.object({
  previewToken: z.string().min(16, 'Preview token is required'),
});

export type ListUpdatesQuery = z.infer<typeof listUpdatesQuerySchema>;
export type ExecuteUpdateInput = z.infer<typeof executeUpdateBodySchema>;
