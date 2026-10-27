import type {
  Business,
  Category,
  Customer,
  Expense,
  Payment,
  Period,
  Product,
  Purchase,
  Sale,
  SaleItem,
  StockMovement,
  User
} from './types';
import { eatParts, fromEatParts } from './format';

export interface ReportSnapshot {
  business?: Business;
  sales: Sale[];
  saleItems: SaleItem[];
  payments: Payment[];
  expenses: Expense[];
  products: Product[];
  movements: StockMovement[];
  users: User[];
  customers: Customer[];
  categories: Category[];
  purchases?: Purchase[];
}

export interface DateRange {
  from: Date;
  to: Date;
}

export function periodRange(
  period: Period,
  from?: string | null,
  to?: string | null,
  now = new Date()
): DateRange {
  if (period === 'custom') {
    const start = from ? new Date(from) : new Date(0);
    const end = to ? new Date(to) : now;
    return { from: start, to: end };
  }
  const p = eatParts(now);
  const today = fromEatParts(p.year, p.month, p.day);
  const tomorrow = fromEatParts(p.year, p.month, p.day + 1);
  if (period === 'today') return { from: today, to: tomorrow };
  if (period === 'week') {
    const offset = (p.weekday + 6) % 7;
    return { from: fromEatParts(p.year, p.month, p.day - offset), to: tomorrow };
  }
  if (period === 'month') {
    return { from: fromEatParts(p.year, p.month, 1), to: tomorrow };
  }
  return { from: fromEatParts(p.year, 0, 1), to: tomorrow };
}

export function inRange(value: string | Date | null | undefined, range: DateRange): boolean {
  if (!value) return false;
  const time = (typeof value === 'string' ? new Date(value) : value).getTime();
  return time >= range.from.getTime() && time < range.to.getTime();
}

export function includedSaleIds(
  sales: Sale[],
  payments: Payment[],
  range: DateRange
): Set<string> {
  const ids = new Set<string>();
  for (const sale of sales) {
    if (sale.status !== 'completed') continue;
    if (!inRange(sale.soldAt, range)) continue;
    const hasLivePayment = payments.some(
      (payment) => payment.saleId === sale.id && !payment.isReversed
    );
    if (hasLivePayment) ids.add(sale.id);
  }
  return ids;
}

export function summary(snapshot: ReportSnapshot, range: DateRange) {
  const ids = includedSaleIds(snapshot.sales, snapshot.payments, range);
  const sales = snapshot.sales.filter((sale) => ids.has(sale.id));
  const revenue = sales.reduce((sum, sale) => sum + Number(sale.total), 0);
  const subtotal = sales.reduce((sum, sale) => sum + Number(sale.subtotal), 0);
  const discount = sales.reduce((sum, sale) => sum + Number(sale.discount), 0);

  const itemRows = snapshot.saleItems.filter((item) => ids.has(item.saleId));
  const cogs = itemRows.reduce(
    (sum, item) => sum + Number(item.qtyBase) * Number(item.costPerBase),
    0
  );

  const expenseRows = snapshot.expenses.filter(
    (expense) => !expense.deletedAt && inRange(expense.spentAt, range)
  );
  const expenses = expenseRows.reduce((sum, expense) => sum + Number(expense.amount), 0);

  const livePayments = snapshot.payments.filter(
    (payment) => ids.has(payment.saleId) && !payment.isReversed
  );
  const tenderBreakdown: Record<string, number> = {};
  for (const payment of livePayments) {
    tenderBreakdown[payment.tender] =
      (tenderBreakdown[payment.tender] ?? 0) + Number(payment.amount);
  }

  const grossProfit = revenue - cogs;
  return {
    from: range.from.toISOString(),
    to: range.to.toISOString(),
    sales: revenue,
    subtotal,
    discount,
    cogs,
    grossProfit,
    expenses,
    expenseCount: expenseRows.length,
    netProfit: grossProfit - expenses,
    saleCount: sales.length,
    averageSale: sales.length > 0 ? Math.round(revenue / sales.length) : 0,
    tenderBreakdown
  };
}

