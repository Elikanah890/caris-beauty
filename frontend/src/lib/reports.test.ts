import { describe, expect, it } from 'vitest';
import {
  closeDay,
  periodRange,
  shrinkage,
  slowMovers,
  summary,
  topProducts
} from './reports';
import type { Expense, Payment, Product, Sale, SaleItem, StockMovement } from './types';

const NOW = new Date('2026-10-24T12:00:00+03:00');

function sale(overrides: Partial<Sale> = {}): Sale {
  return {
    id: 'sale-1',
    receiptNo: 'KAR-000001',
    deviceId: 'device',
    userId: 'owner',
    customerId: null,
    subtotal: 5000,
    discount: 0,
    total: 5000,
    status: 'completed',
    soldAt: '2026-10-24T09:00:00+03:00',
    createdAt: '2026-10-24T09:00:00+03:00',
    updatedAt: '2026-10-24T09:00:00+03:00',
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
    ...overrides
  };
}

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: 'product-1',
    name: 'Sugar',
    baseUnitId: 'gram',
    costPerBase: 2,
    pricePerBase: 3,
    reorderLevelBase: 1000,
    isActive: true,
    ...overrides
  };
}

function movement(overrides: Partial<StockMovement> = {}): StockMovement {
  return {
    id: 'move-1',
    productId: 'product-1',
    movementType: 'adjustment',
    qtyBase: -200,
    unitCost: 2,
    reason: 'damaged',
    createdAt: '2026-10-24T10:00:00+03:00',
    ...overrides
  };
}

const expense: Expense = {
  id: 'expense-1',
  category: 'Transport',
  description: 'Boda',
  amount: 500,
  paidVia: 'cash',
  spentAt: '2026-10-24T08:00:00+03:00'
};

const categories = [{ id: 'cat-1', name: 'Groceries' }];

describe('offline reports', () => {
  it('matches the server summary formula within one shilling', () => {
    const range = periodRange('today', null, null, NOW);
    const result = summary(
      {
        sales: [
          sale({ total: 5000, subtotal: 5000 }),
          sale({
            id: 'sale-2',
            receiptNo: 'KAR-000002',
            total: 3000,
            subtotal: 3200,
            discount: 200,
            soldAt: '2026-10-24T10:00:00+03:00'
          })
        ],
        saleItems: [
          item(),
          item({ id: 'item-2', saleId: 'sale-2', qtyBase: 1000, lineTotal: 3200, costPerBase: 2, profit: 1200 })
        ],
        payments: [
          payment({ amount: 3000, tender: 'cash' }),
          payment({ id: 'payment-2', saleId: 'sale-1', tender: 'mpesa', amount: 2000 }),
          payment({ id: 'payment-3', saleId: 'sale-2', tender: 'cash', amount: 3000 })
        ],
        expenses: [expense],
        products: [product()],
        movements: [movement()],
        users: [],
        customers: [],
        categories
      },
      range
    );

    expect(result.sales).toBe(8000);
    expect(result.cogs).toBe(6000);
    expect(result.grossProfit).toBe(2000);
    expect(result.expenses).toBe(500);
    expect(result.expenseCount).toBe(1);
    expect(result.netProfit).toBe(1500);
    expect(result.saleCount).toBe(2);
    expect(result.averageSale).toBe(4000);
    expect(result.tenderBreakdown).toEqual({ cash: 6000, mpesa: 2000 });
  });

  it('excludes voided sales, reversed payments and other periods', () => {
    const range = periodRange('today', null, null, NOW);
    const result = summary(
      {
        sales: [
          sale({ id: 'ok', total: 5000 }),
          sale({ id: 'void', total: 9000, status: 'voided' }),
          sale({ id: 'old', total: 7000, soldAt: '2026-10-23T09:00:00+03:00' }),
          sale({ id: 'reversed', total: 8000 })
        ],
        saleItems: [
          item({ saleId: 'ok', qtyBase: 1000, lineTotal: 5000 }),
          item({ id: 'void-item', saleId: 'void', qtyBase: 1000 }),
          item({ id: 'old-item', saleId: 'old', qtyBase: 1000 }),
          item({ id: 'rev-item', saleId: 'reversed', qtyBase: 1000 })
        ],
        payments: [
          payment({ saleId: 'ok' }),
          payment({ id: 'void-pay', saleId: 'void' }),
          payment({ id: 'old-pay', saleId: 'old' }),
          payment({ id: 'rev-pay', saleId: 'reversed', isReversed: true })
        ],
        expenses: [expense],
        products: [product()],
        movements: [],
        users: [],
        customers: [],
        categories
      },
      range
    );

    expect(result.sales).toBe(5000);
    expect(result.saleCount).toBe(1);
    expect(result.cogs).toBe(2000);
  });

  it('ranks products and finds slow movers', () => {
    const range = periodRange('today', null, null, NOW);
    const snapshot = {
      sales: [sale()],
      saleItems: [
        item({ productId: 'sugar', productName: 'Sugar', qtyBase: 2000, lineTotal: 5000 }),
        item({ id: 'i2', productId: 'soap', productName: 'Soap', qtyBase: 10, lineTotal: 15000 })
      ],
      payments: [payment()],
      expenses: [],
      products: [
        product({ id: 'sugar', name: 'Sugar' }),
        product({ id: 'soap', name: 'Soap' }),
        product({ id: 'oil', name: 'Oil' })
      ],
      movements: [],
      users: [],
      customers: [],
      categories
    };
    const byQty = topProducts(snapshot, range, 5, 'qty');
    const byRevenue = topProducts(snapshot, range, 5, 'revenue');
    expect(byQty[0]?.productId).toBe('sugar');
    expect(byRevenue[0]?.productId).toBe('soap');

    const slow = slowMovers(snapshot, range, 0);
    expect(slow.map((entry) => entry.productId)).toEqual(['oil']);
  });

  it('groups shrinkage and builds a close-day reconciliation', () => {
    const range = periodRange('today', null, null, NOW);
    const snapshot = {
      sales: [sale()],
      saleItems: [item()],
      payments: [payment()],
      expenses: [expense],
      products: [product()],
      movements: [
        movement({ id: 'm1', qtyBase: -200, reason: 'damaged' }),
        movement({ id: 'm2', qtyBase: -300, reason: 'damaged' }),
        movement({ id: 'm3', qtyBase: -100, reason: 'expired' })
      ],
      users: [],
      customers: [],
      categories
    };
    const shrink = shrinkage(snapshot, range);
    expect(shrink.find((row) => row.reason === 'damaged')?.qtyBase).toBe(-500);
    expect(shrink.find((row) => row.reason === 'damaged')?.value).toBe(-1000);

    const day = closeDay(snapshot, '2026-10-24');
    expect(day.sales).toBe(5000);
    expect(day.cashExpected).toBe(5000);
    expect(day.netProfit).toBe(500);
  });
});
