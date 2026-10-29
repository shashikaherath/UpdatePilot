import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

declare global {
  namespace Express {
    interface Request {
      id?: string;
    }
  }
}

export function requestCorrelation(req: Request, res: Response, next: NextFunction) {
  const incomingId = req.headers['x-request-id'];
  const requestId = typeof incomingId === 'string' && incomingId.trim().length > 0
    ? incomingId
    : `req_${crypto.randomUUID()}`;

  req.id = requestId;
  res.setHeader('X-Request-Id', requestId);
  next();
}
