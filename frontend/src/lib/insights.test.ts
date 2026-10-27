import { describe, expect, it } from 'vitest';
import {
  computeInsights,
  debtsOverdue,
  expiringSoon,
  lowStock,
  marginByCategory,
  slowMovers,
  topSellerToday
} from './insights';
import type { ReportSnapshot } from './reports';
import type { Business, Payment, Product, Sale, SaleItem, StockMovement } from './types';

const NOW = new Date('2026-10-24T12:00:00+03:00');

const business: Business = {
  id: 'business-1',
  name: 'Caris Beauty and Cosmetics',
  createdAt: '2026-08-01T09:00:00+03:00'
};

const sale: Sale = {
  id: 'sale-1',
  receiptNo: 'KAR-000001',
  deviceId: 'd',
  userId: 'u',
  customerId: 'c1',
  subtotal: 5000,
  discount: 0,
  total: 5000,
  status: 'completed',
  soldAt: '2026-10-24T09:00:00+03:00',
  items: [],
  payments: []
};

const item: SaleItem = {
  id: 'i1',
  saleId: 'sale-1',
  productId: 'p1',
  productName: 'Sugar',
  unitId: 'kg',
  unitSymbol: 'kg',
  qty: 2,
  qtyBase: 2000,
  factor: 1000,
  pricePerUnit: 2500,
  pricePerBase: 3,
  costPerBase: 2,
  lineTotal: 5000,
  profit: 1000
};

const soapItem: SaleItem = {
  id: 'i2',
  saleId: 'sale-1',
  productId: 'p2',
  productName: 'Old Soap',
  unitId: 'pc',
  unitSymbol: 'pc',
  qty: 2,
  qtyBase: 2,
  factor: 1,
  pricePerUnit: 1500,
  pricePerBase: 1500,
  costPerBase: 1000,
  lineTotal: 3000,
  profit: 1000
};

const payment: Payment = {
  id: 'pay1',
  saleId: 'sale-1',
  tender: 'credit',
  amount: 5000,
  isReversed: false,
  createdAt: '2026-10-10T09:00:00+03:00'
};

const products: Product[] = [
  {
    id: 'p1',
    name: 'Sugar',
    baseUnitId: 'g',
    categoryId: 'groceries',
    costPerBase: 2,
    pricePerBase: 3,
    reorderLevelBase: 5000,
    isActive: true,
    expiryDate: '2026-10-26'
  },
  {
    id: 'p2',
    name: 'Old Soap',
    baseUnitId: 'pc',
    categoryId: 'cosmetics',
    costPerBase: 1000,
    pricePerBase: 1500,
    reorderLevelBase: 2,
    isActive: true
  }
];

const movements: StockMovement[] = [
  {
    id: 'm1',
    productId: 'p1',
    movementType: 'opening',
    qtyBase: 500,
    createdAt: '2026-10-01T09:00:00+03:00'
  },
  {
    id: 'm2',
    productId: 'p2',
    movementType: 'opening',
    qtyBase: 100,
    createdAt: '2026-10-01T09:00:00+03:00'
  }
];

const snapshot: ReportSnapshot = {
  business,
  sales: [sale],
  saleItems: [item, soapItem],
  payments: [payment],
  expenses: [],
  products,
  movements,
  users: [],
  customers: [],
  categories: [
    { id: 'groceries', name: 'Groceries' },
    { id: 'cosmetics', name: 'Cosmetics' }
  ]
};

describe('rule-based insights', () => {
  it('names today top seller', () => {
    const insight = topSellerToday(snapshot, NOW);
    expect(insight?.message).toContain('Sugar');
    expect(insight?.message).toContain('2 units');
  });

  it('uses singular unit when one item sold', () => {
    const insight = topSellerToday(
      { ...snapshot, saleItems: [{ ...item, qty: 1, lineTotal: 2500 }] },
      NOW
    );
    expect(insight?.message).toContain('1 unit');
    expect(insight?.message).not.toContain('1 units');
  });

  it('flags expiring products', () => {
    expect(expiringSoon(snapshot, NOW)?.message).toContain('expire within 7 days');
  });

  it('flags low stock from recent sales velocity', () => {
    const insight = lowStock(snapshot, NOW);
    expect(insight?.message).toContain('run out');
  });

  it('does not alert on never-sold zero-stock products', () => {
    const insight = lowStock(
      {
        ...snapshot,
        sales: [],
        saleItems: [],
        payments: [],
        products: [{ ...products[0]!, id: 'p-empty', name: 'Empty Shelf' }],
        movements: []
      },
      NOW
    );
    expect(insight).toBeNull();
  });

  it('reports an out-of-stock product only when it has sold before', () => {
    const insight = lowStock({ ...snapshot, movements: [], saleItems: [item] }, NOW);
    expect(insight?.message).toContain('1 product is out of stock');
    expect(insight?.message).not.toContain('2 products are out of stock');
  });

  it('flags slow movers once the shop is older than 30 days', () => {
    const insight = slowMovers({ ...snapshot, saleItems: [item] }, NOW);
    expect(insight?.message).toContain('Old Soap');
  });

  it('hides slow movers for a new shop with little sales history', () => {
    const insight = slowMovers(
      {
        ...snapshot,
        business: { ...business, createdAt: '2026-10-22T09:00:00+03:00' },
        saleItems: [item]
      },
      NOW
    );
    expect(insight).toBeNull();
  });

  it('reports overdue credit after 7 days', () => {
    const old = {
      ...snapshot,
      sales: [{ ...sale, soldAt: '2026-10-10T09:00:00+03:00' }],
      saleItems: [item, soapItem]
    };
    const insight = debtsOverdue(old, NOW);
    expect(insight?.message).toContain('TZS 5,000');
  });

  it('compares category margins', () => {
    const insight = marginByCategory(snapshot, NOW);
    expect(insight?.message).toMatch(/margin \d+%/);
  });

  it('sorts danger before warn before info', () => {
    const list = computeInsights(snapshot, NOW);
    const order = { danger: 0, warn: 1, info: 2 };
    const scores = list.map((entry) => order[entry.severity]);
    expect([...scores].sort((a, b) => a - b)).toEqual(scores);
  });
});
