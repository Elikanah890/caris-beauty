import { db, getDeviceForUser } from './db';
import { nowIso, uuid } from './utils';
import { roundTZS, toQtyBase } from './pricing';
import { can } from './permissions';
import { requestSync } from './sync';
import type {
  Device,
  Expense,
  Payment,
  Product,
  Purchase,
  PurchaseItem,
  Sale,
  SaleItem,
  StockMovement,
  SyncQueueItem,
  Tender,
  User
} from './types';

export interface SaleDraftItem {
  productId: string;
  unitId: string;
  qty: number;
}

export interface SaleDraftPayment {
  tender: Tender;
  amount: number;
  reference?: string;
}

export class LocalRuleError extends Error {}

function queueItem(
  entity: string,
  op: SyncQueueItem['op'],
  payload: Record<string, unknown>,
  createdAt: string
): SyncQueueItem {
  return {
    id: uuid(),
    entity,
    op,
    payload,
    createdAt,
    status: 'pending'
  };
}

export async function recordSale(input: {
  items: SaleDraftItem[];
  discount: number;
  payments: SaleDraftPayment[];
  customerId: string | null;
  notes?: string | null;
  user: User;
  device: Device;
  idempotencyKey?: string | null;
}): Promise<Sale> {
  if (input.items.length === 0) throw new LocalRuleError('Add at least one item');
  if (input.discount > 0 && !can(input.user, 'sales.discount')) {
    throw new LocalRuleError('You do not have permission to give discounts');
  }
  if (input.payments.some((p) => p.tender === 'credit') && !input.customerId) {
    throw new LocalRuleError('Credit sales need a customer');
  }

  const saleId = input.idempotencyKey ?? uuid();
  const baseTime = Date.now();

  const sale = await db.transaction(
    'rw',
    [
      db.products,
      db.product_units,
      db.units,
      db.devices,
      db.customers,
      db.sales,
      db.sale_items,
      db.payments,
      db.stock_movements,
      db.sync_queue
    ],
    async () => {
      const prepared: SaleItem[] = [];
      let subtotal = 0;

      for (const [index, item] of input.items.entries()) {
        const product = await db.products.get(item.productId);
        if (!product || product.deletedAt || !product.isActive) {
          throw new LocalRuleError('A product in the cart is no longer available');
        }
        const units = await db.units.toArray();
        const conversions = await db.product_units.where('productId').equals(product.id).toArray();

        let factor = 1;
        let pricePerUnit = Math.round(Number(product.pricePerBase));
        const unit = units.find((u) => u.id === item.unitId);
        if (!unit) throw new LocalRuleError('Unit not found');

        if (item.unitId !== product.baseUnitId) {
          const conversion = conversions.find((c) => c.unitId === item.unitId);
          if (!conversion) throw new LocalRuleError(`${product.name} cannot be sold in ${unit.name}`);
          factor = Number(conversion.factor);
          pricePerUnit =
            conversion.priceOverride !== null && conversion.priceOverride !== undefined
              ? Math.round(Number(conversion.priceOverride))
              : Math.round(Number(product.pricePerBase) * factor);
        }

        const qtyBase = toQtyBase(item.qty, factor);
        if (qtyBase <= 0) throw new LocalRuleError('Quantity must be greater than zero');
        const lineTotal = roundTZS(item.qty * pricePerUnit);
        const costPerBase = Math.round(Number(product.costPerBase));
        const profit = lineTotal - qtyBase * costPerBase;
        subtotal += lineTotal;

        prepared.push({
          id: uuid(),
          saleId,
          productId: product.id,
          productName: product.name,
          unitId: unit.id,
          unitSymbol: unit.symbol,
          qty: item.qty,
          qtyBase,
          factor,
          pricePerUnit,
          pricePerBase: Math.round(Number(product.pricePerBase)),
          costPerBase,
          lineTotal,
          profit,
          createdAt: new Date(baseTime + index).toISOString()
        });
      }

      const discount = Math.max(0, roundTZS(input.discount));
      if (discount > subtotal) throw new LocalRuleError('Discount cannot exceed the subtotal');
      const total = subtotal - discount;
      const paymentSum = input.payments.reduce((sum, p) => sum + roundTZS(p.amount), 0);
      if (paymentSum !== total) {
        throw new LocalRuleError(`Payments must equal ${total.toLocaleString('en-US')} TZS`);
      }

      const device = await db.devices.get(input.device.id);
      if (!device) throw new LocalRuleError('This device is not registered');
      const seq = Number(device.lastReceiptSeq || 0) + 1;
      const receiptNo = `${device.receiptPrefix}-${String(seq).padStart(6, '0')}`;
      await db.devices.put({ ...device, lastReceiptSeq: seq, updatedAt: nowIso() });

      const soldAt = new Date(baseTime).toISOString();
      const payments: Payment[] = input.payments.map((payment, index) => ({
        id: uuid(),
        saleId,
        tender: payment.tender,
        amount: roundTZS(payment.amount),
        reference: payment.reference ?? null,
        isReversed: false,
        createdAt: new Date(baseTime + index + 1).toISOString(),
        updatedAt: new Date(baseTime + index + 1).toISOString()
      }));

      const movementIds = prepared.map(() => uuid());
      const movements: StockMovement[] = prepared.map((item, index) => ({
        id: movementIds[index] as string,
        productId: item.productId as string,
        movementType: 'sale',
        qtyBase: -item.qtyBase,
        unitCost: item.costPerBase,
        referenceType: 'sale',
        referenceId: saleId,
        userId: input.user.id,
        deviceId: input.device.id,
        createdAt: new Date(baseTime + index + 2).toISOString(),
        updatedAt: new Date(baseTime + index + 2).toISOString()
      }));

      const saleCustomer = input.customerId
        ? await db.customers.get(input.customerId)
        : undefined;

      const sale: Sale = {
        id: saleId,
        receiptNo,
        deviceId: input.device.id,
        userId: input.user.id,
        userName: input.user.name,
        customerId: input.customerId,
        customerName: saleCustomer?.name ?? null,
        customerPhone: saleCustomer?.phone ?? null,
        subtotal,
        discount,
        total,
        status: 'completed',
        notes: input.notes ?? null,
        soldAt,
        createdAt: soldAt,
        updatedAt: soldAt,
        items: prepared,
        payments
      };

      await db.sales.put(sale);
      await db.sale_items.bulkPut(prepared);
      await db.payments.bulkPut(payments);
      await db.stock_movements.bulkPut(movements);

      const queue: SyncQueueItem[] = [];
      let order = 0;
      const createdAt = () => new Date(baseTime + order++).toISOString();

      queue.push(
        queueItem(
          'sales',
          'create',
          {
            id: saleId,
            receiptNo,
            soldAt,
            deviceId: input.device.id,
            customerId: input.customerId,
            discount,
            notes: input.notes ?? null,
            items: prepared.map((item, index) => ({
              id: item.id,
              productId: item.productId,
              unitId: item.unitId,
              qty: item.qty,
              qtyBase: item.qtyBase,
              movementId: movementIds[index]
            })),
            payments: payments.map((payment) => ({
              id: payment.id,
              tender: payment.tender,
              amount: payment.amount,
              reference: payment.reference
            }))
          },
          createdAt()
        )
      );

      for (const item of prepared) {
        queue.push(
          queueItem('sale_items', 'create', { ...item }, createdAt())
        );
      }
      for (const payment of payments) {
        queue.push(
          queueItem('payments', 'create', { ...payment }, createdAt())
        );
      }
      for (const movement of movements) {
        queue.push(
          queueItem(
            'stock_movements',
            'create',
            {
              ...movement,
              deviceId: input.device.id
            },
            createdAt()
          )
        );
      }

      await db.sync_queue.bulkPut(queue);
      return sale;
    }
  );

  requestSync(400);
  return sale;
}

