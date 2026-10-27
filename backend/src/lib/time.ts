/**
 * Tanzania is a fixed UTC+3 offset (Africa/Dar_es_Salaam, no DST).
 * Period boundaries are calculated in local shop time then returned as UTC.
 */
export const EAT_OFFSET_MS = 3 * 60 * 60 * 1000;

export type Period = 'today' | 'week' | 'month' | 'year' | 'custom';

function eatParts(date: Date) {
  const shifted = new Date(date.getTime() + EAT_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    weekday: shifted.getUTCDay()
  };
}

function fromEatParts(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day, 0, 0, 0, 0) - EAT_OFFSET_MS);
}

export function periodRange(
  period: Period,
  from?: string | Date | null,
  to?: string | Date | null,
  now = new Date()
): { from: Date; to: Date } {
  if (period === 'custom') {
    const start = from ? new Date(from) : new Date(0);
    const end = to ? new Date(to) : now;
    return { from: start, to: end };
  }

  const p = eatParts(now);
  const todayStart = fromEatParts(p.year, p.month, p.day);
  const tomorrow = fromEatParts(p.year, p.month, p.day + 1);

  if (period === 'today') return { from: todayStart, to: tomorrow };
  if (period === 'week') {
    const mondayOffset = (p.weekday + 6) % 7;
    const monday = fromEatParts(p.year, p.month, p.day - mondayOffset);
    return { from: monday, to: tomorrow };
  }
  if (period === 'month') {
    return { from: fromEatParts(p.year, p.month, 1), to: tomorrow };
  }
  return { from: fromEatParts(p.year, 0, 1), to: tomorrow };
}

export function dayRange(date: string): { from: Date; to: Date } {
  const [y, m, d] = date.split('-').map(Number);
  if (!y || !m || !d) throw new Error('Invalid date, expected YYYY-MM-DD');
  return { from: fromEatParts(y, m - 1, d), to: fromEatParts(y, m - 1, d + 1) };
}

export function eatDateString(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Date(d.getTime() + EAT_OFFSET_MS).toISOString().slice(0, 10);
}
