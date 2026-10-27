import bcrypt from 'bcrypt';
import { randomInt } from 'node:crypto';

export const BCRYPT_COST = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}

const SAFE = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

export function generateTempPassword(): string {
  let out = '';
  for (let i = 0; i < 10; i += 1) out += SAFE[randomInt(SAFE.length)];
  return `Duka-${out}`;
}
