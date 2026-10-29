import { PrismaClient, DeviceStatus, JobKind, JobStatus, MatchStatus, VerificationResult } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding UpdatePilot database...');

  // Clean existing seed data
  await prisma.auditEvent.deleteMany();
  await prisma.securityFinding.deleteMany();
  await prisma.idempotencyRecord.deleteMany();
  await prisma.updateJob.deleteMany();
  await prisma.updatePreview.deleteMany();
  await prisma.updateCandidate.deleteMany();
  await prisma.applicationSnapshot.deleteMany();
  await prisma.application.deleteMany();
  await prisma.releaseMetadata.deleteMany();
  await prisma.packageIdentity.deleteMany();
  await prisma.scanJob.deleteMany();
  await prisma.job.deleteMany();
  await prisma.agentCredential.deleteMany();
  await prisma.devicePairingCode.deleteMany();
  await prisma.device.deleteMany();
  await prisma.userSettings.deleteMany();
  await prisma.userSession.deleteMany();
  await prisma.user.deleteMany();

  // 1. Create Demo User
  const passwordHash = await bcrypt.hash('Admin1234!', 10);
  const user = await prisma.user.create({
    data: {
      email: 'admin@updatepilot.local',
      passwordHash,
      settings: {
        create: {
          theme: 'system',
          scanPreferences: { scanMode: 'full', scheduleIntervalDays: 7 },
          requireUpdateConfirmation: true,
          notificationPreferences: { notifyOnUpdates: true, notifyOnFailures: true },
          dataRetentionDays: 90,
        },
      },
    },
  });

  console.log(`Created demo user: ${user.email} (password: Admin1234!)`);

  // 2. Create Demo Device
  const rawAgentToken = 'up_agent_' + crypto.randomBytes(32).toString('hex');
  const credentialHash = crypto.createHash('sha256').update(rawAgentToken).digest('hex');

  const device = await prisma.device.create({
    data: {
      ownerUserId: user.id,
      deviceName: 'DESKTOP-PILOT-01',
      osInfo: 'Windows 11 Pro 23H2 (Build 22631.4317)',
      agentVersion: '1.0.0',
      status: DeviceStatus.CONNECTED,
      lastSeenAt: new Date(),
      credentials: {
        create: {
          credentialHash,
        },
      },
    },
  });

  console.log(`Created demo device: ${device.deviceName} (id: ${device.id})`);

  // 3. Package Identities
  const gitPackage = await prisma.packageIdentity.create({
    data: {
      packageId: 'Git.Git',
      source: 'winget',
      publisher: 'The Git Project',
      architecture: 'x64',
      matchConfidence: 1.0,
      releases: {
        create: [
          {
            version: '2.44.0',
            channel: 'stable',
            source: 'winget',
            releaseDate: new Date('2024-02-23'),
            fetchedAt: new Date(),
          },
          {
            version: '2.47.1',
            channel: 'stable',
            source: 'winget',
            releaseDate: new Date('2024-11-25'),
            changelogUrl: 'https://github.com/git-for-windows/git/releases/tag/v2.47.1.windows.1',
            releaseNotes: 'Security fixes and routine maintenance updates for Git on Windows.',
            mayRequireAdmin: true,
            fetchedAt: new Date(),
          },
        ],
      },
    },
  });

  const chromePackage = await prisma.packageIdentity.create({
    data: {
      packageId: 'Google.Chrome',
      source: 'winget',
      publisher: 'Google LLC',
      architecture: 'x64',
      matchConfidence: 1.0,
      releases: {
        create: [
          {
            version: '130.0.6723.117',
            channel: 'stable',
            source: 'winget',
            releaseDate: new Date('2024-11-01'),
            fetchedAt: new Date(),
          },
          {
            version: '131.0.6778.86',
            channel: 'stable',
            source: 'winget',
            releaseDate: new Date('2024-11-26'),
            changelogUrl: 'https://chromereleases.googleblog.com/2024/11/stable-channel-update-for-desktop_26.html',
            releaseNotes: 'Contains various fixes from internal audits, fuzzing, and other initiatives.',
            mayRequireAdmin: true,
            fetchedAt: new Date(),
          },
        ],
      },
    },
  });

  const vscodePackage = await prisma.packageIdentity.create({
    data: {
      packageId: 'Microsoft.VisualStudioCode',
      source: 'winget',
      publisher: 'Microsoft Corporation',
      architecture: 'x64',
      matchConfidence: 1.0,
      releases: {
        create: [
          {
            version: '1.95.3',
            channel: 'stable',
            source: 'winget',
            releaseDate: new Date('2024-11-14'),
            changelogUrl: 'https://code.visualstudio.com/updates/v1_95',
            releaseNotes: 'Visual Studio Code 1.95 recovery release.',
            mayRequireAdmin: false,
            fetchedAt: new Date(),
          },
        ],
      },
    },
  });

  // 4. Applications on Device
  const appGit = await prisma.application.create({
    data: {
      deviceId: device.id,
      packageIdentityId: gitPackage.id,
      displayName: 'Git',
      publisher: 'The Git Development Community',
      installedVersion: '2.44.0',
      source: 'winget',
      matchStatus: MatchStatus.MATCHED,
    },
  });

  const appChrome = await prisma.application.create({
    data: {
      deviceId: device.id,
      packageIdentityId: chromePackage.id,
      displayName: 'Google Chrome',
      publisher: 'Google LLC',
      installedVersion: '130.0.6723.117',
      source: 'winget',
      matchStatus: MatchStatus.MATCHED,
    },
  });

  const appVscode = await prisma.application.create({
    data: {
      deviceId: device.id,
      packageIdentityId: vscodePackage.id,
      displayName: 'Visual Studio Code',
      publisher: 'Microsoft Corporation',
      installedVersion: '1.95.3',
      source: 'winget',
      matchStatus: MatchStatus.MATCHED,
    },
  });

  const appUnmatched = await prisma.application.create({
    data: {
      deviceId: device.id,
      displayName: '7-Zip 23.01 (x64 edition)',
      publisher: 'Igor Pavlov',
      installedVersion: '23.01',
      source: 'registry',
      matchStatus: MatchStatus.UNMATCHED,
    },
  });

  const appInternal = await prisma.application.create({
    data: {
      deviceId: device.id,
      displayName: 'Corporate Internal Diagnostic Tool',
      publisher: 'Internal IT Corp',
      installedVersion: '1.2.0',
      source: 'registry',
      matchStatus: MatchStatus.UNKNOWN,
    },
  });

  // 5. Update Candidates
  const gitRelease = await prisma.releaseMetadata.findFirst({
    where: { packageIdentityId: gitPackage.id, version: '2.47.1' },
  });

  if (gitRelease) {
    await prisma.updateCandidate.create({
      data: {
        applicationId: appGit.id,
        packageIdentityId: gitPackage.id,
        releaseMetadataId: gitRelease.id,
        currentVersion: '2.44.0',
        targetVersion: '2.47.1',
        source: 'winget',
      },
    });
  }

  const chromeRelease = await prisma.releaseMetadata.findFirst({
    where: { packageIdentityId: chromePackage.id, version: '131.0.6778.86' },
  });

  if (chromeRelease) {
    await prisma.updateCandidate.create({
      data: {
        applicationId: appChrome.id,
        packageIdentityId: chromePackage.id,
        releaseMetadataId: chromeRelease.id,
        currentVersion: '130.0.6723.117',
        targetVersion: '131.0.6778.86',
        source: 'winget',
      },
    });
  }

  // 6. Security Findings
  await prisma.securityFinding.create({
    data: {
      packageIdentityId: gitPackage.id,
      advisoryId: 'CVE-2024-32002',
      severity: 'CRITICAL',
      affectedVersionRange: '< 2.45.1',
      source: 'GitHub Advisory Database',
      publishedAt: new Date('2024-05-14'),
      lastVerifiedAt: new Date(),
    },
  });

  // 7. Initial Completed Scan Job & Snapshots
  const scanJobParent = await prisma.job.create({
    data: {
      deviceId: device.id,
      requestedByUserId: user.id,
      kind: JobKind.SCAN,
      status: JobStatus.SUCCEEDED,
      startedAt: new Date(Date.now() - 3600000),
      completedAt: new Date(Date.now() - 3500000),
      scanJob: {
        create: {
          scanMode: 'full',
          scannedCount: 5,
          foundCount: 5,
        },
      },
    },
    include: { scanJob: true },
  });

  if (scanJobParent.scanJob) {
    await prisma.applicationSnapshot.createMany({
      data: [
        {
          scanJobId: scanJobParent.scanJob.id,
          applicationId: appGit.id,
          displayName: appGit.displayName,
          publisher: appGit.publisher,
          installedVersion: appGit.installedVersion,
          matchStatus: appGit.matchStatus,
          source: appGit.source,
        },
        {
          scanJobId: scanJobParent.scanJob.id,
          applicationId: appChrome.id,
          displayName: appChrome.displayName,
          publisher: appChrome.publisher,
          installedVersion: appChrome.installedVersion,
          matchStatus: appChrome.matchStatus,
          source: appChrome.source,
        },
        {
          scanJobId: scanJobParent.scanJob.id,
          applicationId: appVscode.id,
          displayName: appVscode.displayName,
          publisher: appVscode.publisher,
          installedVersion: appVscode.installedVersion,
          matchStatus: appVscode.matchStatus,
          source: appVscode.source,
        },
        {
          scanJobId: scanJobParent.scanJob.id,
          applicationId: appUnmatched.id,
          displayName: appUnmatched.displayName,
          publisher: appUnmatched.publisher,
          installedVersion: appUnmatched.installedVersion,
          matchStatus: appUnmatched.matchStatus,
          source: appUnmatched.source,
        },
        {
          scanJobId: scanJobParent.scanJob.id,
          applicationId: appInternal.id,
          displayName: appInternal.displayName,
          publisher: appInternal.publisher,
          installedVersion: appInternal.installedVersion,
          matchStatus: appInternal.matchStatus,
          source: appInternal.source,
        },
      ],
    });
  }

  // 8. Audit Events
  await prisma.auditEvent.createMany({
    data: [
      {
        actorType: 'USER',
        actorUserId: user.id,
        eventType: 'USER_REGISTER',
        targetType: 'User',
        targetId: user.id,
        safeMetadata: { email: user.email },
      },
      {
        actorType: 'USER',
        actorUserId: user.id,
        deviceId: device.id,
        eventType: 'DEVICE_PAIRED',
        targetType: 'Device',
        targetId: device.id,
        safeMetadata: { deviceName: device.deviceName },
      },
      {
        actorType: 'SYSTEM',
        deviceId: device.id,
        jobId: scanJobParent.id,
        eventType: 'SCAN_COMPLETED',
        targetType: 'ScanJob',
        targetId: scanJobParent.id,
        safeMetadata: { scannedCount: 5, status: 'SUCCEEDED' },
      },
    ],
  });

  console.log('Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
