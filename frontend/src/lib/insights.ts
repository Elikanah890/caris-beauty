import type { Insight } from './types';
import { formatTZS, formatQty, eatParts } from './format';
import {
  includedSaleIds,
  inRange,
  periodRange,
  stockFor,
  type DateRange,
  type ReportSnapshot
} from './reports';

function todayRange(now: Date): DateRange {
  return periodRange('today', null, null, now);
}

function liveSales(snapshot: ReportSnapshot, range: DateRange) {
  const ids = includedSaleIds(snapshot.sales, snapshot.payments, range);
  return snapshot.sales.filter((sale) => ids.has(sale.id));
}

export function topSellerToday(
  snapshot: ReportSnapshot,
  now = new Date()
): Insight | null {
  const range = todayRange(now);
  const ids = includedSaleIds(snapshot.sales, snapshot.payments, range);
  const groups = new Map<string, { name: string; qty: number; revenue: number }>();
  for (const item of snapshot.saleItems) {
    if (!ids.has(item.saleId)) continue;
    const key = item.productId ?? item.productName;
    const group = groups.get(key) ?? { name: item.productName, qty: 0, revenue: 0 };
    group.qty += Number(item.qty);
    group.revenue += Number(item.lineTotal);
    groups.set(key, group);
  }
  const best = [...groups.values()].sort((a, b) => b.qty - a.qty)[0];
  if (!best) return null;
  const unitLabel = best.qty === 1 ? 'unit' : 'units';
  return {
    id: 'top-seller-today',
    severity: 'info',
    message: `${best.name} is your top seller today — ${formatQty(best.qty)} ${unitLabel} (${formatTZS(best.revenue)}).`,
    cta: 'View reports'
  };
}

export function bestDayOfWeek(
  snapshot: ReportSnapshot,
  now = new Date()
): Insight | null {
  const end = new Date(now);
  const start = new Date(now.getTime() - 28 * 86_400_000);
  const range = { from: start, to: end };
  const sales = liveSales(snapshot, range);
  if (sales.length < 8) return null;

  const totals = [0, 0, 0, 0, 0, 0, 0];
  const days = [0, 0, 0, 0, 0, 0, 0];
  const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  for (const sale of sales) {
    const weekday = new Date(new Date(sale.soldAt).getTime() + 3 * 3600_000).getUTCDay();
    totals[weekday] = (totals[weekday] ?? 0) + Number(sale.total);
    days[weekday] = (days[weekday] ?? 0) + 1;
  }
  const averages = totals.map((total, index) => (days[index] ? total / (days[index] as number) : 0));
  const bestIndex = averages.reduce(
    (best, value, index) => (value > (averages[best] ?? 0) ? index : best),
    0
  );
  const others = averages.filter((value, index) => index !== bestIndex && value > 0);
  if (others.length === 0) return null;
  const otherAverage = others.reduce((a, b) => a + b, 0) / others.length;
  if (otherAverage <= 0) return null;
  const lift = Math.round(((averages[bestIndex] ?? 0) / otherAverage - 1) * 100);
  if (lift < 8) return null;
  return {
    id: 'best-day',
    severity: 'info',
    message: `${names[bestIndex]}s average ${lift}% higher sales than other days.`,
    cta: 'View reports'
  };
}

export function slowMovers(
  snapshot: ReportSnapshot,
  now = new Date()
): Insight | null {
  const shopStartedAt = snapshot.business?.createdAt
    ? new Date(snapshot.business.createdAt).getTime()
    : NaN;
  const shopAgeDays = Number.isFinite(shopStartedAt)
    ? (now.getTime() - shopStartedAt) / 86_400_000
    : 0;
  const completedSales = snapshot.sales.filter((sale) => sale.status === 'completed').length;
  if (shopAgeDays <= 30 && completedSales <= 10) return null;

  const range = { from: new Date(now.getTime() - 30 * 86_400_000), to: now };
  const ids = includedSaleIds(snapshot.sales, snapshot.payments, range);
  const soldIds = new Set(
    snapshot.saleItems.filter((item) => ids.has(item.saleId)).map((item) => item.productId)
  );
  const stale = snapshot.products.filter(
    (product) => !product.deletedAt && product.isActive && !soldIds.has(product.id)
  );
  if (stale.length === 0) return null;
  const names = stale.slice(0, 3).map((product) => product.name).join(', ');
  return {
    id: 'slow-movers',
    severity: 'warn',
    message: `${stale.length} product${stale.length === 1 ? '' : 's'} ${stale.length === 1 ? "hasn't" : "haven't"} sold in 30 days: ${names}${stale.length > 3 ? '…' : ''}`,
    cta: 'Check stock'
  };
}

