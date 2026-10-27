import type { Knex } from 'knex';
import { db } from '../db';
import { camelize } from '../lib/case';
import { dayRange, eatDateString, periodRange, type Period } from '../lib/time';

interface Range {
  from: Date;
  to: Date;
}

function completedSales(query: Knex.QueryBuilder, alias = 's') {
  query
    .where(`${alias}.status`, 'completed')
    .whereRaw(
      `EXISTS (SELECT 1 FROM payments p2 WHERE p2.sale_id = ${alias}.id AND p2.is_reversed = false)`
    );
  return query;
}

export function resolveRange(period: Period, from?: string, to?: string): Range {
  const range = periodRange(period, from, to);
  return { from: range.from, to: range.to };
}

export async function getSummary(range: Range) {
  const salesQuery = db('sales as s');
  completedSales(salesQuery);
  salesQuery.whereBetween('s.sold_at', [range.from, range.to]);
  const salesRow = (await salesQuery
    .select(
      db.raw('COUNT(*)::int as sale_count'),
      db.raw('COALESCE(SUM(s.subtotal), 0)::bigint as subtotal'),
      db.raw('COALESCE(SUM(s.discount), 0)::bigint as discount'),
      db.raw('COALESCE(SUM(s.total), 0)::bigint as sales')
    )
    .first()) as {
    sale_count: number;
    subtotal: number;
    discount: number;
    sales: number;
  };

  const cogsQuery = db('sale_items as si').join('sales as s', 's.id', 'si.sale_id');
  completedSales(cogsQuery);
  cogsQuery.whereBetween('s.sold_at', [range.from, range.to]);
  const cogsRow = (await cogsQuery
    .select(db.raw('COALESCE(SUM(si.qty_base * si.cost_per_base), 0)::bigint as cogs'))
    .first()) as { cogs: number };

  const expenseRow = (await db('expenses')
    .whereNull('deleted_at')
    .whereBetween('spent_at', [range.from, range.to])
    .sum({ expenses: 'amount' })
    .first()) as { expenses: string | null } | undefined;

  const tenderRows = (await db('payments as p')
    .join('sales as s', 's.id', 'p.sale_id')
    .where('p.is_reversed', false)
    .where('s.status', 'completed')
    .whereBetween('s.sold_at', [range.from, range.to])
    .groupBy('p.tender')
    .select('p.tender')
    .sum({ amount: 'p.amount' })) as Array<{ tender: string; amount: string }>;

  const sales = Number(salesRow?.sales ?? 0);
  const cogs = Number(cogsRow?.cogs ?? 0);
  const expenses = Number(expenseRow?.expenses ?? 0);
  const grossProfit = sales - cogs;

  return {
    from: range.from.toISOString(),
    to: range.to.toISOString(),
    sales,
    subtotal: Number(salesRow?.subtotal ?? 0),
    discount: Number(salesRow?.discount ?? 0),
    cogs,
    grossProfit,
    expenses,
    netProfit: grossProfit - expenses,
    saleCount: Number(salesRow?.sale_count ?? 0),
    averageSale: salesRow && salesRow.sale_count > 0 ? Math.round(sales / salesRow.sale_count) : 0,
    tenderBreakdown: Object.fromEntries(
      tenderRows.map((row) => [row.tender, Number(row.amount)])
    ) as Record<string, number>
  };
}

export async function getTopProducts(range: Range, limit: number, by: 'qty' | 'revenue'): Promise<Array<Record<string, unknown>>> {
  const query = db('sale_items as si')
    .join('sales as s', 's.id', 'si.sale_id')
    .where('s.status', 'completed')
    .whereBetween('s.sold_at', [range.from, range.to])
    .groupBy('si.product_id', 'si.product_name')
    .select(
      'si.product_id',
      db.raw('MAX(si.product_name) as product_name'),
      db.raw('COALESCE(SUM(si.qty_base), 0)::bigint as qty_base'),
      db.raw('COALESCE(SUM(si.line_total), 0)::bigint as revenue'),
      db.raw('COALESCE(SUM(si.profit), 0)::bigint as profit'),
      db.raw('COUNT(DISTINCT si.sale_id)::int as sale_count')
    )
    .limit(limit);
  query.orderBy(by === 'qty' ? 'qty_base' : 'revenue', 'desc');
  const rows = (await query) as Record<string, unknown>[];
  return rows.map((r) => camelize<Record<string, unknown>>(r));
}

