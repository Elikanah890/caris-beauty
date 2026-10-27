import { formatQty } from './format';
import {
  includedSaleIds,
  inRange,
  periodRange,
  stockFor,
  summary,
  topProducts,
  trendSeries,
  type DateRange,
  type ReportSnapshot
} from './reports';
import type { Payment, Period, Sale } from './types';

const DAY_MS = 86_400_000;

export interface StockAlertCounts {
  low: number;
  out: number;
  reorder: number;
}

export interface CustomerDebtSummary {
  total: number;
  customers: number;
  latePayments: number;
}

export type ActivityKind = 'sale' | 'purchase' | 'cost' | 'payment' | 'stock';

export interface ActivityItem {
  id: string;
  kind: ActivityKind;
  title: string;
  detail: string;
  amount: number | null;
  at: string;
  status: string;
  href: string;
}

export interface SalesSummary {
  paid: number;
  credit: number;
  cancelled: number;
}

function saleById(snapshot: ReportSnapshot): Map<string, Sale> {
  return new Map(snapshot.sales.map((sale) => [sale.id, sale]));
}

function paymentTime(payment: Payment, sale: Sale | undefined): string | null {
  return payment.createdAt ?? sale?.soldAt ?? null;
}

export function moneyReceived(snapshot: ReportSnapshot, range: DateRange): number {
  const sales = saleById(snapshot);
  return snapshot.payments
    .filter((payment) => !payment.isReversed && payment.tender !== 'credit')
    .filter((payment) => {
      const at = paymentTime(payment, sales.get(payment.saleId));
      return at ? inRange(at, range) : false;
    })
    .reduce((sum, payment) => sum + Number(payment.amount), 0);
}

export function profitMargin(profit: number, sales: number): number | null {
  if (!Number.isFinite(profit) || !Number.isFinite(sales) || sales <= 0) return null;
  return Math.round((profit / sales) * 100);
}

export function stockAlerts(
  snapshot: ReportSnapshot,
  now = new Date()
): StockAlertCounts {
  const everIds = includedSaleIds(snapshot.sales, snapshot.payments, {
    from: new Date(0),
    to: now
  });
  const soldEver = new Set(
    snapshot.saleItems
      .filter((item) => item.productId && everIds.has(item.saleId))
      .map((item) => item.productId)
  );
  let low = 0;
  let out = 0;
  let reorder = 0;

  for (const product of snapshot.products) {
    if (product.deletedAt || !product.isActive) continue;
    const stock = stockFor(snapshot.movements, product.id);
    if (stock <= 0) {
      if (soldEver.has(product.id)) {
        out += 1;
        reorder += 1;
      }
      continue;
    }
    if (stock <= Number(product.reorderLevelBase)) {
      low += 1;
      reorder += 1;
    }
  }

  return { low, out, reorder };
}

export function customerDebts(
  snapshot: ReportSnapshot,
  now = new Date()
): CustomerDebtSummary {
  const sales = saleById(snapshot);
  const balances = new Map<string, number>();
  const lateSales = new Set<string>();
  const cutoff = now.getTime() - 30 * DAY_MS;

  for (const payment of snapshot.payments) {
    if (payment.isReversed) continue;
    const sale = sales.get(payment.saleId);
    if (!sale || sale.status !== 'completed' || !sale.customerId) continue;

    const current = balances.get(sale.customerId) ?? 0;
    const signed = payment.tender === 'credit' ? Number(payment.amount) : -Number(payment.amount);
    balances.set(sale.customerId, current + signed);

    if (new Date(sale.soldAt).getTime() < cutoff) lateSales.add(sale.id);
  }

  let total = 0;
  let customers = 0;
  for (const balance of balances.values()) {
    if (balance > 0) {
      total += balance;
      customers += 1;
    }
  }

  return { total, customers, latePayments: lateSales.size };
}

export function salesSummary(snapshot: ReportSnapshot, range: DateRange): SalesSummary {
  const ids = includedSaleIds(snapshot.sales, snapshot.payments, range);
  const summary: SalesSummary = { paid: 0, credit: 0, cancelled: 0 };

  for (const sale of snapshot.sales) {
    if (sale.status === 'voided' && inRange(sale.soldAt, range)) {
      summary.cancelled += 1;
      continue;
    }
    if (!ids.has(sale.id)) continue;
    const isCredit = snapshot.payments.some(
      (payment) => payment.saleId === sale.id && payment.tender === 'credit' && !payment.isReversed
    );
    if (isCredit) summary.credit += 1;
    else summary.paid += 1;
  }

  return summary;
}

