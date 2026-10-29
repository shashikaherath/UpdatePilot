import { prisma } from '../../config/prisma.js';
import { sanitizeCsvCell } from '../../utils/crypto.js';
import { Prisma } from '@prisma/client';
import { ListHistoryQuery } from './schemas.js';

export class HistoryService {
  private buildWhereClause(userId: string, query: ListHistoryQuery): Prisma.JobWhereInput {
    const { type, deviceId, outcome, dateFrom, dateTo } = query;

    const where: Prisma.JobWhereInput = {
      device: {
        ownerUserId: userId,
      },
    };

    if (deviceId) {
      where.deviceId = deviceId;
    }

    if (type) {
      where.kind = type;
    }

    if (outcome) {
      where.status = outcome;
    }

    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) {
        where.createdAt.gte = new Date(dateFrom);
      }
      if (dateTo) {
        where.createdAt.lte = new Date(dateTo);
      }
    }

    return where;
  }

  async getHistory(userId: string, query: ListHistoryQuery) {
    const { page, pageSize } = query;
    const where = this.buildWhereClause(userId, query);

    const skip = (page - 1) * pageSize;
    const take = pageSize;

    const [total, jobs] = await Promise.all([
      prisma.job.count({ where }),
      prisma.job.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
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
      }),
    ]);

    const data = jobs.map((job) => ({
      id: job.id,
      kind: job.kind,
      status: job.status,
      deviceId: job.deviceId,
      deviceName: job.device.deviceName,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      errorSummary: job.errorSummary,
      details: job.kind === 'SCAN'
        ? {
            scanMode: job.scanJob?.scanMode,
            scannedCount: job.scanJob?.scannedCount,
            foundCount: job.scanJob?.foundCount,
          }
        : {
            applicationName: job.updateJob?.updateCandidate?.application.displayName || null,
            packageId: job.updateJob?.updateCandidate?.packageIdentity.packageId || null,
            targetVersion: job.updateJob?.targetVersion,
            exitCode: job.updateJob?.exitCode,
            restartRequired: job.updateJob?.restartRequired,
            verifiedInstalledVersion: job.updateJob?.verifiedInstalledVersion,
            verificationResult: job.updateJob?.verificationResult,
          },
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

  async exportCsv(userId: string, query: ListHistoryQuery): Promise<string> {
    const where = this.buildWhereClause(userId, query);

    const jobs = await prisma.job.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 1000, // Safe CSV limit
      include: {
        device: { select: { deviceName: true } },
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

    const headers = [
      'Job ID',
      'Kind',
      'Status',
      'Device Name',
      'Application / Target',
      'Package ID',
      'Target / Scanned Version',
      'Verification Result',
      'Exit Code',
      'Created At',
      'Completed At',
      'Error Summary',
    ];

    const rows = jobs.map((job) => {
      const isScan = job.kind === 'SCAN';
      const appName = isScan ? 'Full System Scan' : job.updateJob?.updateCandidate?.application.displayName || 'Update';
      const packageId = isScan ? '' : job.updateJob?.updateCandidate?.packageIdentity.packageId || '';
      const version = isScan ? `${job.scanJob?.scannedCount || 0} apps` : job.updateJob?.targetVersion || '';
      const verification = isScan ? '' : job.updateJob?.verificationResult || '';
      const exitCode = isScan ? '' : job.updateJob?.exitCode !== null ? String(job.updateJob?.exitCode) : '';

      return [
        sanitizeCsvCell(job.id),
        sanitizeCsvCell(job.kind),
        sanitizeCsvCell(job.status),
        sanitizeCsvCell(job.device.deviceName),
        sanitizeCsvCell(appName),
        sanitizeCsvCell(packageId),
        sanitizeCsvCell(version),
        sanitizeCsvCell(verification),
        sanitizeCsvCell(exitCode),
        sanitizeCsvCell(job.createdAt.toISOString()),
        sanitizeCsvCell(job.completedAt ? job.completedAt.toISOString() : ''),
        sanitizeCsvCell(job.errorSummary || ''),
      ].join(',');
    });

    return [headers.join(','), ...rows].join('\r\n');
  }
}

export const historyService = new HistoryService();
