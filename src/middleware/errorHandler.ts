import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { ZodError } from 'zod';

export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  const requestId = req.id || `req_${Date.now()}`;

  // Handle JSON parse errors from express.json()
  if (err instanceof SyntaxError && 'status' in err && (err as any).status === 400 && 'body' in err) {
    logger.warn('Malformed JSON request body', { requestId, path: req.path });
    res.status(400).json({
      error: {
        code: 'MALFORMED_JSON',
        message: 'The request body could not be parsed as valid JSON.',
        requestId,
      },
    });
    return;
  }

  // Handle Zod Validation Errors
  if (err instanceof ZodError) {
    logger.warn('Schema validation error', { requestId, path: req.path, issues: err.issues });
    res.status(422).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed for request parameters or body.',
        details: { issues: err.errors.map((e) => ({ path: e.path.join('.'), message: e.message })) },
        requestId,
      },
    });
    return;
  }

  // Handle custom AppErrors
  if (err instanceof AppError) {
    logger.warn(`Application error [${err.code}]`, {
      requestId,
      path: req.path,
      statusCode: err.statusCode,
      message: err.message,
    });

    const responseBody: Record<string, any> = {
      error: {
        code: err.code,
        message: err.message,
        requestId,
      },
    };

    if (err.details && Object.keys(err.details).length > 0) {
      responseBody.error.details = err.details;
    }

    res.status(err.statusCode).json(responseBody);
    return;
  }

  // Handle unexpected unhandled errors
  logger.error('Unhandled server error', err, { requestId, path: req.path, method: req.method });

  res.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected internal error occurred.',
      requestId,
    },
  });
}
