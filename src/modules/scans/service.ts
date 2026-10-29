import { prisma } from '../../config/prisma.js';
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
      throw new ConflictError(
        'An active scan job is already queued or running for this device.',
        'ACTIVE_SCAN_CONFLICT',
        { activeJobId: activeScan.id, status: activeScan.status }
      );
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
