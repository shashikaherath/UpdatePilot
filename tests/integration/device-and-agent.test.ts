import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/config/prisma.js';
import { DeviceStatus } from '@prisma/client';

describe('Device Pairing and Agent API Integration', () => {
  const userEmail = `agent_tester_${Date.now()}@example.com`;
  let sessionCookie: string;
  let pairingCode: string;
  let deviceId: string;
  let deviceToken: string;

  beforeAll(async () => {
    const registerRes = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: userEmail, password: 'StrongPassword123!' });

    const cookies = registerRes.headers['set-cookie'];
    sessionCookie = cookies.find((c: string) => c.startsWith('up_session=')).split(';')[0];
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { contains: 'agent_tester_' } },
    });
  });

  it('generates a one-time pairing code for a new device', async () => {
    const res = await request(app)
      .post('/api/v1/devices/pairing-codes')
      .set('Cookie', sessionCookie)
      .send({ deviceName: 'WORKSTATION-QA-01' });

    expect(res.status).toBe(201);
    expect(res.body.pairingCode).toMatch(/^UP-[0-9A-F]{4}-[0-9A-F]{4}$/);
    expect(res.body.expiresAt).toBeDefined();
    pairingCode = res.body.pairingCode;
  });

  it('exchanges pairing code at /agent/v1/pair for permanent device bearer token', async () => {
    const res = await request(app)
      .post('/agent/v1/pair')
      .send({
        pairingCode,
        osInfo: 'Windows 11 Enterprise (23H2)',
        agentVersion: '1.2.0',
      });

    expect(res.status).toBe(201);
    expect(res.body.deviceId).toBeDefined();
    expect(res.body.deviceToken).toBeDefined();
    deviceId = res.body.deviceId;
    deviceToken = res.body.deviceToken;
  });

  it('rejects reusing the already-consumed pairing code', async () => {
    const res = await request(app)
      .post('/agent/v1/pair')
      .send({
        pairingCode,
        osInfo: 'Windows 11 Enterprise',
        agentVersion: '1.2.0',
      });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('PAIRING_CODE_USED');
  });

  it('sends heartbeat from agent with Bearer token and updates liveness', async () => {
    const res = await request(app)
      .post('/agent/v1/heartbeat')
      .set('Authorization', `Bearer ${deviceToken}`)
      .send({ agentVersion: '1.2.1' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');

    const device = await prisma.device.findUnique({ where: { id: deviceId } });
    expect(device?.agentVersion).toBe('1.2.1');
    expect(device?.status).toBe(DeviceStatus.CONNECTED);
  });

  it('revokes device from dashboard API and cancels pending jobs', async () => {
    const res = await request(app)
      .delete(`/api/v1/devices/${deviceId}`)
      .set('Cookie', sessionCookie);

    expect(res.status).toBe(200);

    const device = await prisma.device.findUnique({ where: { id: deviceId } });
    expect(device?.status).toBe(DeviceStatus.REVOKED);
  });

  it('rejects revoked agent bearer token with 401', async () => {
    const res = await request(app)
      .post('/agent/v1/heartbeat')
      .set('Authorization', `Bearer ${deviceToken}`)
      .send({});

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('DEVICE_CREDENTIAL_REVOKED');
  });
});
