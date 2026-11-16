import { scryptSync, randomBytes, timingSafeEqual, createHash } from 'node:crypto';

export function passwordHash(value: string): string {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(value, salt, 64).toString('hex')}`;
}

export function passwordMatches(value: string, hash: string): boolean {
  const [salt, key] = hash.split(':');
  if (!salt || !key) return false;
  const a = Buffer.from(key, 'hex');
  const b = scryptSync(value, salt, 64);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function generateId(prefix: string): string {
  return prefix + randomBytes(5).toString('hex').toUpperCase();
}