export async function voidSaleLocal(saleId: string, user: User): Promise<Sale> {
  if (!can(user, 'sales.void')) throw new LocalRuleError('You cannot void sales');

  const sale = await db.transaction(
    'rw',
    [db.sales, db.sale_items, db.payments, db.stock_movements, db.sync_queue],
    async () => {
      const existing = await db.sales.get(saleId);
      if (!existing) throw new LocalRuleError('Sale not found');
      if (existing.status === 'voided') throw new LocalRuleError('This sale is already voided');
      const items = await db.sale_items.where('saleId').equals(saleId).toArray();
      const payments = await db.payments.where('saleId').equals(saleId).toArray();
      const now = nowIso();

      const reversalMovements = items.map((item) => ({
        id: uuid(),
        productId: item.productId as string,
        qtyBase: Math.abs(item.qtyBase),
        unitCost: item.costPerBase
      }));

      await db.stock_movements.bulkPut(
        reversalMovements.map((movement, index) => ({
          id: movement.id,
          productId: movement.productId,
          movementType: 'return' as const,
          qtyBase: movement.qtyBase,
          unitCost: movement.unitCost,
          referenceType: 'sale',
          referenceId: saleId,
          userId: user.id,
          deviceId: existing.deviceId,
          createdAt: new Date(Date.now() + index).toISOString(),
          updatedAt: now
        }))
      );

      await db.payments.bulkPut(
        payments.map((payment) => ({ ...payment, isReversed: true, updatedAt: now }))
      );

      const updated: Sale = { ...existing, status: 'voided', updatedAt: now, items, payments: payments.map((p) => ({ ...p, isReversed: true })) };
      await db.sales.put(updated);

      await db.sync_queue.put(
        queueItem('sales', 'void', { id: saleId, reversalMovements }, now)
      );
      return updated;
    }
  );

  requestSync(400);
  return sale;
}

