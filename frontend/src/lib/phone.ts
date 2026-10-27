export function normalizeWhatsAppPhone(raw?: string | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[^\d]/g, '');
  if (!digits) return null;
  if (digits.startsWith('0') && digits.length >= 10) return `255${digits.slice(1)}`;
  if (digits.startsWith('255')) return digits;
  if (digits.length >= 9) return digits;
  return null;
}

export function isValidTanzanianPhone(raw: string): boolean {
  return /^(?:\+?255|0)\d{9}$/.test(raw.replace(/\s+/g, ''));
}
