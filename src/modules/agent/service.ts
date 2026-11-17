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

function normalizeAppName(name: string): string {
  if (!name) return '';
  return name
    .trim()
    .replace(/\s*\((?:64-bit(?:\s*x64)?|32-bit|x64|x86|arm64|user)\)\s*$/i, '')
    .trim()
    .toLowerCase();
}

function getAppQualityScore(app: { packageId?: string | null; source?: string | null; installedVersion?: string; availableVersion?: string | null }): number {
  let score = 0;
  if (app.source === 'winget') score += 100;
  if (app.packageId && !/^(MSIX|ARP)\\/.test(app.packageId)) score += 50;
  if (app.availableVersion?.trim()) score += 30;
  if (app.installedVersion && app.installedVersion !== 'unknown' && app.installedVersion !== '1.0.0.0') score += 20;
  return score;
}

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

    // ── Server-side dedup of incoming payload (before try block so count is in scope)
    // Pass 1: Deduplicate by exact package ID
    const pkgDedup = new Map<string, typeof applications[0]>();
    const noPkgApps: typeof applications[0][] = [];
    for (const item of applications) {
      if (item.packageId?.trim()) {
        const pKey = item.packageId.trim().toLowerCase();
        const existing = pkgDedup.get(pKey);
        if (!existing || getAppQualityScore(item) > getAppQualityScore(existing)) {
          pkgDedup.set(pKey, item);
        }
      } else {
        noPkgApps.push(item);
      }
    }

    // Pass 2: Merge MSIX/ARP/Registry stubs into verified WinGet packages with same normalized name
    const normMap = new Map<string, typeof applications[0]>();
    for (const item of [...pkgDedup.values(), ...noPkgApps]) {
      const normKey = normalizeAppName(item.displayName);
      const existing = normMap.get(normKey);
      if (!existing) {
        normMap.set(normKey, item);
      } else {
        const existingIsStub = !existing.packageId || /^(MSIX|ARP)\\/i.test(existing.packageId);
        const incomingIsStub = !item.packageId || /^(MSIX|ARP)\\/i.test(item.packageId);
        if (existingIsStub && !incomingIsStub) {
          normMap.set(normKey, item);
        } else if (!existingIsStub && incomingIsStub) {
          // Keep existing genuine package
        } else if (getAppQualityScore(item) > getAppQualityScore(existing)) {
          normMap.set(normKey, item);
        }
      }
    }
    const dedupedApplications = Array.from(normMap.values());
    const finalCount = dedupedApplications.length;

    try {
      let matchedCount = 0;

      // ── Step 2: Bulk pre-fetch existing Application records for this device ─
      // Build lookup maps:
      //   pkgIdentityIdToApp — keyed by packageIdentityId (most reliable)
      //   nameToApp          — keyed by raw displayName AND normalized displayName
      const existingApps = await prisma.application.findMany({
        where: { deviceId },
        include: { packageIdentity: { select: { packageId: true } } },
        orderBy: { updatedAt: 'desc' }, // most recently updated first
      });

      // Elect canonical record per normalized display name; collect zombie ids
      const nameToApp = new Map<string, typeof existingApps[0]>();
      const zombieIds: string[] = [];
      for (const app of existingApps) {
        const exactKey = app.displayName.trim().toLowerCase();
        const normKey = normalizeAppName(app.displayName);

        if (!nameToApp.has(normKey)) {
          nameToApp.set(normKey, app);
          nameToApp.set(exactKey, app);
        } else {
          // If existing is an MSIX stub and current is genuine, replace canonical
          const existing = nameToApp.get(normKey)!;
          const existingIsStub = !existing.packageIdentity?.packageId || /^(MSIX|ARP)\\/i.test(existing.packageIdentity.packageId);
          const currentIsStub = !app.packageIdentity?.packageId || /^(MSIX|ARP)\\/i.test(app.packageIdentity.packageId);

          if (existingIsStub && !currentIsStub) {
            zombieIds.push(existing.id);
            nameToApp.set(normKey, app);
            nameToApp.set(exactKey, app);
          } else {
            zombieIds.push(app.id);
          }
        }
      }

      // Also key by packageIdentityId for fast lookup when packageId available
      const pkgIdentityIdToApp = new Map<string, typeof existingApps[0]>();
      for (const app of existingApps) {
        if (app.packageIdentityId && !pkgIdentityIdToApp.has(app.packageIdentityId)) {
          pkgIdentityIdToApp.set(app.packageIdentityId, app);
        }
      }

      // ── Step 3: Safe cleanup of zombie duplicate rows ───────────────────────
      // We must reassign related rows before deleting zombies to avoid FK errors.
      if (zombieIds.length > 0) {
        for (const zombieId of zombieIds) {
          const zombieApp = existingApps.find((a) => a.id === zombieId)!;
          const nk = zombieApp.displayName.trim().toLowerCase();
          const canonicalApp = nameToApp.get(nk)!;

          // Move snapshots and updateCandidates to the canonical record
          await prisma.applicationSnapshot.updateMany({
            where: { applicationId: zombieId },
            data: { applicationId: canonicalApp.id },
          });
          await prisma.updateCandidate.updateMany({
            where: { applicationId: zombieId },
            data: { applicationId: canonicalApp.id },
          });
          // Now safe to delete
          await prisma.application.delete({ where: { id: zombieId } });
        }
        console.log(`[SCAN_DEDUP] Cleaned up ${zombieIds.length} duplicate application record(s) for device ${deviceId}`);
      }

      // ── Step 4: Bulk pre-fetch / upsert PackageIdentity records ────────────
      const rawPackageIds = Array.from(
        new Set(
          dedupedApplications
            .map((a) => a.packageId?.trim())
            .filter((id): id is string => Boolean(id))
        )
      );

      const existingPkgIdentities = rawPackageIds.length > 0
        ? await prisma.packageIdentity.findMany({
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

      const snapshots: Array<{
        scanJobId: string;
        applicationId: string;
        displayName: string;
        publisher: string | null;
        installedVersion: string;
        matchStatus: MatchStatus;
        source: string | null;
      }> = [];

      // ── Step 5: Process each deduplicated application ───────────────────────
      for (const item of dedupedApplications) {
        let packageIdentity = null;
        let matchStatus: MatchStatus = MatchStatus.UNKNOWN;

        if (item.packageId) {
          const lowerPkgId = item.packageId.toLowerCase().trim();
          packageIdentity = pkgMap.get(lowerPkgId) || null;

          if (!packageIdentity && (item.source === 'winget' || !item.source)) {
            // Use upsert to avoid race-condition duplicate PackageIdentity rows
            packageIdentity = await prisma.packageIdentity.upsert({
              where: { packageId_source: { packageId: item.packageId.trim(), source: item.source || 'winget' } },
              create: {
                packageId: item.packageId.trim(),
                source: item.source || 'winget',
                publisher: item.publisher || null,
              },
              update: {
                publisher: item.publisher || undefined,
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

        // Find canonical app record: prefer packageIdentityId match, then exact name, then normalized name
        const nameKey = item.displayName.trim().toLowerCase();
        const normKey = normalizeAppName(item.displayName);
        let existingApp = (packageIdentity && pkgIdentityIdToApp.get(packageIdentity.id)) ||
                          nameToApp.get(nameKey) ||
                          nameToApp.get(normKey) ||
                          null;

        let appRecord;
        if (existingApp) {
          appRecord = await prisma.application.update({
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
          // Keep maps in sync so subsequent items in this scan find the right record
          nameToApp.set(nameKey, appRecord as any);
          nameToApp.set(normKey, appRecord as any);
          if (packageIdentity) pkgIdentityIdToApp.set(packageIdentity.id, appRecord as any);
        } else {
          appRecord = await prisma.application.create({
            data: {
              deviceId,
              displayName: item.displayName.trim(),
              publisher: item.publisher,
              installedVersion: item.installedVersion,
              source: item.source || 'unknown',
              packageIdentityId: packageIdentity?.id,
              matchStatus,
            },
          });
          nameToApp.set(nameKey, appRecord as any);
          nameToApp.set(normKey, appRecord as any);
          if (packageIdentity) pkgIdentityIdToApp.set(packageIdentity.id, appRecord as any);
        }

        // Collect ApplicationSnapshot for batch insertion
        snapshots.push({
          scanJobId: job.scanJob!.id,
          applicationId: appRecord.id,
          displayName: appRecord.displayName,
          publisher: appRecord.publisher,
          installedVersion: appRecord.installedVersion,
          matchStatus: appRecord.matchStatus,
          source: appRecord.source,
        });

        // If package matched, check if a newer release exists or was reported to generate UpdateCandidate
        if (packageIdentity) {
          if (item.availableVersion && item.availableVersion !== appRecord.installedVersion) {
            let release = await prisma.releaseMetadata.findFirst({
              where: {
                packageIdentityId: packageIdentity.id,
                version: item.availableVersion,
              },
            });

            if (!release) {
              release = await prisma.releaseMetadata.create({
                data: {
                  packageIdentityId: packageIdentity.id,
                  version: item.availableVersion,
                  source: packageIdentity.source,
                },
              });
            }

            // Clear any stale update candidates with different target versions for this app
            await prisma.updateCandidate.deleteMany({
              where: {
                applicationId: appRecord.id,
                targetVersion: { not: item.availableVersion },
              },
            });

            const existingCandidate = await prisma.updateCandidate.findFirst({
              where: {
                applicationId: appRecord.id,
                packageIdentityId: packageIdentity.id,
                targetVersion: item.availableVersion,
              },
            });

            if (!existingCandidate) {
              await prisma.updateCandidate.create({
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
            await prisma.updateCandidate.deleteMany({
              where: {
                applicationId: appRecord.id,
              },
            });
          }
        }
      }

      // ── Step 6: Batch insert all snapshots ──────────────────────────────────
      if (snapshots.length > 0) {
        for (let i = 0; i < snapshots.length; i += 100) {
          const chunk = snapshots.slice(i, i + 100);
          await prisma.applicationSnapshot.createMany({
            data: chunk,
          });
        }
      }

      // 5. Mark Job as SUCCEEDED
      await prisma.job.update({
        where: { id: job.id },
        data: {
          status: JobStatus.SUCCEEDED,
          completedAt: new Date(),
          leaseExpiresAt: null,
          errorSummary: null,
        },
      });

      // 6. Update scan counts
      await prisma.scanJob.update({
        where: { id: job.scanJob!.id },
        data: {
          scannedCount: dedupedApplications.length,
          foundCount: dedupedApplications.length,
        },
      });

      // 7. Audit event
      await prisma.auditEvent.create({
        data: {
          actorType: 'AGENT',
          deviceId,
          jobId: job.id,
          eventType: 'SCAN_COMPLETED',
          targetType: 'ScanJob',
          targetId: job.scanJob!.id,
          safeMetadata: {
            scannedCount: dedupedApplications.length,
            matchedCount,
          },
        },
      });
    } catch (error: any) {
      // In case of an unhandled failure, guarantee the job does not stay trapped in RUNNING status
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
      scannedCount: finalCount,
      foundCount: finalCount,
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

  async reportJobProgress(deviceId: string, jobId: string, downloadedMB: number, totalMB: number) {
    // Lightweight fire-and-forget update — just validates ownership and writes two columns
    const job = await prisma.job.findFirst({
      where: {
        id: jobId,
        deviceId,
        status: { in: [JobStatus.RUNNING, JobStatus.QUEUED] },
      },
      select: { id: true },
    });

    if (!job) {
      // Not an error we need to surface loudly — job may have just finished
      return { status: 'ignored' };
    }

    await prisma.job.update({
      where: { id: jobId },
      data: { downloadedMB, totalMB },
    });

    return { status: 'progress_recorded' };
  }
}

export const agentService = new AgentService();
