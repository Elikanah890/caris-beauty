export const EAT_OFFSET_MS = 3 * 60 * 60 * 1000;

export function formatTZS(amount: number | string | null | undefined): string {
  const value = Number(amount ?? 0);
  return `TZS ${Math.round(Number.isFinite(value) ? value : 0).toLocaleString('en-US')}`;
}

export function formatNumber(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  return (Number.isFinite(n) ? n : 0).toLocaleString('en-US', {
    maximumFractionDigits: 3
  });
}

export function formatQty(value: number | string): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';
  return Number.isInteger(n) ? n.toLocaleString('en-US') : n.toLocaleString('en-US', { maximumFractionDigits: 3 });
}

export function formatDate(
  value: string | Date | null | undefined,
  options: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric' }
): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Dar_es_Salaam',
    ...options
  }).format(date);
}

export function formatTime(value: string | Date | null | undefined): string {
  return formatDate(value, { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  return `${formatDate(value)} · ${formatTime(value)}`;
}

export function eatDateKey(value: string | Date = new Date()): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return new Date(date.getTime() + EAT_OFFSET_MS).toISOString().slice(0, 10);
}

export function eatHour(value: string | Date): number {
  const date = typeof value === 'string' ? new Date(value) : value;
  return new Date(date.getTime() + EAT_OFFSET_MS).getUTCHours();
}

export function eatParts(date: Date) {
  const shifted = new Date(date.getTime() + EAT_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    weekday: shifted.getUTCDay()
  };
}

export function fromEatParts(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day, 0, 0, 0, 0) - EAT_OFFSET_MS);
}

export function greeting(now = new Date()): 'morning' | 'afternoon' | 'evening' {
  const hour = new Date(now.getTime() + EAT_OFFSET_MS).getUTCHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

export function relativeTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  return `${days}d ago`;
}

export function normalizePhone(input: string): string | null {
  const digits = input.replace(/[^\d+]/g, '');
  if (/^\+255\d{9}$/.test(digits)) return digits;
  if (/^0\d{9}$/.test(digits)) return `+255${digits.slice(1)}`;
  if (/^255\d{9}$/.test(digits)) return `+${digits}`;
  return null;
}

export function percent(value: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((value / total) * 100);
}

export function monthName(month: number): string {
  return [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec'
  ][month] ?? '';
}

export function dateKeyLabel(key: string): string {
  const date = new Date(`${key}T00:00:00+03:00`);
  return formatDate(date, { day: '2-digit', month: 'short' });
}
