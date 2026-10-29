import { Request, Response, NextFunction } from 'express';
import { config } from '../config/index.js';
import { ForbiddenError } from '../utils/errors.js';

export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  if (!config.CSRF_ENABLED || ['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  // Agent API endpoints do not use cookie auth; they use Bearer token
  if (req.path.startsWith('/agent/v1')) {
    return next();
  }

  // Validate Origin or Referer header against allowed origins
  const origin = req.headers.origin || (req.headers.referer ? new URL(req.headers.referer).origin : null);

  if (origin && !config.allowedOriginsList.includes(origin)) {
    throw new ForbiddenError(
      `Cross-origin request blocked: '${origin}' is not in allowed origins.`,
      'CSRF_ORIGIN_FORBIDDEN'
    );
  }

  next();
}
