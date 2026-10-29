import { prisma } from '../../config/prisma.js';
import { generatePairingCode, sha256 } from '../../utils/crypto.js';
import { NotFoundError } from '../../utils/errors.js';
import { config } from '../../config/index.js';
import { DeviceStatus, JobStatus } from '@prisma/client';
import { CreatePairingCodeInput } from './schemas.js';

export class DeviceService {
  async getDevicesForUser(userId: string) {
    const devices = await prisma.device.findMany({
      where: {
        ownerUserId: userId,
        status: { not: DeviceStatus.REVOKED },
      },
      select: {
        id: true,
        deviceName: true,
        osInfo: true,
        agentVersion: true,
        status: true,
        lastSeenAt: true,
        pairedAt: true,
        createdAt: true,
        _count: {
          select: {
            applications: true,
            jobs: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return devices;
  }

  async createPairingCode(userId: string, input: CreatePairingCodeInput) {
    const rawCode = generatePairingCode();
    const codeHash = sha256(rawCode);
    const expiresAt = new Date(Date.now() + config.PAIRING_CODE_EXPIRY_MINUTES * 60 * 1000);

    const record = await prisma.devicePairingCode.create({
      data: {
        ownerUserId: userId,
        deviceName: input.deviceName,
        codeHash,
        expiresAt,
      },
    });

    await prisma.auditEvent.create({
      data: {
        actorType: 'USER',
        actorUserId: userId,
        eventType: 'PAIRING_CODE_CREATED',
        targetType: 'DevicePairingCode',
        targetId: record.id,
        safeMetadata: { deviceName: input.deviceName },
      },
    });

    // Return the raw pairing code ONCE; database only stores codeHash
    return {
      pairingCode: rawCode,
      expiresAt: record.expiresAt,
      deviceName: record.deviceName,
    };
  }

  async revokeDevice(userId: string, deviceId: string) {
    const device = await prisma.device.findFirst({
      where: {
        id: deviceId,
        ownerUserId: userId,
      },
    });

    if (!device) {
      throw new NotFoundError('Device not found or not owned by user.', 'DEVICE_NOT_FOUND');
    }

    await prisma.$transaction(async (tx) => {
      // 1. Mark device as revoked
      await tx.device.update({
        where: { id: deviceId },
        data: { status: DeviceStatus.REVOKED },
      });

      // 2. Revoke all credentials for the device
      await tx.agentCredential.updateMany({
        where: { deviceId },
        data: { revokedAt: new Date() },
      });

      // 3. Cancel any pending or running jobs
      await tx.job.updateMany({
        where: {
          deviceId,
          status: { in: [JobStatus.QUEUED, JobStatus.RUNNING, JobStatus.VERIFYING] },
        },
        data: {
          status: JobStatus.CANCELLED,
          completedAt: new Date(),
          errorSummary: 'Job cancelled due to device revocation.',
        },
      });

      // 4. Audit event
      await tx.auditEvent.create({
        data: {
          actorType: 'USER',
          actorUserId: userId,
          deviceId,
          eventType: 'DEVICE_REVOKED',
          targetType: 'Device',
          targetId: deviceId,
          safeMetadata: { deviceName: device.deviceName },
        },
      });
    });

    return { message: 'Device revoked successfully.' };
  }
}

export const deviceService = new DeviceService();
