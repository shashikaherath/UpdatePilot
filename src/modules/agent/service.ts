import { prisma } from '../../config/prisma.js';
import { generateSecureToken, sha256 } from '../../utils/crypto.js';
import { NotFoundError, UnauthorizedError, ConflictError } from '../../utils/errors.js';
import { config } from '../../config/index.js';
import { DeviceStatus, JobKind, JobStatus, MatchStatus, VerificationResult } from '@prisma/client';
import {
  AgentPairInput,
  AgentHeartbeatInput,
  AgentScanResultsInput,
  AgentJobResultInput,
} from './schemas.js';

export class AgentService {
  async pairDevice(input: AgentPairInput) {
    const codeHash = sha256(input.pairingCode);

    const pairingCodeRecord = await prisma.devicePairingCode.findUnique({
      where: { codeHash },
    });

    if (!pairingCodeRecord) {
      throw new UnauthorizedError('Invalid pairing code.', 'INVALID_PAIRING_CODE');
    }

    if (pairingCodeRecord.usedAt !== null) {
      throw new UnauthorizedError('Pairing code has already been used.', 'PAIRING_CODE_USED');
    }

    if (pairingCodeRecord.expiresAt <= new Date()) {
      throw new UnauthorizedError('Pairing code has expired.', 'PAIRING_CODE_EXPIRED');
    }

    // Generate high-entropy raw device bearer token
    const rawDeviceToken = generateSecureToken(32);
    const credentialHash = sha256(rawDeviceToken);

    const result = await prisma.$transaction(async (tx) => {
      // 1. Create the device record for the user
      const device = await tx.device.create({
        data: {
          ownerUserId: pairingCodeRecord.ownerUserId,
          deviceName: pairingCodeRecord.deviceName,
          osInfo: input.osInfo || null,
          agentVersion: input.agentVersion || null,
          status: DeviceStatus.CONNECTED,
          lastSeenAt: new Date(),
          pairedAt: new Date(),
        },
      });

      // 2. Mark pairing code as used
      await tx.devicePairingCode.update({
        where: { id: pairingCodeRecord.id },
        data: {
          usedAt: new Date(),
          pairedDeviceId: device.id,
        },
      });

      // 3. Store the credential hash
      await tx.agentCredential.create({
        data: {
          deviceId: device.id,
          credentialHash,
        },
      });

      // 4. Record audit event
      await tx.auditEvent.create({
        data: {
          actorType: 'AGENT',
          actorUserId: pairingCodeRecord.ownerUserId,
          deviceId: device.id,
          eventType: 'DEVICE_PAIRED',
          targetType: 'Device',
          targetId: device.id,
          safeMetadata: {
            deviceName: device.deviceName,
            osInfo: input.osInfo,
            agentVersion: input.agentVersion,
          },
        },
      });

      return {
        deviceId: device.id,
        deviceName: device.deviceName,
        deviceToken: rawDeviceToken,
      };
    });

    return result;
  }

