import { describe, it, expect } from 'vitest';
import {
  hashPassword,
  verifyPassword,
  sha256,
  generateSecureToken,
  generatePairingCode,
  sanitizeCsvCell,
} from '../../src/utils/crypto.js';

describe('Security & Crypto Utilities', () => {
  it('hashes passwords securely and verifies them correctly', async () => {
    const rawPassword = 'SecretP@ssword2026!';
    const hash = await hashPassword(rawPassword);

    expect(hash).not.toEqual(rawPassword);
    expect(hash).toMatch(/^\$2[aby]\$\d+\$/);

    const matches = await verifyPassword(rawPassword, hash);
    expect(matches).toBe(true);

    const wrong = await verifyPassword('WrongPassword', hash);
    expect(wrong).toBe(false);
  });

  it('computes sha256 hashes deterministically', () => {
    const data = 'updatepilot-test-token';
    const hash1 = sha256(data);
    const hash2 = sha256(data);

    expect(hash1).toEqual(hash2);
    expect(hash1).toHaveLength(64);
  });

  it('generates high entropy secure tokens and pairing codes', () => {
    const token = generateSecureToken(32);
    expect(token).toHaveLength(64);

    const code = generatePairingCode();
    expect(code).toMatch(/^UP-[0-9A-F]{4}-[0-9A-F]{4}$/);
  });

  it('neutralizes spreadsheet formula injection in CSV cells', () => {
    // Formula characters: =, +, -, @, \t, \r
    expect(sanitizeCsvCell('=SUM(A1:A10)')).toEqual("'=SUM(A1:A10)");
    expect(sanitizeCsvCell('+cmd|/c calc')).toEqual("'+cmd|/c calc");
    expect(sanitizeCsvCell('-10+20')).toEqual("'-10+20");
    expect(sanitizeCsvCell('@cmd')).toEqual("'@cmd");

    // Normal safe strings
    expect(sanitizeCsvCell('Google Chrome 140.0')).toEqual('Google Chrome 140.0');

    // Values with commas or quotes are properly escaped
    expect(sanitizeCsvCell('Hello, World')).toEqual('"Hello, World"');
    expect(sanitizeCsvCell('Say "Hello"')).toEqual('"Say ""Hello"""');
  });
});
