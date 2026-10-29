import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // 30 requests per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many authentication attempts. Please try again after 15 minutes.',
        requestId: req.id || `req_${Date.now()}`,
      },
    });
  },
});

export const pairingRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many pairing requests. Please try again after 15 minutes.',
        requestId: req.id || `req_${Date.now()}`,
      },
    });
  },
});