  async heartbeat(deviceId: string, input: AgentHeartbeatInput) {
    await prisma.device.update({
      where: { id: deviceId },
      data: {
        status: DeviceStatus.CONNECTED,
        lastSeenAt: new Date(),
        ...(input.osInfo ? { osInfo: input.osInfo } : {}),
        ...(input.agentVersion ? { agentVersion: input.agentVersion } : {}),
      },
    });

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  async claimJob(deviceId: string) {
    const now = new Date();
    const leaseExpiresAt = new Date(now.getTime() + config.JOB_LEASE_EXPIRY_MINUTES * 60 * 1000);

    // Find next QUEUED job or RUNNING job whose lease expired
    const job = await prisma.$transaction(async (tx) => {
      const availableJob = await tx.job.findFirst({
        where: {
          deviceId,
          OR: [
            { status: JobStatus.QUEUED },
            {
              status: JobStatus.RUNNING,
              leaseExpiresAt: { lte: now },
            },
          ],
        },
        orderBy: { createdAt: 'asc' },
        include: {
          scanJob: true,
          updateJob: {
            include: {
              preview: true,
            },
          },
        },
      });

      if (!availableJob) {
        return null;
      }

      const updatedJob = await tx.job.update({
        where: { id: availableJob.id },
        data: {
          status: JobStatus.RUNNING,
          claimedAt: now,
          startedAt: availableJob.startedAt || now,
          leaseExpiresAt,
        },
        include: {
          scanJob: true,
          updateJob: {
            include: {
              preview: true,
            },
          },
        },
      });

      return updatedJob;
    });

    if (!job) {
      return null;
    }

    if (job.kind === JobKind.SCAN) {
      return {
        jobId: job.id,
        kind: 'SCAN',
        scanMode: job.scanJob?.scanMode || 'full',
      };
    } else {
      return {
        jobId: job.id,
        kind: 'UPDATE',
        packageId: job.updateJob?.preview?.packageId || 'unknown',
        targetVersion: job.updateJob?.targetVersion || 'latest',
        source: job.updateJob?.preview?.source || 'winget',
        mayRequireAdmin: job.updateJob?.preview?.mayRequireAdmin ?? true,
      };
    }
  }

  async submitScanResults(deviceId: string, scanOrJobId: string, input: AgentScanResultsInput) {
    const job = await prisma.job.findFirst({
      where: {
        OR: [
          { id: scanOrJobId },
          { scanJob: { id: scanOrJobId } },
        ],
        deviceId,
        kind: JobKind.SCAN,
      },
      include: { scanJob: true },
    });

    if (!job || !job.scanJob) {
      throw new NotFoundError(
        'Scan job not found or does not belong to this device.',
        'SCAN_JOB_NOT_FOUND'
      );
    }

    // Idempotent: If already succeeded, return current counts
    if (job.status === JobStatus.SUCCEEDED) {
      return {
        status: 'received',
        scannedCount: job.scanJob.scannedCount,
        foundCount: job.scanJob.foundCount,
      };
    }

    const { applications } = input;

    try {
      await prisma.$transaction(
        async (tx) => {
          let matchedCount = 0;

          // 1. Bulk pre-fetch existing Application records for this device
          const existingApps = await tx.application.findMany({
            where: { deviceId },
          });
          const appMap = new Map<string, typeof existingApps[0]>();
          for (const app of existingApps) {
            appMap.set(app.displayName.toLowerCase().trim(), app);
          }

          // 2. Bulk pre-fetch existing PackageIdentity records for all incoming packageIds
          const rawPackageIds = Array.from(
            new Set(
              applications
                .map((a) => a.packageId?.trim())
                .filter((id): id is string => Boolean(id))
            )
          );

          const existingPkgIdentities = rawPackageIds.length > 0
            ? await tx.packageIdentity.findMany({
                where: {
                  packageId: { in: rawPackageIds, mode: 'insensitive' },
                  source: 'winget',
                },
              })
            : [];

          const pkgMap = new Map<string, typeof existingPkgIdentities[0]>();
          for (const pkg of existingPkgIdentities) {
            pkgMap.set(pkg.packageId.toLowerCase(), pkg);
          }

          // 3. Process each application with in-memory lookups
          for (const item of applications) {
            let packageIdentity = null;
            let matchStatus: MatchStatus = MatchStatus.UNKNOWN;

            if (item.packageId) {
              const lowerPkgId = item.packageId.toLowerCase().trim();
              packageIdentity = pkgMap.get(lowerPkgId) || null;

              if (!packageIdentity && (item.source === 'winget' || !item.source)) {
                packageIdentity = await tx.packageIdentity.create({
                  data: {
                    packageId: item.packageId.trim(),
                    source: item.source || 'winget',
                    publisher: item.publisher || null,
                  },
                });
                pkgMap.set(lowerPkgId, packageIdentity);
              }

              if (packageIdentity) {
                matchStatus = MatchStatus.MATCHED;
                matchedCount++;
              } else {
                matchStatus = MatchStatus.UNMATCHED;
              }
            }

            // Upsert Application on this device using pre-fetched map
            const appKey = item.displayName.toLowerCase().trim();
            const existingApp = appMap.get(appKey);

            let appRecord;
            if (existingApp) {
              appRecord = await tx.application.update({
                where: { id: existingApp.id },
                data: {
                  installedVersion: item.installedVersion,
                  publisher: item.publisher || existingApp.publisher,
                  source: item.source || existingApp.source,
                  packageIdentityId: packageIdentity ? packageIdentity.id : existingApp.packageIdentityId,
                  matchStatus: packageIdentity ? MatchStatus.MATCHED : existingApp.matchStatus,
                  lastSeenAt: new Date(),
                },
              });
              appMap.set(appKey, appRecord);
            } else {
              appRecord = await tx.application.create({
                data: {
                  deviceId,
                  displayName: item.displayName,
                  publisher: item.publisher,
                  installedVersion: item.installedVersion,
                  source: item.source || 'unknown',
                  packageIdentityId: packageIdentity?.id,
                  matchStatus,
                },
              });
              appMap.set(appKey, appRecord);
            }

            // Record ApplicationSnapshot for historical auditing
            await tx.applicationSnapshot.create({
              data: {
                scanJobId: job.scanJob!.id,
                applicationId: appRecord.id,
                displayName: appRecord.displayName,
                publisher: appRecord.publisher,
                installedVersion: appRecord.installedVersion,
                matchStatus: appRecord.matchStatus,
                source: appRecord.source,
              },
            });

            // If package matched, check if a newer release exists or was reported to generate UpdateCandidate
            if (packageIdentity) {
              if (item.availableVersion && item.availableVersion !== appRecord.installedVersion) {
                let release = await tx.releaseMetadata.findFirst({
                  where: {
                    packageIdentityId: packageIdentity.id,
                    version: item.availableVersion,
                  },
                });

                if (!release) {
                  release = await tx.releaseMetadata.create({
                    data: {
                      packageIdentityId: packageIdentity.id,
                      version: item.availableVersion,
                      source: packageIdentity.source,
                    },
                  });
                }

                // Clear any stale update candidates with different target versions for this app
                await tx.updateCandidate.deleteMany({
                  where: {
                    applicationId: appRecord.id,
                    targetVersion: { not: item.availableVersion },
                  },
                });

                const existingCandidate = await tx.updateCandidate.findFirst({
                  where: {
                    applicationId: appRecord.id,
                    packageIdentityId: packageIdentity.id,
                    targetVersion: item.availableVersion,
                  },
                });

                if (!existingCandidate) {
                  await tx.updateCandidate.create({
                    data: {
                      applicationId: appRecord.id,
                      packageIdentityId: packageIdentity.id,
                      releaseMetadataId: release.id,
                      currentVersion: appRecord.installedVersion,
                      targetVersion: item.availableVersion,
                      source: packageIdentity.source,
                    },
                  });
                }
              } else {
                // Application is up-to-date: remove any stale candidate
                await tx.updateCandidate.deleteMany({
                  where: {
                    applicationId: appRecord.id,
                  },
                });
              }
            }
          }

          // Mark Job as SUCCEEDED
          await tx.job.update({
            where: { id: job.id },
            data: {
              status: JobStatus.SUCCEEDED,
              completedAt: new Date(),
              leaseExpiresAt: null,
              errorSummary: null,
            },
          });

          // Update scan counts
          await tx.scanJob.update({
            where: { id: job.scanJob!.id },
            data: {
              scannedCount: applications.length,
              foundCount: applications.length,
            },
          });

          // Audit event
          await tx.auditEvent.create({
            data: {
              actorType: 'AGENT',
              deviceId,
              jobId: job.id,
              eventType: 'SCAN_COMPLETED',
              targetType: 'ScanJob',
              targetId: job.scanJob!.id,
              safeMetadata: {
                scannedCount: applications.length,
                matchedCount,
              },
            },
          });
        },
        {
          timeout: 60000,
          maxWait: 15000,
        }
      );
    } catch (error: any) {
      // In case of an unhandled transaction failure, guarantee the job does not stay trapped in RUNNING status
      await prisma.job.update({
        where: { id: job.id },
        data: {
          status: JobStatus.FAILED,
          completedAt: new Date(),
          leaseExpiresAt: null,
          errorSummary: error?.message ? `Scan failed during persistence: ${error.message}` : 'Failed to persist scan results',
        },
      });
      throw error;
    }

    return {
      status: 'received',
      scannedCount: applications.length,
      foundCount: applications.length,
    };
  }

  async submitJobResult(deviceId: string, jobId: string, input: AgentJobResultInput) {
    const job = await prisma.job.findFirst({
      where: {
        id: jobId,
        deviceId,
        kind: JobKind.UPDATE,
      },
      include: {
        updateJob: {
          include: {
            updateCandidate: {
              include: {
                application: true,
              },
            },
          },
        },
      },
    });

    if (!job || !job.updateJob) {
      throw new NotFoundError(
        'Update job not found or does not belong to this device.',
        'UPDATE_JOB_NOT_FOUND'
      );
    }

    const isVerifiedSuccess =
      input.exitCode === 0 &&
      input.verificationResult === VerificationResult.VERIFIED_SUCCESS;

    let finalStatus: JobStatus;
    if (input.verificationResult === VerificationResult.VERIFICATION_FAILED) {
      finalStatus = JobStatus.VERIFICATION_FAILED;
    } else if (input.exitCode !== 0) {
      finalStatus = JobStatus.FAILED;
    } else {
      finalStatus = JobStatus.SUCCEEDED;
    }

    await prisma.$transaction(async (tx) => {
      // 1. Update UpdateJob details
      await tx.updateJob.update({
        where: { id: job.updateJob!.id },
        data: {
          exitCode: input.exitCode,
          restartRequired: input.restartRequired,
          verifiedInstalledVersion: input.rescannedVersion || null,
          verificationResult: input.verificationResult,
          safeDiagnostics: input.safeDiagnostics || null,
        },
      });

      // 2. Update parent Job
      await tx.job.update({
        where: { id: job.id },
        data: {
          status: finalStatus,
          completedAt: new Date(),
          leaseExpiresAt: null,
          errorSummary:
            finalStatus === JobStatus.FAILED
              ? `Update failed with exit code ${input.exitCode}`
              : finalStatus === JobStatus.VERIFICATION_FAILED
              ? 'Post-update version verification failed.'
              : null,
        },
      });

      // 3. If verified success, update Application.installedVersion and remove the candidate
      if (isVerifiedSuccess && job.updateJob!.updateCandidate) {
        const newVersion = input.rescannedVersion || job.updateJob!.targetVersion;
        await tx.application.update({
          where: { id: job.updateJob!.updateCandidate.applicationId },
          data: {
            installedVersion: newVersion,
            lastSeenAt: new Date(),
          },
        });

        // Delete candidate since target version is now installed
        await tx.updateCandidate.delete({
          where: { id: job.updateJob!.updateCandidate.id },
        });
      }

      // 4. Audit Event
      await tx.auditEvent.create({
        data: {
          actorType: 'AGENT',
          deviceId,
          jobId: job.id,
          eventType: 'UPDATE_COMPLETED',
          targetType: 'UpdateJob',
          targetId: job.updateJob!.id,
          safeMetadata: {
            status: finalStatus,
            exitCode: input.exitCode,
            verificationResult: input.verificationResult,
            restartRequired: input.restartRequired,
          },
        },
      });
    });

    return {
      status: 'received',
      jobId: job.id,
      jobStatus: finalStatus,
    };
  }

  async renewJobLease(deviceId: string, jobId: string) {
    const now = new Date();
    const leaseExpiresAt = new Date(now.getTime() + config.JOB_LEASE_EXPIRY_MINUTES * 60 * 1000);

    const job = await prisma.job.findFirst({
      where: {
        id: jobId,
        deviceId,
        status: { in: [JobStatus.RUNNING, JobStatus.VERIFYING] },
      },
    });

    if (!job) {
      throw new NotFoundError(
        'Running job not found or does not belong to this device.',
        'RUNNING_JOB_NOT_FOUND'
      );
    }

    await prisma.job.update({
      where: { id: jobId },
      data: { leaseExpiresAt },
    });

    return {
      status: 'lease_renewed',
      leaseExpiresAt: leaseExpiresAt.toISOString(),
    };
  }
}

export const agentService = new AgentService();
