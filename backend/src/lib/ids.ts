import { randomUUID } from 'node:crypto';

export const uuid = (): string => randomUUID();

export const isUuid = (value: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export function receiptPrefix(name: string): string {
  const letters = name
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 3);
  return letters.length >= 3 ? letters : `DUK${letters}`.slice(0, 3).padEnd(3, 'A');
}

export function normalizedPhone(input: string): string | null {
  const digits = input.replace(/[^\d+]/g, '');
  if (/^\+255\d{9}$/.test(digits)) return digits;
  if (/^0\d{9}$/.test(digits)) return `+255${digits.slice(1)}`;
  if (/^255\d{9}$/.test(digits)) return `+${digits}`;
  return null;
}
