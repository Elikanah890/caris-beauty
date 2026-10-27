'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import { unitChoices } from './pricing';
import type {
  Business,
  Category,
  Customer,
  Product,
  Sale,
  SaleItem,
  Payment,
  Purchase,
  Unit,
  UnitChoice
} from './types';
import type { ReportSnapshot } from './reports';

export interface CatalogProduct extends Product {
  stockBase: number;
  choices: UnitChoice[];
}

export function useCatalog() {
  return useLiveQuery(async () => {
    const [products, categories, units, conversions, movements] = await Promise.all([
      db.products.toArray(),
      db.categories.toArray(),
      db.units.toArray(),
      db.product_units.toArray(),
      db.stock_movements.toArray()
    ]);

    const stock = new Map<string, number>();
    for (const movement of movements) {
      stock.set(
        movement.productId,
        (stock.get(movement.productId) ?? 0) + Number(movement.qtyBase)
      );
    }
    const conversionsByProduct = new Map<string, typeof conversions>();
    for (const conversion of conversions) {
      const list = conversionsByProduct.get(conversion.productId) ?? [];
      list.push(conversion);
      conversionsByProduct.set(conversion.productId, list);
    }

    const categoryNames = new Map(categories.map((category) => [category.id, category.name]));
    const unitById = new Map(units.map((unit) => [unit.id, unit]));
    const active: CatalogProduct[] = products
      .filter((product) => !product.deletedAt)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((product) => ({
        ...product,
        categoryName: product.categoryId
          ? categoryNames.get(product.categoryId) ?? product.categoryName ?? null
          : product.categoryName ?? null,
        baseUnitName: unitById.get(product.baseUnitId)?.name ?? product.baseUnitName ?? null,
        baseUnitSymbol: unitById.get(product.baseUnitId)?.symbol ?? product.baseUnitSymbol ?? null,
        stockBase: stock.get(product.id) ?? 0,
        choices: unitChoices(
          product,
          conversionsByProduct.get(product.id) ?? [],
          units
        )
      }));

    return {
      products: active,
      allProducts: products,
      categories,
      units,
      conversions,
      movements
    };
  }, []);
}

export function useSnapshot(): ReportSnapshot | undefined {
  return useLiveQuery(async () => {
    const [businessRows, sales, saleItems, payments, expenses, products, movements, users, customers, categories, purchases] =
      await Promise.all([
        db.business.toArray(),
        db.sales.toArray(),
        db.sale_items.toArray(),
        db.payments.toArray(),
        db.expenses.toArray(),
        db.products.toArray(),
        db.stock_movements.toArray(),
        db.users.toArray(),
        db.customers.toArray(),
        db.categories.toArray(),
        db.purchases.toArray()
      ]);
    const business: Business | undefined = businessRows.sort((a, b) =>
      String(a.createdAt).localeCompare(String(b.createdAt))
    )[0];
    return {
      business,
      sales,
      saleItems,
      payments,
      expenses,
      products,
      movements,
      users,
      customers,
      categories,
      purchases: purchases as Purchase[]
    };
  }, []);
}

export interface SaleWithDetails extends Sale {
  items: SaleItem[];
  payments: Payment[];
}

export function useSales(limit = 100): SaleWithDetails[] | undefined {
  return useLiveQuery(async () => {
    const sales = await db.sales.orderBy('soldAt').reverse().limit(limit).toArray();
    const items = await db.sale_items.toArray();
    const payments = await db.payments.toArray();
    const itemsBySale = new Map<string, SaleItem[]>();
    for (const item of items) {
      const list = itemsBySale.get(item.saleId) ?? [];
      list.push(item);
      itemsBySale.set(item.saleId, list);
    }
    const paymentsBySale = new Map<string, Payment[]>();
    for (const payment of payments) {
      const list = paymentsBySale.get(payment.saleId) ?? [];
      list.push(payment);
      paymentsBySale.set(payment.saleId, list);
    }
    return sales.map((sale) => ({
      ...sale,
      items: itemsBySale.get(sale.id) ?? [],
      payments: paymentsBySale.get(sale.id) ?? []
    }));
  }, [limit]);
}

export function useCategories(): Category[] | undefined {
  return useLiveQuery(() => db.categories.toArray(), []);
}

export function useUnits(): Unit[] | undefined {
  return useLiveQuery(() => db.units.toArray(), []);
}

export function useCustomers(): Customer[] | undefined {
  return useLiveQuery(
    () => db.customers.filter((customer) => !customer.deletedAt).toArray(),
    []
  );
}

export function useExpenses() {
  return useLiveQuery(
    () => db.expenses.orderBy('spentAt').reverse().toArray(),
    []
  );
}

export function useSyncCounts() {
  return useLiveQuery(async () => {
    const pending = await db.sync_queue.filter((row) => row.status !== 'error').count();
    const errors = await db.sync_queue.where('status').equals('error').count();
    return { pending, errors };
  }, []);
}
