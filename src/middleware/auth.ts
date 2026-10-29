import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/prisma.js';
import { sha256 } from '../utils/crypto.js';
import { UnauthorizedError } from '../utils/errors.js';
import { config } from '../config/index.js';

export interface AuthenticatedUser {
  id: string;
  email: string;
  createdAt: Date;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      sessionId?: string;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    let token = req.cookies?.[config.SESSION_COOKIE_NAME];

    // Fallback: check Authorization: Bearer <session-token>
    if (!token && req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.substring(7);
    }

    if (!token || typeof token !== 'string') {
      throw new UnauthorizedError('Authentication session is required.', 'SESSION_REQUIRED');
    }

    const tokenHash = sha256(token);
    const session = await prisma.userSession.findUnique({
      where: { sessionIdHash: tokenHash },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            createdAt: true,
          },
        },
      },
    });

    if (!session) {
      throw new UnauthorizedError('Session not found or invalid.', 'INVALID_SESSION');
    }

    if (session.revokedAt !== null) {
      throw new UnauthorizedError('Session has been revoked.', 'REVOKED_SESSION');
    }

    if (session.expiresAt <= new Date()) {
      throw new UnauthorizedError('Session has expired. Please log in again.', 'EXPIRED_SESSION');
    }

    req.user = session.user;
    req.sessionId = session.id;
    next();
  } catch (error) {
    next(error);
  }
}
