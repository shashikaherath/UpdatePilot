import { prisma } from '../../config/prisma.js';
import { NotFoundError } from '../../utils/errors.js';
import { Prisma, DeviceStatus } from '@prisma/client';
import { ListApplicationsQuery } from './schemas.js';

export class ApplicationService {
  async listApplications(userId: string, query: ListApplicationsQuery) {
    const { q, deviceId, status, source, sort, order, page, pageSize } = query;

    // Filter by user's owned devices (exclude revoked devices)
    const where: Prisma.ApplicationWhereInput = {
      device: {
        ownerUserId: userId,
        status: { not: DeviceStatus.REVOKED },
      },
    };

    if (deviceId) {
      where.deviceId = deviceId;
    }

    if (status) {
      where.matchStatus = status;
    }

    if (source) {
      where.source = { equals: source, mode: 'insensitive' };
    }

    if (q) {
      where.OR = [
        { displayName: { contains: q, mode: 'insensitive' } },
        { publisher: { contains: q, mode: 'insensitive' } },
        { packageIdentity: { packageId: { contains: q, mode: 'insensitive' } } },
      ];
    }

    const skip = (page - 1) * pageSize;
    const take = pageSize;

    const [total, items] = await Promise.all([
      prisma.application.count({ where }),
      prisma.application.findMany({
        where,
        skip,
        take,
        orderBy: { [sort]: order },
        include: {
          device: { select: { id: true, deviceName: true, status: true } },
          packageIdentity: {
            select: {
              id: true,
              packageId: true,
              source: true,
              publisher: true,
              architecture: true,
            },
          },
          updateCandidates: {
            select: {
              id: true,
              targetVersion: true,
              checkedAt: true,
            },
            take: 1,
            orderBy: { checkedAt: 'desc' },
          },
        },
      }),
    ]);

    const data = items.map((app) => ({
      id: app.id,
      deviceId: app.deviceId,
      deviceName: app.device.deviceName,
      displayName: app.displayName,
      publisher: app.publisher,
      installedVersion: app.installedVersion,
      source: app.source,
      matchStatus: app.matchStatus,
      packageId: app.packageIdentity?.packageId || null,
      availableVersion: app.updateCandidates[0]?.targetVersion || null,
      updateCandidateId: app.updateCandidates[0]?.id || null,
      firstSeenAt: app.firstSeenAt,
      lastSeenAt: app.lastSeenAt,
    }));

    // Safety-net dedup: in case zombie rows still exist in DB, only send one entry
    // per (deviceId, displayName) pair — the one with the most recent lastSeenAt.
    const seen = new Map<string, (typeof data)[0]>();
    for (const item of data) {
      const key = `${item.deviceId}:${item.displayName.trim().toLowerCase()}`;
      const prev = seen.get(key);
      if (!prev || (item.lastSeenAt && (!prev.lastSeenAt || item.lastSeenAt > prev.lastSeenAt))) {
        seen.set(key, item);
      }
    }
    const dedupedData = Array.from(seen.values());

    return {
      data: dedupedData,
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async getApplicationById(userId: string, id: string) {
    const app = await prisma.application.findFirst({
      where: {
        id,
        device: {
          ownerUserId: userId,
          status: { not: DeviceStatus.REVOKED },
        },
      },
      include: {
        device: { select: { id: true, deviceName: true, osInfo: true, status: true } },
        packageIdentity: {
          include: {
            releases: {
              orderBy: { version: 'desc' },
              take: 5,
            },
            securityFindings: true,
          },
        },
        updateCandidates: {
          orderBy: { checkedAt: 'desc' },
          take: 1,
        },
        snapshots: {
          orderBy: { capturedAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!app) {
      throw new NotFoundError('Application not found or access denied.', 'APPLICATION_NOT_FOUND');
    }

    return {
      id: app.id,
      deviceId: app.deviceId,
      device: app.device,
      displayName: app.displayName,
      publisher: app.publisher,
      installedVersion: app.installedVersion,
      source: app.source,
      matchStatus: app.matchStatus,
      firstSeenAt: app.firstSeenAt,
      lastSeenAt: app.lastSeenAt,
      packageIdentity: app.packageIdentity
        ? {
            id: app.packageIdentity.id,
            packageId: app.packageIdentity.packageId,
            source: app.packageIdentity.source,
            publisher: app.packageIdentity.publisher,
            architecture: app.packageIdentity.architecture,
            recentReleases: app.packageIdentity.releases,
            securityFindings: app.packageIdentity.securityFindings,
          }
        : null,
      updateCandidate: app.updateCandidates[0] || null,
      recentSnapshots: app.snapshots,
    };
  }
}

export const applicationService = new ApplicationService();
