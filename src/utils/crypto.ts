import crypto from 'crypto';
import bcrypt from 'bcryptjs';

/**
 * Hash a plaintext password with bcrypt (10 rounds).
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

/**
 * Verify a password against a bcrypt hash.
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Hash a secret (token, pairing code, session identifier) using SHA-256.
 * We store only hashes in the database to prevent token leakage.
 */
export function sha256(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Generate a cryptographically secure random opaque token (e.g. for sessions and device bearer tokens).
 */
export function generateSecureToken(byteLength = 32): string {
  return crypto.randomBytes(byteLength).toString('hex');
}

/**
 * Generate a human-readable high-entropy pairing code (e.g. "UP-A7F9-82CD").
 */
export function generatePairingCode(): string {
  const segment1 = crypto.randomBytes(2).toString('hex').toUpperCase();
  const segment2 = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `UP-${segment1}-${segment2}`;
}

/**
 * Neutralize potential spreadsheet formula injection in CSV cell values.
 * Cells starting with =, +, -, @, tab, or newline are escaped by prepending a single quote.
 */
export function sanitizeCsvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  let str = String(value);
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  // Escape quotes
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    str = `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}