export async function getSlowMovers(range: Range, threshold: number) {
  const soldSub = db('sale_items as si')
    .join('sales as s', 's.id', 'si.sale_id')
    .where('s.status', 'completed')
    .whereBetween('s.sold_at', [range.from, range.to])
    .groupBy('si.product_id')
    .select('si.product_id')
    .sum({ sold_qty: 'si.qty_base' })
    .as('sold');

  const lastSoldSub = db('sale_items as si')
    .join('sales as s', 's.id', 'si.sale_id')
    .where('s.status', 'completed')
    .groupBy('si.product_id')
    .select('si.product_id')
    .max({ last_sold_at: 's.sold_at' })
    .as('last');

  const stockSub = db('stock_movements')
    .select('product_id')
    .sum({ stock_base: 'qty_base' })
    .groupBy('product_id')
    .as('sm');

  const rows = (await db('products as p')
    .leftJoin(soldSub, 'sold.product_id', 'p.id')
    .leftJoin(lastSoldSub, 'last.product_id', 'p.id')
    .leftJoin(stockSub, 'sm.product_id', 'p.id')
    .whereNull('p.deleted_at')
    .where('p.is_active', true)
    .whereRaw('COALESCE(sold.sold_qty, 0) <= ?', [threshold])
    .select(
      'p.id',
      'p.name',
      db.raw('COALESCE(sold.sold_qty, 0)::bigint as sold_qty'),
      'last.last_sold_at',
      db.raw('COALESCE(sm.stock_base, 0)::bigint as stock_base')
    )
    .orderBy('p.name')
    .limit(100)) as Record<string, unknown>[];
  return rows.map((r) => camelize(r));
}

export async function getStaffPerformance(range: Range) {
  const users = (await db('users')
    .whereNull('deleted_at')
    .select('id', 'name', 'role')
    .orderBy('name')) as Array<{ id: string; name: string; role: string }>;

  const stats = (await db('sales')
    .whereBetween('sold_at', [range.from, range.to])
    .groupBy('user_id')
    .select(
      'user_id',
      db.raw("COUNT(*) FILTER (WHERE status = 'completed')::int as sale_count"),
      db.raw("COALESCE(SUM(total) FILTER (WHERE status = 'completed'), 0)::bigint as revenue"),
      db.raw("COUNT(*) FILTER (WHERE status = 'voided')::int as void_count"),
      db.raw("COALESCE(SUM(discount) FILTER (WHERE status = 'completed'), 0)::bigint as discount")
    )) as Array<{
    user_id: string | null;
    sale_count: number;
    revenue: number;
    void_count: number;
    discount: number;
  }>;
  const byUser = new Map(stats.map((s) => [s.user_id, s]));

  return users
    .map((u) => {
      const s = byUser.get(u.id);
      return {
        id: u.id,
        name: u.name,
        role: u.role,
        saleCount: Number(s?.sale_count ?? 0),
        revenue: Number(s?.revenue ?? 0),
        voidCount: Number(s?.void_count ?? 0),
        discount: Number(s?.discount ?? 0)
      };
    })
    .sort((a, b) => b.revenue - a.revenue);
}

export async function getShrinkage(range: Range) {
  const rows = (await db('stock_movements')
    .where('movement_type', 'adjustment')
    .whereBetween('created_at', [range.from, range.to])
    .groupBy('reason')
    .select(
      'reason',
      db.raw('COUNT(*)::int as count'),
      db.raw('COALESCE(SUM(qty_base), 0)::bigint as qty_base'),
      db.raw('COALESCE(SUM(qty_base * COALESCE(unit_cost, 0)), 0)::bigint as value')
    )) as Array<{ reason: string; count: number; qty_base: number; value: number }>;
  return rows.map((r) => ({
    reason: r.reason,
    count: Number(r.count),
    qtyBase: Number(r.qty_base),
    value: Number(r.value)
  }));
}

export async function getCloseDay(date: string) {
  const range = dayRange(date);
  const summary = await getSummary({ from: range.from, to: range.to });
  const top = await getTopProducts({ from: range.from, to: range.to }, 3, 'revenue');

  const voidRow = (await db('sales')
    .where('status', 'voided')
    .whereBetween('sold_at', [range.from, range.to])
    .count<{ count: string }[]>({ count: '*' })
    .first()) as { count: string } | undefined;

  const credit = summary.tenderBreakdown.credit ?? 0;
  const cash = summary.tenderBreakdown.cash ?? 0;

  return {
    date,
    from: range.from.toISOString(),
    to: range.to.toISOString(),
    sales: summary.sales,
    cogs: summary.cogs,
    grossProfit: summary.grossProfit,
    expenses: summary.expenses,
    netProfit: summary.netProfit,
    saleCount: summary.saleCount,
    averageSale: summary.averageSale,
    tenderBreakdown: summary.tenderBreakdown,
    cashExpected: cash,
    creditGiven: credit,
    voidCount: Number(voidRow?.count ?? 0),
    topProducts: top
  };
}

