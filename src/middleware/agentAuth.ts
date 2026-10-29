import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/prisma.js';
import { sha256 } from '../utils/crypto.js';
import { UnauthorizedError } from '../utils/errors.js';
import { DeviceStatus } from '@prisma/client';

export interface AuthenticatedDevice {
  id: string;
  ownerUserId: string;
  deviceName: string;
  status: DeviceStatus;
  agentVersion: string | null;
  osInfo: string | null;
}

declare global {
  namespace Express {
    interface Request {
      device?: AuthenticatedDevice;
    }
  }
}

export async function requireAgentAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('Device bearer token is required in Authorization header.', 'DEVICE_TOKEN_REQUIRED');
    }

    const token = authHeader.substring(7).trim();
    if (!token) {
      throw new UnauthorizedError('Malformed or empty device bearer token.', 'DEVICE_TOKEN_INVALID');
    }

    const tokenHash = sha256(token);
    const credential = await prisma.agentCredential.findUnique({
      where: { credentialHash: tokenHash },
      include: {
        device: {
          select: {
            id: true,
            ownerUserId: true,
            deviceName: true,
            status: true,
            agentVersion: true,
            osInfo: true,
          },
        },
      },
    });

    if (!credential) {
      throw new UnauthorizedError('Invalid device credentials.', 'DEVICE_CREDENTIAL_INVALID');
    }

    if (credential.revokedAt !== null || credential.device.status === DeviceStatus.REVOKED) {
      throw new UnauthorizedError('Device credential has been revoked.', 'DEVICE_CREDENTIAL_REVOKED');
    }

    req.device = credential.device;
    next();
  } catch (error) {
    next(error);
  }
}
