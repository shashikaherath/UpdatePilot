import { prisma } from '../../config/prisma.js';
import { NotFoundError } from '../../utils/errors.js';

export class JobService {
  async getJobById(userId: string, jobId: string) {
    const job = await prisma.job.findFirst({
      where: {
        id: jobId,
        device: {
          ownerUserId: userId,
        },
      },
      include: {
        device: { select: { id: true, deviceName: true } },
        scanJob: true,
        updateJob: {
          include: {
            updateCandidate: {
              include: {
                application: { select: { displayName: true } },
                packageIdentity: { select: { packageId: true } },
              },
            },
          },
        },
      },
    });

    if (!job) {
      throw new NotFoundError('Job not found or access denied.', 'JOB_NOT_FOUND');
    }

    return {
      id: job.id,
      deviceId: job.deviceId,
      deviceName: job.device.deviceName,
      kind: job.kind,
      state: job.status.toLowerCase(),
      startedAt: job.startedAt?.toISOString() || null,
      completedAt: job.completedAt?.toISOString() || null,
      createdAt: job.createdAt.toISOString(),
      errorSummary: job.errorSummary,
      scanDetails: job.scanJob
        ? {
            scanId: job.scanJob.id,
            scanMode: job.scanJob.scanMode,
            scannedCount: job.scanJob.scannedCount,
            foundCount: job.scanJob.foundCount,
          }
        : null,
      updateDetails: job.updateJob
        ? {
            targetVersion: job.updateJob.targetVersion,
            exitCode: job.updateJob.exitCode,
            restartRequired: job.updateJob.restartRequired,
            verifiedInstalledVersion: job.updateJob.verifiedInstalledVersion,
            verificationResult: job.updateJob.verificationResult,
            safeDiagnostics: job.updateJob.safeDiagnostics,
            applicationName: job.updateJob.updateCandidate?.application.displayName || null,
            packageId: job.updateJob.updateCandidate?.packageIdentity.packageId || null,
          }
        : null,
    };
  }
}

export const jobService = new JobService();
