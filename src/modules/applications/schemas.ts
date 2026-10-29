import { z } from 'zod';
import { MatchStatus } from '@prisma/client';

export const listApplicationsQuerySchema = z.object({
  q: z.string().optional(),
  deviceId: z.string().uuid().optional(),
  status: z.nativeEnum(MatchStatus).optional(),
  source: z.string().optional(),
  sort: z.enum(['displayName', 'installedVersion', 'matchStatus', 'updatedAt', 'createdAt']).default('displayName'),
  order: z.enum(['asc', 'desc']).default('asc'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const applicationIdParamSchema = z.object({
  id: z.string().uuid('Invalid application ID format'),
});

export type ListApplicationsQuery = z.infer<typeof listApplicationsQuerySchema>;
