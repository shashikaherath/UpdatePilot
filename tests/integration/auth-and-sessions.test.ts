import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/config/prisma.js';

describe('Authentication & Sessions API Integration', () => {
  const testEmail = `testuser_${Date.now()}@example.com`;
  const testPassword = 'Password123!';
  let sessionCookie: string;

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { contains: 'testuser_' } },
    });
  });

  it('rejects unauthenticated dashboard requests with 401', async () => {
    const res = await request(app).get('/api/v1/dashboard');
    expect(res.status).toBe(401);
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe('SESSION_REQUIRED');
    expect(res.body.error.requestId).toMatch(/^req_/);
  });

  it('registers a new user and sets session cookie without exposing password hash', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: testEmail, password: testPassword });

    expect(res.status).toBe(201);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.email).toBe(testEmail.toLowerCase());
    expect(res.body.user.password).toBeUndefined();
    expect(res.body.user.passwordHash).toBeUndefined();

    // Verify cookies
    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    const upSession = cookies.find((c: string) => c.startsWith('up_session='));
    expect(upSession).toBeDefined();
    expect(upSession).toContain('HttpOnly');
    expect(upSession).toContain('SameSite=Lax');
    sessionCookie = upSession.split(';')[0];
  });

  it('rejects duplicate email registration with 409 Conflict', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: testEmail, password: testPassword });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_ALREADY_REGISTERED');
  });

  it('allows access to dashboard with valid session cookie', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard')
      .set('Cookie', sessionCookie);

    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.applicationCount).toBeDefined();
  });

  it('logs in an existing user and returns 200 with new session cookie', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: testEmail, password: testPassword });

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(testEmail.toLowerCase());
    expect(res.body.user.password).toBeUndefined();

    const cookies = res.headers['set-cookie'];
    sessionCookie = cookies.find((c: string) => c.startsWith('up_session=')).split(';')[0];
  });

  it('logs out and invalidates the session, returning 204 No Content', async () => {
    const logoutRes = await request(app)
      .post('/api/v1/auth/logout')
      .set('Cookie', sessionCookie);

    expect(logoutRes.status).toBe(204);

    // Using the invalidated session should now be rejected with 401
    const verifyRes = await request(app)
      .get('/api/v1/dashboard')
      .set('Cookie', sessionCookie);

    expect(verifyRes.status).toBe(401);
    expect(verifyRes.body.error.code).toBe('REVOKED_SESSION');
  });
});