export async function recordAdjustment(input: {
  productId: string;
  qtyBase: number;
  reason: 'damaged' | 'expired' | 'count_correction' | 'other';
  note?: string | null;
  user: User;
  device: Device | null;
}): Promise<StockMovement> {
  if (!can(input.user, 'stock.adjust')) {
    throw new LocalRuleError('You do not have permission to adjust stock');
  }
  if (!Number.isInteger(input.qtyBase) || input.qtyBase === 0) {
    throw new LocalRuleError('Quantity must be a non-zero whole number');
  }
  if (input.qtyBase > 0) {
    throw new LocalRuleError(
      "To add new stock, use 'Record Stock Purchase' on the Purchases page."
    );
  }

  const movement = await db.transaction(
    'rw',
    [db.products, db.stock_movements, db.sync_queue],
    async () => {
      const product = await db.products.get(input.productId);
      if (!product) throw new LocalRuleError('Product not found');
      const now = nowIso();
      const row: StockMovement = {
        id: uuid(),
        productId: product.id,
        movementType: 'adjustment',
        qtyBase: input.qtyBase,
        unitCost: Number(product.costPerBase),
        reason: input.reason,
        note: input.note ?? null,
        userId: input.user.id,
        deviceId: input.device?.id ?? null,
        createdAt: now,
        updatedAt: now
      };
      await db.stock_movements.put(row);
      await db.sync_queue.put(
        queueItem('stock_movements', 'create', { ...row }, now)
      );
      return row;
    }
  );

  requestSync(400);
  return movement;
}

export async function recordExpense(input: {
  category: string;
  description: string;
  amount: number;
  paidVia: Tender;
  spentAt: string;
  user: User;
}): Promise<Expense> {
  if (!can(input.user, 'expenses.record')) {
    throw new LocalRuleError('You do not have permission to record expenses');
  }
  const now = nowIso();
  const expense: Expense = {
    id: uuid(),
    category: input.category,
    description: input.description,
    amount: Math.round(input.amount),
    paidVia: input.paidVia,
    userId: input.user.id,
    userName: input.user.name,
    spentAt: input.spentAt,
    createdAt: now,
    updatedAt: now
  };
  await db.transaction('rw', [db.expenses, db.sync_queue], async () => {
    await db.expenses.put(expense);
    await db.sync_queue.put(queueItem('expenses', 'create', { ...expense }, now));
  });
  requestSync(400);
  return expense;
}