const TENDER_LABEL: Record<Payment['tender'], string> = {
  cash: 'Cash',
  mpesa: 'M-Pesa',
  tigopesa: 'Tigo Pesa',
  airtel: 'Airtel Money',
  bank: 'Bank',
  credit: 'Credit'
};

const MOVEMENT_LABEL: Record<string, string> = {
  adjustment: 'Adjusted',
  return: 'Returned',
  sale_void: 'Sale cancelled',
  opening: 'Opening stock'
};

export function activityFeed(snapshot: ReportSnapshot, limit = 8): ActivityItem[] {
  const items: ActivityItem[] = [];
  const purchases = snapshot.purchases ?? [];
  const sales = saleById(snapshot);

  for (const sale of snapshot.sales) {
    const isCredit = snapshot.payments.some(
      (payment) => payment.saleId === sale.id && payment.tender === 'credit' && !payment.isReversed
    );
    items.push({
      id: `sale-${sale.id}`,
      kind: 'sale',
      title: sale.receiptNo,
      detail: `${sale.userName ?? 'Staff'} · ${sale.customerName ?? 'Walk-in customer'}`,
      amount: Number(sale.total),
      at: sale.soldAt,
      status: sale.status === 'voided' ? 'Cancelled' : isCredit ? 'Credit' : 'Paid',
      href: '/reports'
    });
  }

  for (const purchase of purchases) {
    items.push({
      id: `purchase-${purchase.id}`,
      kind: 'purchase',
      title: purchase.reference ? `Purchase · ${purchase.reference}` : 'Stock purchase',
      detail: purchase.supplierName ?? 'Supplier',
      amount: Number(purchase.totalCost),
      at: purchase.purchasedAt,
      status: purchase.status === 'voided' ? 'Cancelled' : 'Received',
      href: '/more/purchases'
    });
  }

  for (const expense of snapshot.expenses) {
    if (expense.deletedAt) continue;
    items.push({
      id: `expense-${expense.id}`,
      kind: 'cost',
      title: expense.description,
      detail: expense.category,
      amount: Number(expense.amount),
      at: expense.spentAt,
      status: 'Paid',
      href: '/more/expenses'
    });
  }

  for (const movement of snapshot.movements) {
    if (movement.movementType === 'sale' || movement.movementType === 'purchase') continue;
    items.push({
      id: `stock-${movement.id}`,
      kind: 'stock',
      title: movement.productName ?? 'Stock change',
      detail: `${formatQty(movement.qtyBase)} units${movement.reason ? ` · ${movement.reason.replace('_', ' ')}` : ''}`,
      amount: null,
      at: movement.createdAt,
      status: MOVEMENT_LABEL[movement.movementType] ?? 'Changed',
      href: `/stock/${movement.productId}`
    });
  }

  for (const payment of snapshot.payments) {
    if (payment.isReversed || payment.tender === 'credit') continue;
    const sale = sales.get(payment.saleId);
    if (!sale || !payment.createdAt) continue;
    const paidLater = new Date(payment.createdAt).getTime() > new Date(sale.soldAt).getTime() + DAY_MS;
    if (!paidLater) continue;
    items.push({
      id: `payment-${payment.id}`,
      kind: 'payment',
      title: `Payment · ${sale.receiptNo}`,
      detail: TENDER_LABEL[payment.tender],
      amount: Number(payment.amount),
      at: payment.createdAt,
      status: 'Received',
      href: '/reports'
    });
  }

  return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}

export function dashboardOverview(
  snapshot: ReportSnapshot,
  period: Period,
  now = new Date()
) {
  const todayRange = periodRange('today', null, null, now);
  const yesterdayRange: DateRange = {
    from: new Date(todayRange.from.getTime() - DAY_MS),
    to: todayRange.from
  };

  return {
    today: summary(snapshot, todayRange),
    yesterday: summary(snapshot, yesterdayRange),
    moneyReceived: moneyReceived(snapshot, todayRange),
    moneyReceivedYesterday: moneyReceived(snapshot, yesterdayRange),
    stock: stockAlerts(snapshot, now),
    debts: customerDebts(snapshot, now),
    top: topProducts(snapshot, todayRange, 5, 'qty'),
    trend: trendSeries(snapshot, period, now),
    salesSummary: salesSummary(snapshot, todayRange)
  };
}
