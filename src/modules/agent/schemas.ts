import { z } from 'zod';
import { VerificationResult } from '@prisma/client';

export const agentPairSchema = z.object({
  pairingCode: z.string().min(1, 'Pairing code is required').trim(),
  osInfo: z.string().optional(),
  agentVersion: z.string().optional(),
});

export const agentHeartbeatSchema = z.object({
  osInfo: z.string().optional(),
  agentVersion: z.string().optional(),
});

export const agentScanResultsSchema = z.object({
  applications: z.array(
    z.object({
      displayName: z.string().min(1, 'Application display name is required'),
      publisher: z.string().optional().nullable(),
      installedVersion: z.string().default('unknown'),
      source: z.string().default('winget'),
      packageId: z.string().optional().nullable(),
    })
  ),
});

export const agentJobResultSchema = z.object({
  exitCode: z.number().int(),
  restartRequired: z.boolean().default(false),
  rescannedVersion: z.string().optional().nullable(),
  verificationResult: z.nativeEnum(VerificationResult).default(VerificationResult.VERIFIED_SUCCESS),
  safeDiagnostics: z.string().max(1000).optional().nullable(),
});

export const agentJobIdParamSchema = z.object({
  id: z.string().uuid('Invalid job ID format'),
});

export type AgentPairInput = z.infer<typeof agentPairSchema>;
export type AgentHeartbeatInput = z.infer<typeof agentHeartbeatSchema>;
export type AgentScanResultsInput = z.infer<typeof agentScanResultsSchema>;
export type AgentJobResultInput = z.infer<typeof agentJobResultSchema>;
