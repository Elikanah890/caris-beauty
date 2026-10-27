/**
 * Money is always whole TZS stored as BIGINT.
 * Rounding happens only at the line level using round-half-up, never on
 * intermediate values.
 */

export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) throw new Error('Invalid money value');
  return Math.sign(value) * Math.round(Math.abs(value));
}

/** Quantity in a chosen unit to integer base units. */
export function toQtyBase(qty: number, factor: number): number {
  if (!Number.isFinite(qty) || !Number.isFinite(factor) || factor <= 0) {
    throw new Error('Invalid quantity or unit factor');
  }
  return Math.sign(qty) * Math.round(Math.abs(qty) * factor);
}

/**
 * Line total = round(qty × unit price). Never round the unit price first.
 */
export function lineTotal(qty: number, pricePerUnit: number): number {
  return roundMoney(qty * pricePerUnit);
}

/** Cost of a line = qty_base × cost_per_base (both integers). */
export function lineCost(qtyBase: number, costPerBase: number): number {
  return qtyBase * costPerBase;
}

/** Profit snapshot = line total − line cost. Discount is applied at sale level. */
export function lineProfit(total: number, cost: number): number {
  return total - cost;
}

export function splitDiscount(
  lines: Array<{ lineTotal: number }>,
  discount: number
): number[] {
  const subtotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);
  if (discount <= 0 || subtotal <= 0) return lines.map(() => 0);
  const capped = Math.min(discount, subtotal);
  let remaining = capped;
  return lines.map((line, index) => {
    if (index === lines.length - 1) return remaining;
    const share = Math.floor((capped * line.lineTotal) / subtotal);
    remaining -= share;
    return share;
  });
}

export function formatTZS(amount: number): string {
  return `TZS ${Math.round(amount).toLocaleString('en-US')}`;
}
