import { prisma } from '../../config/prisma.js';

export class SecurityService {
  async getVerifiedFindings(userId: string) {
    // Only return security findings for package identities installed on the user's active devices
    const findings = await prisma.securityFinding.findMany({
      where: {
        packageIdentity: {
          applications: {
            some: {
              device: {
                ownerUserId: userId,
              },
            },
          },
        },
      },
      include: {
        packageIdentity: {
          select: {
            packageId: true,
            publisher: true,
            source: true,
            applications: {
              where: {
                device: { ownerUserId: userId },
              },
              select: {
                id: true,
                displayName: true,
                installedVersion: true,
                device: { select: { id: true, deviceName: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const data = findings.map((f) => ({
      id: f.id,
      advisoryId: f.advisoryId,
      severity: f.severity,
      affectedVersionRange: f.affectedVersionRange,
      source: f.source,
      publishedAt: f.publishedAt?.toISOString() || null,
      lastVerifiedAt: f.lastVerifiedAt.toISOString(),
      packageId: f.packageIdentity.packageId,
      publisher: f.packageIdentity.publisher,
      affectedApplications: f.packageIdentity.applications.map((app) => ({
        applicationId: app.id,
        applicationName: app.displayName,
        installedVersion: app.installedVersion,
        deviceId: app.device.id,
        deviceName: app.device.deviceName,
      })),
    }));

    return { data };
  }
}

export const securityService = new SecurityService();
