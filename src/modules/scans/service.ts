import { prisma } from '../../config/prisma.js';
import { config } from '../../config/index.js';
import { JobKind, JobStatus, DeviceStatus } from '@prisma/client';
import { ConflictError, NotFoundError } from '../../utils/errors.js';
import { StartScanInput } from './schemas.js';

export class ScanService {
  async startScan(userId: string, deviceId: string, input: StartScanInput) {
    const device = await prisma.device.findFirst({
      where: {
        id: deviceId,
        ownerUserId: userId,
        status: { not: DeviceStatus.REVOKED },
      },
    });

    if (!device) {
      throw new NotFoundError('Device not found or not owned by user.', 'DEVICE_NOT_FOUND');
    }

    // Check if an active scan job already exists for this device
    const activeScan = await prisma.job.findFirst({
      where: {
        deviceId,
        kind: JobKind.SCAN,
        status: { in: [JobStatus.QUEUED, JobStatus.RUNNING] },
      },
    });

    if (activeScan) {
      const now = new Date();
      let isStale = false;
      let staleReason = '';

      if (activeScan.status === JobStatus.RUNNING) {
        // Use proper job lease expiration: if lease expired, the running job was abandoned
        if (activeScan.leaseExpiresAt && activeScan.leaseExpiresAt.getTime() <= now.getTime()) {
          isStale = true;
          staleReason = 'Scan job lease expired without completion or renewal from agent';
        }
      } else if (activeScan.status === JobStatus.QUEUED) {
        // If queued longer than lease window (5 mins) and unclaimed by agent
        const queuedAgeMs = now.getTime() - activeScan.createdAt.getTime();
        const maxQueueWaitMs = config.JOB_LEASE_EXPIRY_MINUTES * 60 * 1000;
        if (queuedAgeMs > maxQueueWaitMs) {
          isStale = true;
          staleReason = 'Scan job timed out in queue without being claimed by agent';
        }
      }

      if (isStale) {
        // Safely transition the abandoned/stale job to FAILED without deleting the record
        await prisma.$transaction(async (tx) => {
          await tx.job.update({
            where: { id: activeScan.id },
            data: {
              status: JobStatus.FAILED,
              completedAt: now,
              leaseExpiresAt: null,
              errorSummary: staleReason,
            },
          });
          await tx.auditEvent.create({
            data: {
              actorType: 'SYSTEM',
              actorUserId: userId,
              deviceId,
              jobId: activeScan.id,
              eventType: 'SCAN_FAILED',
              targetType: 'Job',
              targetId: activeScan.id,
              safeMetadata: { reason: staleReason, previousStatus: activeScan.status },
            },
          });
        });
      } else {
        // Reuse genuinely active scan (lease still valid or fresh queue within lease window)
        const existingScanJob = await prisma.scanJob.findUnique({
          where: { jobId: activeScan.id },
        });
        return {
          scanId: existingScanJob?.id || activeScan.id,
          jobId: activeScan.id,
          state: activeScan.status.toLowerCase(),
          createdAt: activeScan.createdAt.toISOString(),
        };
      }
    }

    // Create persistent job + scanJob within transaction
    const { job, scanJob } = await prisma.$transaction(async (tx) => {
      const createdJob = await tx.job.create({
        data: {
          deviceId,
          requestedByUserId: userId,
          kind: JobKind.SCAN,
          status: JobStatus.QUEUED,
        },
      });

      const createdScanJob = await tx.scanJob.create({
        data: {
          jobId: createdJob.id,
          scanMode: input.scanMode,
        },
      });

      await tx.auditEvent.create({
        data: {
          actorType: 'USER',
          actorUserId: userId,
          deviceId,
          jobId: createdJob.id,
          eventType: 'SCAN_QUEUED',
          targetType: 'ScanJob',
          targetId: createdScanJob.id,
          safeMetadata: { scanMode: input.scanMode },
        },
      });

      return { job: createdJob, scanJob: createdScanJob };
    });

    return {
      scanId: scanJob.id,
      jobId: job.id,
      state: 'queued',
      createdAt: job.createdAt.toISOString(),
    };
  }

  async getScan(userId: string, id: string) {
    // Find job either by scanJob.id or job.id
    const job = await prisma.job.findFirst({
      where: {
        OR: [
          { id },
          { scanJob: { id } },
        ],
        device: {
          ownerUserId: userId,
        },
        kind: JobKind.SCAN,
      },
      include: {
        scanJob: true,
        device: { select: { deviceName: true } },
      },
    });

    if (!job || !job.scanJob) {
      throw new NotFoundError('Scan job not found or access denied.', 'SCAN_NOT_FOUND');
    }

    return {
      scanId: job.scanJob.id,
      jobId: job.id,
      state: job.status.toLowerCase(),
      scanMode: job.scanJob.scanMode,
      scannedCount: job.scanJob.scannedCount,
      foundCount: job.scanJob.foundCount,
      startedAt: job.startedAt?.toISOString() || null,
      completedAt: job.completedAt?.toISOString() || null,
      errorSummary: job.errorSummary,
      deviceName: job.device.deviceName,
    };
  }
}

export const scanService = new ScanService();
