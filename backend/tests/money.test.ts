import { describe, expect, it } from 'vitest';
import {
  formatTZS,
  lineCost,
  lineProfit,
  lineTotal,
  roundMoney,
  splitDiscount,
  toQtyBase
} from '../src/lib/money';

describe('money math', () => {
  it('stores whole shillings using round-half-up at line level', () => {
    expect(roundMoney(1249.5)).toBe(1250);
    expect(roundMoney(1249.4)).toBe(1249);
    expect(roundMoney(-1249.5)).toBe(-1250);
  });

  it('never rounds the unit price before multiplying', () => {
    // 2.5 kg × 2,499 TZS = 6,247.5 -> 6,248 (not 2,500 × 2.5)
    expect(lineTotal(2.5, 2499)).toBe(6248);
    expect(lineTotal(0.333, 100)).toBe(33);
  });

  it('computes qty in base units', () => {
    expect(toQtyBase(2, 1000)).toBe(2000);
    expect(toQtyBase(0.5, 1000)).toBe(500);
    expect(toQtyBase(0.001, 1000)).toBe(1);
    expect(toQtyBase(-3, 1)).toBe(-3);
  });

  it('computes line cost and profit from snapshots', () => {
    expect(lineCost(2000, 2)).toBe(4000);
    expect(lineProfit(6248, 4000)).toBe(2248);
  });

  it('allocates a discount across lines without losing a shilling', () => {
    const shares = splitDiscount(
      [{ lineTotal: 3000 }, { lineTotal: 5000 }, { lineTotal: 2000 }],
      1000
    );
    expect(shares.reduce((a, b) => a + b, 0)).toBe(1000);
    expect(shares).toEqual([300, 500, 200]);
  });

  it('formats TZS with no decimals', () => {
    expect(formatTZS(12500)).toBe('TZS 12,500');
  });

  it('rejects non-finite input', () => {
    expect(() => roundMoney(Number.NaN)).toThrow();
    expect(() => toQtyBase(1, 0)).toThrow();
  });
});
