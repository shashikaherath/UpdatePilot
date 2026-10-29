import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/config/prisma.js';

describe('Scans, Inventory and Multi-tenant Isolation Integration', () => {
  let userACookie: string;
  let userBCookie: string;
  let deviceAId: string;
  let deviceBId: string;
  let agentAToken: string;
  let scanJobId: string;

  beforeAll(async () => {
    // 1. Create User A
    const resA = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: `user_a_${Date.now()}@test.local`, password: 'Password123!' });
    userACookie = resA.headers['set-cookie'].find((c: string) => c.startsWith('up_session=')).split(';')[0];

    // Create Device A
    const pairA = await request(app)
      .post('/api/v1/devices/pairing-codes')
      .set('Cookie', userACookie)
      .send({ deviceName: 'USER-A-LAPTOP' });

    const pairAgentA = await request(app)
      .post('/agent/v1/pair')
      .send({ pairingCode: pairA.body.pairingCode, osInfo: 'Windows 11', agentVersion: '1.0.0' });
    deviceAId = pairAgentA.body.deviceId;
    agentAToken = pairAgentA.body.deviceToken;

    // 2. Create User B
    const resB = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: `user_b_${Date.now()}@test.local`, password: 'Password123!' });
    userBCookie = resB.headers['set-cookie'].find((c: string) => c.startsWith('up_session=')).split(';')[0];

    // Create Device B
    const pairB = await request(app)
      .post('/api/v1/devices/pairing-codes')
      .set('Cookie', userBCookie)
      .send({ deviceName: 'USER-B-DESKTOP' });

    const pairAgentB = await request(app)
      .post('/agent/v1/pair')
      .send({ pairingCode: pairB.body.pairingCode, osInfo: 'Windows 11', agentVersion: '1.0.0' });
    deviceBId = pairAgentB.body.deviceId;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { contains: 'user_' } },
    });
  });

  it('starts a scan on device A and returns 202 Accepted', async () => {
    const res = await request(app)
      .post(`/api/v1/devices/${deviceAId}/scans`)
      .set('Cookie', userACookie)
      .send({ scanMode: 'full' });

    expect(res.status).toBe(202);
    expect(res.body.jobId).toBeDefined();
    expect(res.body.state).toBe('queued');
    scanJobId = res.body.jobId;
  });

  it('rejects duplicate active scan on the same device with 409 Conflict', async () => {
    const res = await request(app)
      .post(`/api/v1/devices/${deviceAId}/scans`)
      .set('Cookie', userACookie)
      .send({ scanMode: 'full' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ACTIVE_SCAN_CONFLICT');
  });

  it('prevents User B from starting a scan on User A device (404 / access denied)', async () => {
    const res = await request(app)
      .post(`/api/v1/devices/${deviceAId}/scans`)
      .set('Cookie', userBCookie)
      .send({ scanMode: 'full' });

    expect(res.status).toBe(404);
  });

  it('allows Agent A to claim the queued scan job', async () => {
    const res = await request(app)
      .post('/agent/v1/jobs/claim')
      .set('Authorization', `Bearer ${agentAToken}`);

    expect(res.status).toBe(200);
    expect(res.body.jobId).toBe(scanJobId);
    expect(res.body.kind).toBe('SCAN');
  });

  it('allows Agent A to submit scan results preserving matched and unmatched software', async () => {
    const res = await request(app)
      .post(`/agent/v1/scans/${scanJobId}/results`)
      .set('Authorization', `Bearer ${agentAToken}`)
      .send({
        applications: [
          {
            displayName: 'Git',
            publisher: 'The Git Project',
            installedVersion: '2.44.0',
            source: 'winget',
            packageId: 'Git.Git',
          },
          {
            displayName: 'VLC Media Player',
            publisher: 'VideoLAN',
            installedVersion: '3.0.20',
            source: 'winget',
            packageId: 'VideoLAN.VLC',
          },
          {
            displayName: 'Proprietary In-House Tool',
            publisher: 'Internal Engineering',
            installedVersion: '1.0.0',
            source: 'registry',
            packageId: null,
          },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('received');
    expect(res.body.scannedCount).toBe(3);
  });

  it('lists inventory with pagination and search, preserving unmatched applications', async () => {
    const res = await request(app)
      .get('/api/v1/applications?pageSize=10')
      .set('Cookie', userACookie);

    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.length).toBeGreaterThanOrEqual(3);

    // Verify unmatched/unknown app is present
    const proprietaryApp = res.body.data.find(
      (a: any) => a.displayName === 'Proprietary In-House Tool'
    );
    expect(proprietaryApp).toBeDefined();
    expect(['UNMATCHED', 'UNKNOWN']).toContain(proprietaryApp.matchStatus);

    // Test search filter
    const searchRes = await request(app)
      .get('/api/v1/applications?q=Git')
      .set('Cookie', userACookie);

    expect(searchRes.status).toBe(200);
    expect(searchRes.body.data.some((a: any) => a.displayName === 'Git')).toBe(true);
  });

  it('enforces multi-tenant isolation: User B cannot see User A applications', async () => {
    const res = await request(app)
      .get('/api/v1/applications')
      .set('Cookie', userBCookie);

    expect(res.status).toBe(200);
    // User B should not see Git from User A's device
    expect(res.body.data.some((a: any) => a.displayName === 'Proprietary In-House Tool')).toBe(false);
  });
});