export function lowStock(snapshot: ReportSnapshot, now = new Date()): Insight | null {
  const start = new Date(now.getTime() - 7 * 86_400_000);
  const range = { from: start, to: now };
  const ids = includedSaleIds(snapshot.sales, snapshot.payments, range);
  const everIds = includedSaleIds(snapshot.sales, snapshot.payments, {
    from: new Date(0),
    to: now
  });
  const soldEver = new Set(
    snapshot.saleItems
      .filter((item) => item.productId && everIds.has(item.saleId))
      .map((item) => item.productId)
  );
  const sold = new Map<string, number>();
  for (const item of snapshot.saleItems) {
    if (!ids.has(item.saleId) || !item.productId) continue;
    sold.set(item.productId, (sold.get(item.productId) ?? 0) + Number(item.qtyBase));
  }

  let outOfStock = 0;
  let runningLow = 0;
  for (const product of snapshot.products) {
    if (product.deletedAt || !product.isActive) continue;
    const stock = stockFor(snapshot.movements, product.id);
    if (stock <= 0) {
      if (soldEver.has(product.id)) outOfStock += 1;
      continue;
    }
    const dailyRate = (sold.get(product.id) ?? 0) / 7;
    if (dailyRate > 0 && stock / dailyRate <= 3) runningLow += 1;
  }

  if (outOfStock === 0 && runningLow === 0) return null;

  const parts: string[] = [];
  if (outOfStock > 0) {
    parts.push(
      `${outOfStock} product${outOfStock === 1 ? ' is' : 's are'} out of stock`
    );
  }
  if (runningLow > 0) {
    parts.push(
      `${runningLow} product${runningLow === 1 ? '' : 's'} may run out within 3 days at the current rate`
    );
  }

  return {
    id: 'low-stock',
    severity: outOfStock >= 5 || runningLow >= 5 ? 'danger' : 'warn',
    message: `${parts.join(' and ')}. Check what needs reordering.`,
    cta: 'Check stock'
  };
}

export function expiringSoon(snapshot: ReportSnapshot, now = new Date()): Insight | null {
  const limit = new Date(now.getTime() + 7 * 86_400_000);
  const expiring = snapshot.products.filter(
    (product) =>
      !product.deletedAt &&
      product.isActive &&
      product.expiryDate &&
      new Date(`${product.expiryDate}T00:00:00+03:00`) <= limit
  );
  if (expiring.length === 0) return null;
  return {
    id: 'expiring-soon',
    severity: 'danger',
    message: `${expiring.length} product${expiring.length === 1 ? '' : 's'} expire within 7 days: ${expiring.slice(0, 2).map((p) => p.name).join(', ')}.`,
    cta: 'Check stock'
  };
}

export function marginByCategory(
  snapshot: ReportSnapshot,
  now = new Date()
): Insight | null {
  const range = { from: new Date(now.getTime() - 30 * 86_400_000), to: now };
  const ids = includedSaleIds(snapshot.sales, snapshot.payments, range);
  const categories = new Map(snapshot.categories.map((c) => [c.id, c.name]));
  const productCategory = new Map(snapshot.products.map((p) => [p.id, p.categoryId ?? null]));
  const groups = new Map<string, { revenue: number; cogs: number }>();

  for (const item of snapshot.saleItems) {
    if (!ids.has(item.saleId) || !item.productId) continue;
    const categoryId = productCategory.get(item.productId) ?? null;
    const name = (categoryId && categories.get(categoryId)) || 'Others';
    const group = groups.get(name) ?? { revenue: 0, cogs: 0 };
    group.revenue += Number(item.lineTotal);
    group.cogs += Number(item.qtyBase) * Number(item.costPerBase);
    groups.set(name, group);
  }

  const margins = [...groups.entries()]
    .filter(([, group]) => group.revenue > 0)
    .map(([name, group]) => ({
      name,
      margin: Math.round(((group.revenue - group.cogs) / group.revenue) * 100)
    }))
    .sort((a, b) => b.margin - a.margin);
  if (margins.length < 2) return null;
  const best = margins[0];
  const worst = margins[margins.length - 1];
  if (!best || !worst || best.margin - worst.margin < 5) return null;
  return {
    id: 'margin-category',
    severity: 'info',
    message: `${best.name} margin ${best.margin}% vs ${worst.name.toLowerCase()} ${worst.margin}%.`,
    cta: 'View reports'
  };
}

