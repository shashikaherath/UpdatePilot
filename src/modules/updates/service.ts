import { prisma } from '../../config/prisma.js';
import { generateSecureToken, sha256 } from '../../utils/crypto.js';
import { BadRequestError, ConflictError, NotFoundError } from '../../utils/errors.js';
import { config } from '../../config/index.js';
import { JobKind, JobStatus, DeviceStatus } from '@prisma/client';
import { ListUpdatesQuery, ExecuteUpdateInput } from './schemas.js';

export class UpdateService {
  async listUpdateCandidates(userId: string, query: ListUpdatesQuery) {
    const { deviceId, page, pageSize } = query;

    const where: any = {
      application: {
        device: {
          ownerUserId: userId,
          status: { not: DeviceStatus.REVOKED },
        },
      },
    };

    if (deviceId) {
      where.application.deviceId = deviceId;
    }

    const skip = (page - 1) * pageSize;
    const take = pageSize;

    const [total, items] = await Promise.all([
      prisma.updateCandidate.count({ where }),
      prisma.updateCandidate.findMany({
        where,
        skip,
        take,
        orderBy: { checkedAt: 'desc' },
        include: {
          application: {
            include: {
              device: { select: { id: true, deviceName: true } },
            },
          },
          packageIdentity: {
            select: { packageId: true, publisher: true },
          },
          releaseMetadata: {
            select: { changelogUrl: true, mayRequireAdmin: true, releaseDate: true },
          },
        },
      }),
    ]);

    const data = items.map((candidate) => ({
      id: candidate.id,
      applicationId: candidate.applicationId,
      applicationName: candidate.application.displayName,
      deviceId: candidate.application.deviceId,
      deviceName: candidate.application.device.deviceName,
      packageId: candidate.packageIdentity.packageId,
      publisher: candidate.packageIdentity.publisher,
      installedVersion: candidate.currentVersion,
      targetVersion: candidate.targetVersion,
      source: candidate.source,
      checkedAt: candidate.checkedAt,
      changelogUrl: candidate.releaseMetadata?.changelogUrl || null,
      mayRequireAdmin: candidate.releaseMetadata?.mayRequireAdmin ?? true,
    }));

    return {
      data,
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async createPreview(userId: string, candidateId: string) {
    const candidate = await prisma.updateCandidate.findFirst({
      where: {
        id: candidateId,
        application: {
          device: {
            ownerUserId: userId,
            status: { not: DeviceStatus.REVOKED },
          },
        },
      },
      include: {
        application: {
          include: {
            device: true,
          },
        },
        packageIdentity: true,
        releaseMetadata: true,
      },
    });

    if (!candidate) {
      throw new NotFoundError(
        'Update candidate not found or not accessible.',
        'UPDATE_CANDIDATE_NOT_FOUND'
      );
    }

    // Generate single-use preview token
    const rawPreviewToken = generateSecureToken(32);
    const tokenHash = sha256(rawPreviewToken);
    const expiresAt = new Date(Date.now() + config.UPDATE_PREVIEW_EXPIRY_MINUTES * 60 * 1000);

    const preview = await prisma.updatePreview.create({
      data: {
        updateCandidateId: candidate.id,
        deviceId: candidate.application.deviceId,
        createdByUserId: userId,
        previewTokenHash: tokenHash,
        targetVersion: candidate.targetVersion,
        source: candidate.source,
        packageId: candidate.packageIdentity.packageId,
        mayRequireAdmin: candidate.releaseMetadata?.mayRequireAdmin ?? true,
        releaseNotesUrl: candidate.releaseMetadata?.changelogUrl || null,
        expiresAt,
      },
    });

    await prisma.auditEvent.create({
      data: {
        actorType: 'USER',
        actorUserId: userId,
        deviceId: candidate.application.deviceId,
        eventType: 'UPDATE_PREVIEWED',
        targetType: 'UpdatePreview',
        targetId: preview.id,
        safeMetadata: {
          applicationName: candidate.application.displayName,
          packageId: candidate.packageIdentity.packageId,
          targetVersion: candidate.targetVersion,
        },
      },
    });

    return {
      applicationId: candidate.applicationId,
      packageId: candidate.packageIdentity.packageId,
      source: candidate.source,
      installedVersion: candidate.currentVersion,
      targetVersion: candidate.targetVersion,
      releaseNotesUrl: candidate.releaseMetadata?.changelogUrl || null,
      mayRequireAdmin: candidate.releaseMetadata?.mayRequireAdmin ?? true,
      previewToken: rawPreviewToken,
      expiresAt: expiresAt.toISOString(),
    };
  }

  async executeUpdate(
    userId: string,
    candidateId: string,
    idempotencyKey: string,
    input: ExecuteUpdateInput
  ) {
    if (!idempotencyKey || typeof idempotencyKey !== 'string') {
      throw new BadRequestError('Idempotency-Key header is required.', 'IDEMPOTENCY_KEY_REQUIRED');
    }

    const keyHash = sha256(idempotencyKey);
    const requestHash = sha256(JSON.stringify({ candidateId, previewToken: input.previewToken }));

    // Check existing idempotency record
    const existingRecord = await prisma.idempotencyRecord.findUnique({
      where: {
        userId_idempotencyKey: {
          userId,
          idempotencyKey,
        },
      },
    });

    if (existingRecord) {
      if (existingRecord.requestHash === requestHash && existingRecord.responseJobId) {
        // Return identical response for idempotent replay
        return {
          jobId: existingRecord.responseJobId,
          state: 'queued',
        };
      } else {
        // Same idempotency key with different payload
        throw new ConflictError(
          'Idempotency key was previously used with a different request payload.',
          'IDEMPOTENCY_PAYLOAD_CONFLICT'
        );
      }
    }

    // Validate preview token
    const tokenHash = sha256(input.previewToken);
    const preview = await prisma.updatePreview.findUnique({
      where: { previewTokenHash: tokenHash },
      include: {
        updateCandidate: {
          include: {
            application: true,
          },
        },
        device: true,
      },
    });

    if (!preview) {
      throw new NotFoundError('Invalid preview token.', 'INVALID_PREVIEW_TOKEN');
    }

    if (preview.createdByUserId !== userId || preview.updateCandidateId !== candidateId) {
      throw new ConflictError('Preview token does not match user or candidate.', 'PREVIEW_MISMATCH');
    }

    if (preview.consumedAt !== null) {
      throw new ConflictError('Preview token has already been consumed.', 'PREVIEW_ALREADY_CONSUMED');
    }

    if (preview.expiresAt <= new Date()) {
      throw new ConflictError('Preview token has expired.', 'PREVIEW_EXPIRED');
    }

    if (preview.device.status === DeviceStatus.REVOKED) {
      throw new ConflictError('Target device is revoked.', 'DEVICE_REVOKED');
    }

    // Execute within database transaction
    const job = await prisma.$transaction(async (tx) => {
      // 1. Atomically mark preview as consumed
      await tx.updatePreview.update({
        where: { id: preview.id },
        data: { consumedAt: new Date() },
      });

      // 2. Create shared Job row
      const createdJob = await tx.job.create({
        data: {
          deviceId: preview.deviceId,
          requestedByUserId: userId,
          kind: JobKind.UPDATE,
          status: JobStatus.QUEUED,
        },
      });

      // 3. Create UpdateJob detail row
      await tx.updateJob.create({
        data: {
          jobId: createdJob.id,
          updateCandidateId: candidateId,
          previewId: preview.id,
          targetVersion: preview.targetVersion,
        },
      });

      // 4. Save Idempotency Record
      await tx.idempotencyRecord.create({
        data: {
          userId,
          idempotencyKey,
          keyHash,
          route: `/api/v1/updates/${candidateId}/execute`,
          requestHash,
          responseJobId: createdJob.id,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
        },
      });

      // 5. Audit Event
      await tx.auditEvent.create({
        data: {
          actorType: 'USER',
          actorUserId: userId,
          deviceId: preview.deviceId,
          jobId: createdJob.id,
          eventType: 'UPDATE_QUEUED',
          targetType: 'UpdateJob',
          targetId: createdJob.id,
          safeMetadata: {
            packageId: preview.packageId,
            targetVersion: preview.targetVersion,
            source: preview.source,
          },
        },
      });

      return createdJob;
    });

    return {
      jobId: job.id,
      state: 'queued',
    };
  }
}

export const updateService = new UpdateService();
