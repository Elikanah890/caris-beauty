import { describe, expect, it } from 'vitest';
import {
  activityFeed,
  customerDebts,
  dashboardOverview,
  moneyReceived,
  profitMargin,
  stockAlerts
} from './dashboard';
import { periodRange } from './reports';
import type { ReportSnapshot } from './reports';
import type {
  Category,
  Customer,
  Expense,
  Payment,
  Product,
  Purchase,
  Sale,
  SaleItem,
  StockMovement,
  User
} from './types';

const NOW = new Date('2026-10-27T12:00:00+03:00');

function sale(overrides: Partial<Sale> = {}): Sale {
  return {
    id: 'sale-1',
    receiptNo: 'CAR-000001',
    deviceId: 'device',
    userId: 'owner',
    customerId: null,
    subtotal: 5000,
    discount: 0,
    total: 5000,
    status: 'completed',
    soldAt: '2026-10-27T09:00:00+03:00',
    items: [],
    payments: [],
    ...overrides
  };
}

function item(overrides: Partial<SaleItem> = {}): SaleItem {
  return {
    id: 'item-1',
    saleId: 'sale-1',
    productId: 'product-1',
    productName: 'Perfume',
    unitId: 'piece',
    unitSymbol: 'pc',
    qty: 2,
    qtyBase: 2,
    factor: 1,
    pricePerUnit: 2500,
    pricePerBase: 2500,
    costPerBase: 2000,
    lineTotal: 5000,
    profit: 1000,
    ...overrides
  };
}

function payment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: 'payment-1',
    saleId: 'sale-1',
    tender: 'cash',
    amount: 5000,
    isReversed: false,
    createdAt: '2026-10-27T09:00:00+03:00',
    ...overrides
  };
}

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: 'product-1',
    name: 'Perfume',
    baseUnitId: 'piece',
    costPerBase: 2000,
    pricePerBase: 2500,
    reorderLevelBase: 5,
    isActive: true,
    ...overrides
  };
}

function movement(overrides: Partial<StockMovement> = {}): StockMovement {
  return {
    id: 'movement-1',
    productId: 'product-1',
    movementType: 'opening',
    qtyBase: 10,
    createdAt: '2026-10-01T09:00:00+03:00',
    ...overrides
  };
}

function purchase(overrides: Partial<Purchase> = {}): Purchase {
  return {
    id: 'purchase-1',
    supplierId: 'supplier-1',
    supplierName: 'Mbeya Supplies',
    deviceId: 'device',
    reference: 'INV-12',
    totalCost: 40000,
    status: 'received',
    purchasedAt: '2026-10-27T08:00:00+03:00',
    items: [],
    ...overrides
  };
}

function expense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: 'expense-1',
    category: 'Transport',
    description: 'Delivery',
    amount: 3000,
    paidVia: 'cash',
    spentAt: '2026-10-27T10:00:00+03:00',
    ...overrides
  };
}

const customer: Customer = {
  id: 'customer-1',
  name: 'Grace',
  creditLimit: 50000,
  isActive: true
};

const snapshot: ReportSnapshot = {
  sales: [sale({ customerId: 'customer-1' })],
  saleItems: [item()],
  payments: [payment({ tender: 'credit' })],
  expenses: [expense()],
  products: [product({ reorderLevelBase: 20 }), product({ id: 'product-2', name: 'Lipstick' })],
  movements: [
    movement(),
    movement({ id: 'movement-2', productId: 'product-2', qtyBase: 0 })
  ],
  users: [] as User[],
  customers: [customer],
  categories: [] as Category[],
  purchases: [purchase()]
};

describe('dashboard helpers', () => {
  it('counts money received from live non-credit payments', () => {
    const mixed = {
      ...snapshot,
      payments: [
        payment({ id: 'cash-1', tender: 'cash', amount: 2000 }),
        payment({ id: 'credit-1', tender: 'credit', amount: 3000 }),
        payment({ id: 'void-1', tender: 'cash', amount: 9000, isReversed: true })
      ]
    };
    expect(moneyReceived(mixed, periodRange('today', null, null, NOW))).toBe(2000);
  });

  it('does not count never-sold zero-stock products as out of stock', () => {
    expect(stockAlerts(snapshot)).toEqual({ low: 1, out: 0, reorder: 1 });
  });

  it('counts an out-of-stock product that has sold before', () => {
    const soldOut = {
      ...snapshot,
      saleItems: [
        item(),
        item({ id: 'item-2', productId: 'product-2', productName: 'Lipstick' })
      ]
    };
    expect(stockAlerts(soldOut)).toEqual({ low: 1, out: 1, reorder: 2 });
  });

  it('uses cost per base for profit', () => {
    const overview = dashboardOverview(snapshot, 'today', NOW);
    expect(overview.today.sales).toBe(5000);
    expect(overview.today.grossProfit).toBe(1000);
    expect(overview.today.cogs).toBe(4000);
  });

  it('calculates a rounded profit margin and rejects invalid sales totals', () => {
    expect(profitMargin(1000, 5000)).toBe(20);
    expect(profitMargin(1000, 3000)).toBe(33);
    expect(profitMargin(1000, 0)).toBeNull();
    expect(profitMargin(Number.NaN, 5000)).toBeNull();
  });

  it('counts today expenses for the costs card', () => {
    const overview = dashboardOverview(snapshot, 'today', NOW);
    expect(overview.today.expenseCount).toBe(1);
  });

  it('calculates outstanding customer debt and late credit sales', () => {
    const debts = customerDebts(
      {
        ...snapshot,
        sales: [sale({ customerId: 'customer-1', soldAt: '2026-09-01T09:00:00+03:00' })]
      },
      NOW
    );
    expect(debts.total).toBe(5000);
    expect(debts.customers).toBe(1);
    expect(debts.latePayments).toBe(1);
  });

  it('builds one sorted activity feed from sales, purchases, costs and stock changes', () => {
    const items = activityFeed(snapshot);
    expect(items[0]?.kind).toBe('cost');
    expect(items.some((entry) => entry.kind === 'sale' && entry.status === 'Credit')).toBe(true);
    expect(items.some((entry) => entry.kind === 'purchase' && entry.status === 'Received')).toBe(true);
    expect(items.some((entry) => entry.kind === 'stock')).toBe(true);
    expect(items.map((entry) => entry.at)).toEqual(
      [...items].map((entry) => entry.at).sort((a, b) => b.localeCompare(a))
    );
  });

  it('returns empty sales state when the shop has not sold today', () => {
    const overview = dashboardOverview(
      { ...snapshot, sales: [], saleItems: [], payments: [] },
      'today',
      NOW
    );
    expect(overview.salesSummary).toEqual({ paid: 0, credit: 0, cancelled: 0 });
    expect(overview.top).toEqual([]);
  });
});