export function tenderShift(snapshot: ReportSnapshot, now = new Date()): Insight | null {
  const range = todayRange(now);
  const ids = includedSaleIds(snapshot.sales, snapshot.payments, range);
  const live = snapshot.payments.filter((p) => ids.has(p.saleId) && !p.isReversed);
  const total = live.reduce((sum, p) => sum + Number(p.amount), 0);
  if (total === 0) return null;

  const mobileTenders = ['mpesa', 'tigopesa', 'airtel'] as const;
  const mobileShare = live
    .filter((p) => mobileTenders.includes(p.tender as (typeof mobileTenders)[number]))
    .reduce((sum, p) => sum + Number(p.amount), 0) / total;
  if (mobileShare < 0.35) return null;

  const byTender = new Map<string, number>();
  for (const payment of live) {
    byTender.set(payment.tender, (byTender.get(payment.tender) ?? 0) + Number(payment.amount));
  }
  const top = [...byTender.entries()].sort((a, b) => b[1] - a[1])[0];
  const label = top?.[0] === 'mpesa' ? 'M-Pesa' : top?.[0] === 'tigopesa' ? 'Tigo Pesa' : top?.[0] === 'airtel' ? 'Airtel Money' : 'Mobile money';
  return {
    id: 'tender-shift',
    severity: 'info',
    message: `${label} is ${Math.round(((top?.[1] ?? 0) / total) * 100)}% of today's sales.`,
    cta: 'Close day'
  };
}

export function dailyComparison(snapshot: ReportSnapshot, now = new Date()): Insight | null {
  const today = todayRange(now);
  const todaySales = liveSales(snapshot, today).reduce((sum, sale) => sum + Number(sale.total), 0);
  const prior = { from: new Date(now.getTime() - 30 * 86_400_000), to: today.from };
  const priorSales = liveSales(snapshot, prior);
  if (priorSales.length < 5) return null;
  const days = new Set(
    priorSales.map((sale) =>
      new Date(new Date(sale.soldAt).getTime() + 3 * 3600_000).toISOString().slice(0, 10)
    )
  ).size;
  const average = priorSales.reduce((sum, sale) => sum + Number(sale.total), 0) / Math.max(1, days);
  if (average === 0) return null;
  const change = Math.round((todaySales / average - 1) * 100);
  if (Math.abs(change) < 10) return null;
  return {
    id: 'daily-comparison',
    severity: change < 0 ? 'warn' : 'info',
    message: `Today is ${Math.abs(change)}% ${change < 0 ? 'below' : 'above'} your average day.`,
    cta: 'View reports'
  };
}

export function debtsOverdue(snapshot: ReportSnapshot, now = new Date()): Insight | null {
  const cutoff = new Date(now.getTime() - 7 * 86_400_000);
  const creditPayments = snapshot.payments.filter(
    (payment) => payment.tender === 'credit' && !payment.isReversed
  );
  const customers = new Set<string>();
  let amount = 0;
  for (const payment of creditPayments) {
    const sale = snapshot.sales.find((s) => s.id === payment.saleId);
    if (!sale || sale.status !== 'completed' || !sale.customerId) continue;
    if (new Date(sale.soldAt) > cutoff) continue;
    customers.add(sale.customerId);
    amount += Number(payment.amount);
  }
  if (customers.size === 0) return null;
  return {
    id: 'debts-overdue',
    severity: amount >= 100_000 ? 'danger' : 'warn',
    message: `${customers.size} customer${customers.size === 1 ? ' owes' : 's owe'} ${formatTZS(amount)} for 7+ days.`,
    cta: 'Customers'
  };
}

const SEVERITY_ORDER = { danger: 0, warn: 1, info: 2 } as const;

export function computeInsights(snapshot: ReportSnapshot, now = new Date()): Insight[] {
  return [
    expiringSoon(snapshot, now),
    lowStock(snapshot, now),
    debtsOverdue(snapshot, now),
    topSellerToday(snapshot, now),
    dailyComparison(snapshot, now),
    slowMovers(snapshot, now),
    bestDayOfWeek(snapshot, now),
    marginByCategory(snapshot, now),
    tenderShift(snapshot, now)
  ]
    .filter((insight): insight is Insight => Boolean(insight))
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}
