import { z } from 'zod';
import { JobKind, JobStatus } from '@prisma/client';

export const listHistoryQuerySchema = z.object({
  type: z.nativeEnum(JobKind).optional(),
  deviceId: z.string().uuid().optional(),
  outcome: z.nativeEnum(JobStatus).optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export type ListHistoryQuery = z.infer<typeof listHistoryQuerySchema>;
