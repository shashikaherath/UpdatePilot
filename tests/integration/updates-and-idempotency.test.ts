import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/config/prisma.js';
import { VerificationResult, JobStatus } from '@prisma/client';

describe('Updates, Preview, Idempotency and Verification Integration', () => {
  let sessionCookie: string;
  let deviceId: string;
  let agentToken: string;
  let candidateId: string;
  let previewToken: string;
  let updateJobId: string;

  beforeAll(async () => {
    // 1. Create User
    const regRes = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: `update_tester_${Date.now()}@pilot.local`, password: 'Password123!' });
    sessionCookie = regRes.headers['set-cookie'].find((c: string) => c.startsWith('up_session=')).split(';')[0];

    // 2. Create and pair device
    const codeRes = await request(app)
      .post('/api/v1/devices/pairing-codes')
      .set('Cookie', sessionCookie)
      .send({ deviceName: 'DEV-RIG-01' });

    const pairRes = await request(app)
      .post('/agent/v1/pair')
      .send({ pairingCode: codeRes.body.pairingCode });
    deviceId = pairRes.body.deviceId;
    agentToken = pairRes.body.deviceToken;

    // 3. Create a PackageIdentity and Release
    const pkg = await prisma.packageIdentity.upsert({
      where: {
        packageId_source: {
          packageId: 'Mozilla.Firefox',
          source: 'winget',
        },
      },
      update: {},
      create: {
        packageId: 'Mozilla.Firefox',
        source: 'winget',
        publisher: 'Mozilla Corporation',
        releases: {
          create: [
            {
              version: '135.0',
              source: 'winget',
              fetchedAt: new Date(),
            },
            {
              version: '136.0',
              source: 'winget',
              changelogUrl: 'https://www.mozilla.org/en-US/firefox/136.0/releasenotes/',
              mayRequireAdmin: true,
              fetchedAt: new Date(),
            },
          ],
        },
      },
      include: { releases: true },
    });

    const release136 = pkg.releases.find((r) => r.version === '136.0')!;

    // 4. Create installed app and candidate
    const appRecord = await prisma.application.create({
      data: {
        deviceId,
        displayName: 'Mozilla Firefox',
        installedVersion: '135.0',
        source: 'winget',
        packageIdentityId: pkg.id,
      },
    });

    const candidate = await prisma.updateCandidate.create({
      data: {
        applicationId: appRecord.id,
        packageIdentityId: pkg.id,
        releaseMetadataId: release136.id,
        currentVersion: '135.0',
        targetVersion: '136.0',
        source: 'winget',
      },
    });
    candidateId = candidate.id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { contains: 'update_tester_' } },
    });
  });

  it('lists available update candidates for user device', async () => {
    const res = await request(app)
      .get('/api/v1/updates')
      .set('Cookie', sessionCookie);

    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    const found = res.body.data.find((c: any) => c.id === candidateId);
    expect(found).toBeDefined();
    expect(found.installedVersion).toBe('135.0');
    expect(found.targetVersion).toBe('136.0');
  });

  it('previews update without modifying machine and returns short-lived token', async () => {
    const res = await request(app)
      .post(`/api/v1/updates/${candidateId}/preview`)
      .set('Cookie', sessionCookie);

    expect(res.status).toBe(200);
    expect(res.body.targetVersion).toBe('136.0');
    expect(res.body.previewToken).toBeDefined();
    expect(res.body.expiresAt).toBeDefined();
    previewToken = res.body.previewToken;

    // Verify no jobs were created by preview
    const jobs = await prisma.job.findMany({ where: { deviceId } });
    expect(jobs.length).toBe(0);
  });

  it('executes update requiring previewToken and Idempotency-Key header', async () => {
    const idempotencyKey = `idem_${Date.now()}`;

    const res = await request(app)
      .post(`/api/v1/updates/${candidateId}/execute`)
      .set('Cookie', sessionCookie)
      .set('Idempotency-Key', idempotencyKey)
      .send({ previewToken });

    expect(res.status).toBe(202);
    expect(res.body.jobId).toBeDefined();
    expect(res.body.state).toBe('queued');
    updateJobId = res.body.jobId;

    // Repeating the EXACT same request with same idempotency key returns the same job
    const repeatRes = await request(app)
      .post(`/api/v1/updates/${candidateId}/execute`)
      .set('Cookie', sessionCookie)
      .set('Idempotency-Key', idempotencyKey)
      .send({ previewToken });

    expect(repeatRes.status).toBe(202);
    expect(repeatRes.body.jobId).toBe(updateJobId);

    // Reusing the same key with DIFFERENT payload returns 409 Conflict
    const conflictRes = await request(app)
      .post(`/api/v1/updates/${candidateId}/execute`)
      .set('Cookie', sessionCookie)
      .set('Idempotency-Key', idempotencyKey)
      .send({ previewToken: 'different_token_123456789' });

    expect(conflictRes.status).toBe(409);
    expect(conflictRes.body.error.code).toBe('IDEMPOTENCY_PAYLOAD_CONFLICT');
  });

  it('allows agent to claim update job and report verification outcome', async () => {
    // 1. Claim
    const claimRes = await request(app)
      .post('/agent/v1/jobs/claim')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(claimRes.status).toBe(200);
    expect(claimRes.body.jobId).toBe(updateJobId);
    expect(claimRes.body.kind).toBe('UPDATE');
    expect(claimRes.body.targetVersion).toBe('136.0');

    // 2. Submit Result with VERIFIED_SUCCESS
    const resultRes = await request(app)
      .post(`/agent/v1/jobs/${updateJobId}/result`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({
        exitCode: 0,
        restartRequired: false,
        rescannedVersion: '136.0',
        verificationResult: VerificationResult.VERIFIED_SUCCESS,
        safeDiagnostics: 'Installation completed cleanly via WinGet.',
      });

    expect(resultRes.status).toBe(200);
    expect(resultRes.body.jobStatus).toBe('SUCCEEDED');

    // Verify application installed version was updated
    const updatedApp = await prisma.application.findFirst({
      where: { deviceId, displayName: 'Mozilla Firefox' },
    });
    expect(updatedApp?.installedVersion).toBe('136.0');
  });

  it('distinguishes execution success from verification failure', async () => {
    // Create another candidate and preview to test verification failure
    const candidate2 = await prisma.updateCandidate.create({
      data: {
        application: {
          create: {
            deviceId,
            displayName: 'VLC Media Player',
            installedVersion: '3.0.18',
            source: 'winget',
          },
        },
        packageIdentity: {
          connectOrCreate: {
            where: { packageId_source: { packageId: 'VideoLAN.VLC', source: 'winget' } },
            create: { packageId: 'VideoLAN.VLC', source: 'winget' },
          },
        },
        currentVersion: '3.0.18',
        targetVersion: '3.0.20',
        source: 'winget',
      },
    });

    const prevRes = await request(app)
      .post(`/api/v1/updates/${candidate2.id}/preview`)
      .set('Cookie', sessionCookie);

    const execRes = await request(app)
      .post(`/api/v1/updates/${candidate2.id}/execute`)
      .set('Cookie', sessionCookie)
      .set('Idempotency-Key', `idem_vlc_${Date.now()}`)
      .send({ previewToken: prevRes.body.previewToken });

    const vlcJobId = execRes.body.jobId;

    // Agent claims job
    await request(app)
      .post('/agent/v1/jobs/claim')
      .set('Authorization', `Bearer ${agentToken}`);

    // Installer returned 0 (success) but post-update verification reported mismatch!
    const resultRes = await request(app)
      .post(`/agent/v1/jobs/${vlcJobId}/result`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({
        exitCode: 0,
        restartRequired: false,
        rescannedVersion: '3.0.18', // version did not actually change!
        verificationResult: VerificationResult.VERIFICATION_FAILED,
        safeDiagnostics: 'Version 3.0.20 expected but 3.0.18 found.',
      });

    expect(resultRes.status).toBe(200);
    expect(resultRes.body.jobStatus).toBe('VERIFICATION_FAILED');

    // Generic job endpoint shows verification failure
    const checkJob = await request(app)
      .get(`/api/v1/jobs/${vlcJobId}`)
      .set('Cookie', sessionCookie);

    expect(checkJob.status).toBe(200);
    expect(checkJob.body.state).toBe('verification_failed');
    expect(checkJob.body.updateDetails.verificationResult).toBe('VERIFICATION_FAILED');
  });
});