export async function getInsights(range: Range) {
  const summary = await getSummary(range);
  const insights: Array<{
    id: string;
    severity: 'info' | 'warn' | 'danger';
    message: string;
    cta?: string;
  }> = [];

  if (summary.saleCount === 0) {
    insights.push({
      id: 'no-sales',
      severity: 'warn',
      message: 'No sales recorded for this period yet.',
      cta: 'Open Sell'
    });
    return insights;
  }

  const top = await getTopProducts(range, 1, 'qty');
  if (top[0]) {
    insights.push({
      id: 'top-seller',
      severity: 'info',
      message: `${top[0].productName} is your top seller — ${top[0].qtyBase} units.`,
      cta: 'View reports'
    });
  }

  const tender = summary.tenderBreakdown;
  const mobile = (tender.mpesa ?? 0) + (tender.tigopesa ?? 0) + (tender.airtel ?? 0);
  if (summary.sales > 0 && mobile / summary.sales > 0.35) {
    insights.push({
      id: 'tender-shift',
      severity: 'info',
      message: `Mobile money is ${Math.round((mobile / summary.sales) * 100)}% of sales this period.`
    });
  }

  const slow = await getSlowMovers(range, 0);
  if (slow.length > 0) {
    insights.push({
      id: 'slow-movers',
      severity: 'warn',
      message: `${slow.length} product${slow.length === 1 ? '' : 's'} had no sales this period.`,
      cta: 'Review stock'
    });
  }

  const lowStock = (await db('products as p')
    .leftJoin(
      db('stock_movements').select('product_id').sum({ stock_base: 'qty_base' }).groupBy('product_id').as('sm'),
      'sm.product_id',
      'p.id'
    )
    .whereNull('p.deleted_at')
    .where('p.is_active', true)
    .whereRaw('COALESCE(sm.stock_base, 0) <= p.reorder_level_base')
    .count<{ count: string }[]>({ count: '*' })
    .first()) as { count: string } | undefined;
  const lowCount = Number(lowStock?.count ?? 0);
  if (lowCount > 0) {
    insights.push({
      id: 'low-stock',
      severity: lowCount >= 5 ? 'danger' : 'warn',
      message: `${lowCount} product${lowCount === 1 ? ' is' : 's are'} at or below the reorder level.`,
      cta: 'Stock in'
    });
  }

  const expiring = (await db('products')
    .whereNull('deleted_at')
    .where('is_active', true)
    .whereNotNull('expiry_date')
    .whereRaw("expiry_date <= (CURRENT_DATE + INTERVAL '7 days')")
    .count<{ count: string }[]>({ count: '*' })
    .first()) as { count: string } | undefined;
  const expCount = Number(expiring?.count ?? 0);
  if (expCount > 0) {
    insights.push({
      id: 'expiring',
      severity: 'danger',
      message: `${expCount} product${expCount === 1 ? '' : 's'} expire within 7 days.`,
      cta: 'Review'
    });
  }

  if (summary.netProfit < 0) {
    insights.push({
      id: 'negative-profit',
      severity: 'danger',
      message: 'Expenses are higher than gross profit for this period.',
      cta: 'View expenses'
    });
  }

  return insights;
}

export async function efdCsv(range: Range): Promise<string> {
  const business = (await db('business').first()) as Record<string, unknown> | undefined;
  const rows = (await db('sale_items as si')
    .join('sales as s', 's.id', 'si.sale_id')
    .leftJoin('customers as c', 'c.id', 's.customer_id')
    .where('s.status', 'completed')
    .whereBetween('s.sold_at', [range.from, range.to])
    .select(
      's.receipt_no',
      's.sold_at',
      'si.product_name',
      'si.qty',
      'si.unit_symbol',
      'si.price_per_unit',
      'si.line_total',
      'c.name as customer_name'
    )
    .orderBy('s.sold_at')) as Record<string, unknown>[];

  const escape = (value: unknown) => {
    const str = value === null || value === undefined ? '' : String(value);
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  const tin = (business?.tin as string | undefined) ?? '';
  const header = [
    'RECEIPT_NO',
    'DATE',
    'TIME',
    'TIN',
    'CUSTOMER',
    'ITEM',
    'QTY',
    'UNIT',
    'UNIT_PRICE_TZS',
    'LINE_TOTAL_TZS'
  ].join(',');

  const lines = rows.map((r) => {
    const soldAt = new Date(r.sold_at as string);
    return [
      escape(r.receipt_no),
      eatDateString(soldAt),
      new Date(soldAt.getTime() + 3 * 3600_000).toISOString().slice(11, 19),
      escape(tin),
      escape(r.customer_name ?? 'Walk-in'),
      escape(r.product_name),
      escape(Number(r.qty)),
      escape(r.unit_symbol),
      escape(r.price_per_unit),
      escape(r.line_total)
    ].join(',');
  });

  return [header, ...lines].join('\n');
}
