import { prisma } from '../../config/prisma.js';
import { DeviceStatus, JobKind } from '@prisma/client';

export class DashboardService {
  async getOverview(userId: string) {
    // 1. User's active devices
    const devices = await prisma.device.findMany({
      where: {
        ownerUserId: userId,
        status: { not: DeviceStatus.REVOKED },
      },
      select: {
        id: true,
        deviceName: true,
        status: true,
        lastSeenAt: true,
        agentVersion: true,
        osInfo: true,
      },
    });

    const deviceIds = devices.map((d) => d.id);

    if (deviceIds.length === 0) {
      return {
        applicationCount: 0,
        availableUpdatesCount: 0,
        lastScan: null,
        devices: [],
        recentActivity: [],
      };
    }

    // 2. Count applications across user's devices
    const applicationCount = await prisma.application.count({
      where: {
        deviceId: { in: deviceIds },
      },
    });

    // 3. Count available update candidates
    const availableUpdatesCount = await prisma.updateCandidate.count({
      where: {
        application: {
          deviceId: { in: deviceIds },
        },
      },
    });

    // 4. Last scan job
    const lastScanJob = await prisma.job.findFirst({
      where: {
        deviceId: { in: deviceIds },
        kind: JobKind.SCAN,
      },
      orderBy: { createdAt: 'desc' },
      include: {
        device: { select: { deviceName: true } },
        scanJob: { select: { scanMode: true, scannedCount: true, foundCount: true } },
      },
    });

    // 5. Recent activity (last 10 audit events)
    const recentActivity = await prisma.auditEvent.findMany({
      where: {
        OR: [
          { actorUserId: userId },
          { deviceId: { in: deviceIds } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        actorType: true,
        eventType: true,
        targetType: true,
        targetId: true,
        safeMetadata: true,
        createdAt: true,
      },
    });

    return {
      applicationCount,
      availableUpdatesCount,
      lastScan: lastScanJob
        ? {
            jobId: lastScanJob.id,
            status: lastScanJob.status,
            deviceName: lastScanJob.device.deviceName,
            scanMode: lastScanJob.scanJob?.scanMode ?? 'full',
            scannedCount: lastScanJob.scanJob?.scannedCount ?? 0,
            foundCount: lastScanJob.scanJob?.foundCount ?? 0,
            createdAt: lastScanJob.createdAt,
            completedAt: lastScanJob.completedAt,
          }
        : null,
      devices,
      recentActivity,
    };
  }
}

export const dashboardService = new DashboardService();