export function topProducts(
  snapshot: ReportSnapshot,
  range: DateRange,
  limit = 5,
  by: 'qty' | 'revenue' = 'qty'
) {
  const ids = includedSaleIds(snapshot.sales, snapshot.payments, range);
  const groups = new Map<
    string,
    { productId: string; productName: string; qtyBase: number; revenue: number; profit: number }
  >();

  for (const item of snapshot.saleItems) {
    if (!ids.has(item.saleId) || !item.productId) continue;
    const group = groups.get(item.productId) ?? {
      productId: item.productId,
      productName: item.productName,
      qtyBase: 0,
      revenue: 0,
      profit: 0
    };
    group.productName = item.productName;
    group.qtyBase += Number(item.qtyBase);
    group.revenue += Number(item.lineTotal);
    group.profit += Number(item.profit);
    groups.set(item.productId, group);
  }

  return [...groups.values()]
    .sort((a, b) => (by === 'qty' ? b.qtyBase - a.qtyBase : b.revenue - a.revenue))
    .slice(0, limit);
}

export function slowMovers(
  snapshot: ReportSnapshot,
  range: DateRange,
  threshold = 0
) {
  const ids = includedSaleIds(snapshot.sales, snapshot.payments, range);
  const sold = new Map<string, number>();
  for (const item of snapshot.saleItems) {
    if (!ids.has(item.saleId) || !item.productId) continue;
    sold.set(item.productId, (sold.get(item.productId) ?? 0) + Number(item.qtyBase));
  }

  const lastSold = new Map<string, string>();
  for (const sale of snapshot.sales) {
    if (sale.status !== 'completed') continue;
    for (const item of snapshot.saleItems) {
      if (item.saleId !== sale.id || !item.productId) continue;
      const current = lastSold.get(item.productId);
      if (!current || new Date(sale.soldAt) > new Date(current)) {
        lastSold.set(item.productId, sale.soldAt);
      }
    }
  }

  return snapshot.products
    .filter(
      (product) =>
        !product.deletedAt &&
        product.isActive &&
        (sold.get(product.id) ?? 0) <= threshold
    )
    .map((product) => ({
      productId: product.id,
      name: product.name,
      soldQty: sold.get(product.id) ?? 0,
      lastSoldAt: lastSold.get(product.id) ?? null,
      stockBase: stockFor(snapshot.movements, product.id)
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function stockFor(movements: StockMovement[], productId: string): number {
  return movements.reduce(
    (sum, movement) =>
      movement.productId === productId ? sum + Number(movement.qtyBase) : sum,
    0
  );
}

export function staffPerformance(snapshot: ReportSnapshot, range: DateRange) {
  const relevant = snapshot.sales.filter((sale) => inRange(sale.soldAt, range));
  const liveIds = includedSaleIds(snapshot.sales, snapshot.payments, range);

  return snapshot.users
    .filter((user) => !user.deletedAt)
    .map((user) => {
      const own = relevant.filter((sale) => sale.userId === user.id);
      const completed = own.filter((sale) => liveIds.has(sale.id));
      return {
        id: user.id,
        name: user.name,
        role: user.role,
        saleCount: completed.length,
        revenue: completed.reduce((sum, sale) => sum + Number(sale.total), 0),
        voidCount: own.filter((sale) => sale.status === 'voided').length,
        discount: completed.reduce((sum, sale) => sum + Number(sale.discount), 0)
      };
    })
    .sort((a, b) => b.revenue - a.revenue);
}

export function shrinkage(snapshot: ReportSnapshot, range: DateRange) {
  const groups = new Map<string, { reason: string; count: number; qtyBase: number; value: number }>();
  for (const movement of snapshot.movements) {
    if (movement.movementType !== 'adjustment' || !inRange(movement.createdAt, range)) continue;
    const reason = movement.reason ?? 'other';
    const group = groups.get(reason) ?? { reason, count: 0, qtyBase: 0, value: 0 };
    group.count += 1;
    group.qtyBase += Number(movement.qtyBase);
    group.value += Number(movement.qtyBase) * Number(movement.unitCost ?? 0);
    groups.set(reason, group);
  }
  return [...groups.values()];
}

export function closeDay(snapshot: ReportSnapshot, dateKey: string) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const from = fromEatParts(y ?? 1970, (m ?? 1) - 1, d ?? 1);
  const to = fromEatParts(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + 1);
  const range = { from, to };
  const totals = summary(snapshot, range);
  const top = topProducts(snapshot, range, 3, 'revenue');
  const voids = snapshot.sales.filter(
    (sale) => sale.status === 'voided' && inRange(sale.soldAt, range)
  ).length;
  const credit = totals.tenderBreakdown.credit ?? 0;
  return {
    date: dateKey,
    ...totals,
    cashExpected: totals.tenderBreakdown.cash ?? 0,
    creditGiven: credit,
    voidCount: voids,
    topProducts: top
  };
}

export function categoryBreakdown(snapshot: ReportSnapshot, range: DateRange) {
  const ids = includedSaleIds(snapshot.sales, snapshot.payments, range);
  const categories = new Map(snapshot.categories.map((c) => [c.id, c.name]));
  const productCategory = new Map(
    snapshot.products.map((p) => [p.id, p.categoryId ?? null])
  );
  const groups = new Map<string, { name: string; revenue: number; qty: number }>();

  for (const item of snapshot.saleItems) {
    if (!ids.has(item.saleId) || !item.productId) continue;
    const categoryId = productCategory.get(item.productId) ?? null;
    const name = (categoryId && categories.get(categoryId)) || 'Others';
    const group = groups.get(name) ?? { name, revenue: 0, qty: 0 };
    group.revenue += Number(item.lineTotal);
    group.qty += Number(item.qtyBase);
    groups.set(name, group);
  }

  return [...groups.values()].sort((a, b) => b.revenue - a.revenue);
}

export function trendSeries(snapshot: ReportSnapshot, period: Period, now = new Date()) {
  const range = periodRange(period, null, null, now);
  const ids = includedSaleIds(snapshot.sales, snapshot.payments, range);
  const sales = snapshot.sales.filter((sale) => ids.has(sale.id));

  if (period === 'today') {
    const buckets = Array.from({ length: 8 }, (_, index) => ({
      label: `${String(index * 3).padStart(2, '0')}:00`,
      revenue: 0,
      orders: 0
    }));
    for (const sale of sales) {
      const shifted = new Date(new Date(sale.soldAt).getTime() + 3 * 3600_000);
      const hour = shifted.getUTCHours();
      const index = Math.min(7, Math.floor(hour / 3));
      const bucket = buckets[index];
      if (bucket) {
        bucket.revenue += Number(sale.total);
        bucket.orders += 1;
      }
    }
    return buckets;
  }

  const days = period === 'week' ? 7 : period === 'month' ? 30 : 12;
  const buckets: Array<{ label: string; revenue: number; orders: number }> = [];
  const nowParts = eatParts(now);

  if (period === 'year') {
    for (let i = 0; i < 12; i += 1) {
      buckets.push({ label: String(i + 1).padStart(2, '0'), revenue: 0, orders: 0 });
    }
    for (const sale of sales) {
      const month = new Date(new Date(sale.soldAt).getTime() + 3 * 3600_000).getUTCMonth();
      const bucket = buckets[month];
      if (bucket) {
        bucket.revenue += Number(sale.total);
        bucket.orders += 1;
      }
    }
    return buckets;
  }

  for (let i = days - 1; i >= 0; i -= 1) {
    const date = fromEatParts(nowParts.year, nowParts.month, nowParts.day - i);
    const key = new Date(date.getTime() + 3 * 3600_000).toISOString().slice(0, 10);
    buckets.push({ label: key, revenue: 0, orders: 0 });
  }
  const byKey = new Map(buckets.map((bucket) => [bucket.label, bucket]));
  for (const sale of sales) {
    const key = new Date(new Date(sale.soldAt).getTime() + 3 * 3600_000)
      .toISOString()
      .slice(0, 10);
    const bucket = byKey.get(key);
    if (bucket) {
      bucket.revenue += Number(sale.total);
      bucket.orders += 1;
    }
  }
  return buckets;
}
