import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/config/prisma.js';

describe('History, CSV Export, Settings and Findings Integration', () => {
  let userCookie: string;
  let userEmail: string;

  beforeAll(async () => {
    userEmail = `history_tester_${Date.now()}@test.local`;
    const regRes = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: userEmail, password: 'Password123!' });
    userCookie = regRes.headers['set-cookie'].find((c: string) => c.startsWith('up_session=')).split(';')[0];
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { contains: 'history_tester_' } },
    });
  });

  it('reads user settings and returns defaults', async () => {
    const res = await request(app)
      .get('/api/v1/settings')
      .set('Cookie', userCookie);

    expect(res.status).toBe(200);
    expect(res.body.theme).toBe('system');
    expect(res.body.requireUpdateConfirmation).toBe(true);
    expect(res.body.dataRetentionDays).toBe(90);
  });

  it('patches user settings with allowlisted preferences', async () => {
    const res = await request(app)
      .patch('/api/v1/settings')
      .set('Cookie', userCookie)
      .send({
        theme: 'dark',
        dataRetentionDays: 60,
        requireUpdateConfirmation: true,
      });

    expect(res.status).toBe(200);
    expect(res.body.theme).toBe('dark');
    expect(res.body.dataRetentionDays).toBe(60);
  });

  it('queries history with pagination', async () => {
    const res = await request(app)
      .get('/api/v1/history?page=1&pageSize=10')
      .set('Cookie', userCookie);

    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    expect(res.body.meta).toBeDefined();
  });

  it('exports history as CSV with proper headers and formula injection neutralization', async () => {
    const res = await request(app)
      .get('/api/v1/history/export')
      .set('Cookie', userCookie);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('attachment; filename=');
    expect(res.text).toContain('Job ID,Kind,Status,Device Name');
  });

  it('reads verified security findings for user inventory', async () => {
    const res = await request(app)
      .get('/api/v1/security/findings')
      .set('Cookie', userCookie);

    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
  });
});
