export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: Record<string, any>;

  constructor(statusCode: number, code: string, message: string, details?: Record<string, any>) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Bad Request', code = 'BAD_REQUEST', details?: Record<string, any>) {
    super(400, code, message, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized', code = 'UNAUTHORIZED', details?: Record<string, any>) {
    super(401, code, message, details);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden', code = 'FORBIDDEN', details?: Record<string, any>) {
    super(403, code, message, details);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found', code = 'NOT_FOUND', details?: Record<string, any>) {
    super(404, code, message, details);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource conflict', code = 'CONFLICT', details?: Record<string, any>) {
    super(409, code, message, details);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed', details?: Record<string, any>) {
    super(422, 'VALIDATION_ERROR', message, details);
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message = 'Service unavailable', code = 'SERVICE_UNAVAILABLE', details?: Record<string, any>) {
    super(503, code, message, details);
  }
}
