import { config } from '../config/index.js';

const SENSITIVE_KEYS = new Set([
  'password',
  'password_hash',
  'passwordHash',
  'token',
  'previewToken',
  'deviceToken',
  'session',
  'cookie',
  'authorization',
  'pairingCode',
  'code_hash',
  'credential_hash',
]);

function redact(obj: any): any {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(redact);
  }
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      result[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      result[key] = redact(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

export const logger = {
  info(message: string, context: Record<string, any> = {}) {
    if (config.LOG_LEVEL === 'error' || config.LOG_LEVEL === 'warn') return;
    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'info',
        message,
        ...redact(context),
      })
    );
  },
  warn(message: string, context: Record<string, any> = {}) {
    if (config.LOG_LEVEL === 'error') return;
    console.warn(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'warn',
        message,
        ...redact(context),
      })
    );
  },
  error(message: string, error?: any, context: Record<string, any> = {}) {
    console.error(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'error',
        message,
        error: error instanceof Error ? error.message : error,
        ...redact(context),
      })
    );
  },
  debug(message: string, context: Record<string, any> = {}) {
    if (config.LOG_LEVEL !== 'debug') return;
    console.debug(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'debug',
        message,
        ...redact(context),
      })
    );
  },
};