export async function deleteExpense(id: string, user: User): Promise<void> {
  if (!can(user, 'expenses.record')) {
    throw new LocalRuleError('You do not have permission to delete expenses');
  }
  const now = nowIso();
  await db.transaction('rw', [db.expenses, db.sync_queue], async () => {
    const expense = await db.expenses.get(id);
    if (!expense) throw new LocalRuleError('Expense not found');
    await db.expenses.put({ ...expense, deletedAt: now, updatedAt: now });
    await db.sync_queue.put(
      queueItem('expenses', 'delete', { id, deletedAt: now }, now)
    );
  });
  requestSync(400);
}

export interface PurchaseDraftItem {
  productId: string;
  unitId: string;
  qty: number;
  costPerUnit?: number;
  costPerBase?: number;
}

export async function recordPurchase(input: {
  supplierId: string | null;
  reference?: string | null;
  notes?: string | null;
  items: PurchaseDraftItem[];
  user: User;
  device: Device | null;
}): Promise<Purchase> {
  if (!can(input.user, 'stock.receive')) {
    throw new LocalRuleError('You do not have permission to receive stock');
  }
  if (input.items.length === 0) throw new LocalRuleError('Add at least one item');

  const purchaseId = uuid();
  const baseTime = Date.now();

  const purchase = await db.transaction(
    'rw',
    [
      db.products,
      db.product_units,
      db.units,
      db.purchases,
      db.purchase_items,
      db.stock_movements,
      db.sync_queue
    ],
    async () => {
      const prepared: PurchaseItem[] = [];
      const unitCosts: number[] = [];
      let total = 0;

      const movementsBefore = await db.stock_movements.toArray();
      const stockMap = new Map<string, number>();
      for (const movement of movementsBefore) {
        stockMap.set(
          movement.productId,
          (stockMap.get(movement.productId) ?? 0) + Number(movement.qtyBase)
        );
      }
      const purchaseCosts = new Map<string, { qtyBase: number; costValue: number }>();

      for (const [index, item] of input.items.entries()) {
        const product = await db.products.get(item.productId);
        if (!product) throw new LocalRuleError('Product not found');
        const units = await db.units.toArray();
        const unit = units.find((u) => u.id === item.unitId);
        if (!unit) throw new LocalRuleError('Unit not found');
        let factor = 1;
        if (item.unitId !== product.baseUnitId) {
          const conversion = await db.product_units
            .where('[productId+unitId]')
            .equals([product.id, item.unitId])
            .first();
          if (!conversion) throw new LocalRuleError(`${product.name} has no ${unit.name} conversion`);
          factor = Number(conversion.factor);
        }
        const qtyBase = toQtyBase(item.qty, factor);
        const costPerBase =
          item.costPerBase !== undefined
            ? Math.max(0, Math.round(item.costPerBase))
            : item.costPerUnit !== undefined
              ? Math.max(0, roundTZS(item.costPerUnit / factor))
              : Math.round(Number(product.costPerBase));
        const unitCost =
          item.costPerUnit !== undefined
            ? Math.round(item.costPerUnit)
            : costPerBase * factor;
        const lineTotal = roundTZS(item.qty * unitCost);
        total += lineTotal;
        unitCosts.push(unitCost);

        const aggregate = purchaseCosts.get(product.id) ?? { qtyBase: 0, costValue: 0 };
        aggregate.qtyBase += qtyBase;
        aggregate.costValue += qtyBase * costPerBase;
        purchaseCosts.set(product.id, aggregate);

        prepared.push({
          id: uuid(),
          purchaseId,
          productId: product.id,
          productName: product.name,
          unitId: unit.id,
          unitSymbol: unit.symbol,
          qty: item.qty,
          qtyBase,
          factor,
          costPerBase,
          lineTotal,
          createdAt: new Date(baseTime + index).toISOString()
        });
      }

      const purchasedAt = new Date(baseTime).toISOString();
      const movementIds = prepared.map(() => uuid());
      const movements: StockMovement[] = prepared.map((item, index) => ({
        id: movementIds[index] as string,
        productId: item.productId as string,
        movementType: 'purchase',
        qtyBase: item.qtyBase,
        unitCost: item.costPerBase,
        referenceType: 'purchase',
        referenceId: purchaseId,
        userId: input.user.id,
        deviceId: input.device?.id ?? null,
        createdAt: new Date(baseTime + index + 1).toISOString(),
        updatedAt: purchasedAt
      }));

      const row: Purchase = {
        id: purchaseId,
        supplierId: input.supplierId,
        deviceId: input.device?.id ?? null,
        reference: input.reference ?? null,
        totalCost: total,
        status: 'received',
        notes: input.notes ?? null,
        createdBy: input.user.id,
        createdByName: input.user.name,
        purchasedAt,
        createdAt: purchasedAt,
        updatedAt: purchasedAt,
        items: prepared
      };

      await db.purchases.put(row);
      await db.purchase_items.bulkPut(prepared);
      await db.stock_movements.bulkPut(movements);

      // Weighted-average cost, matching the server calculation.
      for (const [productId, aggregate] of purchaseCosts) {
        if (aggregate.qtyBase <= 0) continue;
        const product = await db.products.get(productId);
        if (!product) continue;
        const stockBefore = stockMap.get(productId) ?? 0;
        const currentCost = Number(product.costPerBase);
        const incomingCost = aggregate.costValue / aggregate.qtyBase;
        const denominator = stockBefore + aggregate.qtyBase;
        const newCost =
          stockBefore > 0 && denominator > 0
            ? Math.round(
                (stockBefore * currentCost + aggregate.costValue) / denominator
              )
            : Math.round(incomingCost);
        if (newCost !== currentCost) {
          await db.products.put({
            ...product,
            costPerBase: newCost,
            updatedAt: purchasedAt
          });
        }
      }

      const queue: SyncQueueItem[] = [];
      let order = 0;
      const createdAt = () => new Date(baseTime + order++).toISOString();

      queue.push(
        queueItem(
          'purchases',
          'create',
          {
            id: purchaseId,
            supplierId: input.supplierId,
            deviceId: input.device?.id ?? null,
            reference: input.reference ?? null,
            notes: input.notes ?? null,
            purchasedAt,
            items: prepared.map((item, index) => ({
              id: item.id,
              productId: item.productId,
              unitId: item.unitId,
              qty: item.qty,
              qtyBase: item.qtyBase,
              costPerBase: item.costPerBase,
              costPerUnit: unitCosts[index],
              movementId: movementIds[index]
            }))
          },
          createdAt()
        )
      );
      for (const item of prepared) {
        queue.push(queueItem('purchase_items', 'create', { ...item }, createdAt()));
      }
      for (const movement of movements) {
        queue.push(queueItem('stock_movements', 'create', { ...movement }, createdAt()));
      }
      await db.sync_queue.bulkPut(queue);

      return row;
    }
  );

  requestSync(400);
  return purchase;
}

export async function voidPurchaseLocal(purchaseId: string, user: User): Promise<void> {
  if (!can(user, 'stock.receive')) {
    throw new LocalRuleError('You do not have permission to void purchases');
  }
  throw new LocalRuleError('Purchase voiding is not available in this version');
}

export async function deviceFor(userId: string): Promise<Device | null> {
  return getDeviceForUser(userId);
}

export async function addProductUnitsLocal(
  productId: string,
  units: Array<{ id: string; unitId: string; factor: number; priceOverride: number | null }>
): Promise<void> {
  const product = await db.products.get(productId);
  if (!product) return;
  const rows = units.map((unit) => ({
    id: unit.id,
    productId,
    unitId: unit.unitId,
    factor: unit.factor,
    priceOverride: unit.priceOverride,
    createdAt: nowIso(),
    updatedAt: nowIso()
  }));
  await db.product_units.bulkPut(rows);
}

export async function inventorySnapshot(productId: string): Promise<number> {
  const rows = await db.stock_movements.where('productId').equals(productId).toArray();
  return rows.reduce((sum, row) => sum + Number(row.qtyBase), 0);
}
