import { prisma } from '../../config/prisma.js';
import { hashPassword, verifyPassword, generateSecureToken, sha256 } from '../../utils/crypto.js';
import { ConflictError, UnauthorizedError } from '../../utils/errors.js';
import { config } from '../../config/index.js';
import { RegisterInput, LoginInput } from './schemas.js';

export class AuthService {
  async register(input: RegisterInput) {
    const existing = await prisma.user.findUnique({
      where: { email: input.email },
    });

    if (existing) {
      throw new ConflictError('An account with this email already exists.', 'EMAIL_ALREADY_REGISTERED');
    }

    const passwordHash = await hashPassword(input.password);

    const user = await prisma.user.create({
      data: {
        email: input.email,
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
        auditEvents: {
          create: {
            actorType: 'USER',
            eventType: 'USER_REGISTER',
            targetType: 'User',
            safeMetadata: { email: input.email },
          },
        },
      },
      select: {
        id: true,
        email: true,
        createdAt: true,
      },
    });

    const session = await this.createSession(user.id);
    return { user, sessionToken: session.rawToken };
  }

  async login(input: LoginInput) {
    const user = await prisma.user.findUnique({
      where: { email: input.email },
    });

    if (!user) {
      throw new UnauthorizedError('Invalid email or password.', 'INVALID_CREDENTIALS');
    }

    const isValid = await verifyPassword(input.password, user.passwordHash);
    if (!isValid) {
      throw new UnauthorizedError('Invalid email or password.', 'INVALID_CREDENTIALS');
    }

    const session = await this.createSession(user.id);

    await prisma.auditEvent.create({
      data: {
        actorType: 'USER',
        actorUserId: user.id,
        eventType: 'USER_LOGIN',
        targetType: 'User',
        targetId: user.id,
        safeMetadata: { email: user.email },
      },
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        createdAt: user.createdAt,
      },
      sessionToken: session.rawToken,
    };
  }

  async logout(sessionId: string, userId?: string) {
    await prisma.userSession.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });

    if (userId) {
      await prisma.auditEvent.create({
        data: {
          actorType: 'USER',
          actorUserId: userId,
          eventType: 'USER_LOGOUT',
          targetType: 'UserSession',
          targetId: sessionId,
        },
      });
    }
  }

  private async createSession(userId: string) {
    const rawToken = generateSecureToken(32);
    const sessionIdHash = sha256(rawToken);
    const expiresAt = new Date(Date.now() + config.SESSION_MAX_AGE_MS);

    await prisma.userSession.create({
      data: {
        userId,
        sessionIdHash,
        expiresAt,
      },
    });

    return { rawToken, expiresAt };
  }
}

export const authService = new AuthService();
