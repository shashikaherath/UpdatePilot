import { z } from 'zod';

export const jobIdParamSchema = z.object({
  id: z.string().uuid('Invalid job ID format'),
});
