import type { Db } from '../db';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors';
import { writeAudit } from '../lib/audit';
import { lineCost, lineProfit, lineTotal, roundMoney } from '../lib/money';
import { hasPermission } from '../lib/permissions';
import type { AuthUser } from '../lib/types';
import { uuid } from '../lib/ids';
import { getProduct, resolveUnit } from './stock';
import { bumpReceiptSequence, nextReceiptNumber } from './devices';
import { camelize } from '../lib/case';

export const TENDERS = ['cash', 'mpesa', 'tigopesa', 'airtel', 'bank', 'credit'] as const;
export type Tender = (typeof TENDERS)[number];

export interface SaleItemInput {
  id?: string;
  productId: string;
  unitId: string;
  qty: number;
  qtyBase?: number;
  movementId?: string;
}

export interface PaymentInput {
  id?: string;
  tender: Tender;
  amount: number;
  reference?: string | null;
}

export interface CreateSaleInput {
  id?: string;
  receiptNo?: string;
  soldAt?: string;
  deviceId: string;
  customerId?: string | null;
  items: SaleItemInput[];
  discount?: number;
  payments: PaymentInput[];
  notes?: string | null;
}

function mapSaleRow(row: Record<string, unknown>): Record<string, unknown> {
  return camelize<Record<string, unknown>>(row);
}

function mapItem(row: Record<string, unknown>) {
  const item = camelize(row) as Record<string, unknown>;
  item.qty = Number(item.qty);
  return item;
}

export async function getSaleDetail(trx: Db, saleId: string) {
  const sale = (await trx('sales as s')
    .leftJoin('users as u', 'u.id', 's.user_id')
    .leftJoin('customers as c', 'c.id', 's.customer_id')
    .leftJoin('devices as d', 'd.id', 's.device_id')
    .where('s.id', saleId)
    .select(
      's.*',
      'u.name as user_name',
      'c.name as customer_name',
      'c.phone as customer_phone',
      'd.receipt_prefix'
    )
    .first()) as Record<string, unknown> | undefined;
  if (!sale) throw notFound('Sale not found');

  const items = (await trx('sale_items').where({ sale_id: saleId }).orderBy('created_at')) as Record<
    string,
    unknown
  >[];
  const payments = (await trx('payments').where({ sale_id: saleId }).orderBy('created_at')) as Record<
    string,
    unknown
  >[];

  return {
    ...mapSaleRow(sale),
    items: items.map(mapItem),
    payments: payments.map((p) => mapSaleRow(p))
  };
}

export async function listSales(
  trx: Db,
  filters: { from?: string; to?: string; userId?: string; customerId?: string; limit?: number }
) {
  const query = trx('sales as s')
    .leftJoin('users as u', 'u.id', 's.user_id')
    .leftJoin('customers as c', 'c.id', 's.customer_id')
    .select('s.*', 'u.name as user_name', 'c.name as customer_name')
    .orderBy('s.sold_at', 'desc')
    .limit(Math.min(filters.limit ?? 200, 500));

  if (filters.from) query.where('s.sold_at', '>=', new Date(filters.from));
  if (filters.to) query.where('s.sold_at', '<=', new Date(filters.to));
  if (filters.userId) query.where('s.user_id', filters.userId);
  if (filters.customerId) query.where('s.customer_id', filters.customerId);

  const sales = (await query) as Record<string, unknown>[];
  if (sales.length === 0) return [];
  const ids = sales.map((s) => s.id as string);
  const items = (await trx('sale_items').whereIn('sale_id', ids)) as Record<string, unknown>[];
  const payments = (await trx('payments').whereIn('sale_id', ids)) as Record<string, unknown>[];

  const itemsBySale = new Map<string, Record<string, unknown>[]>();
  for (const item of items) {
    const list = itemsBySale.get(item.sale_id as string) ?? [];
    list.push(mapItem(item));
    itemsBySale.set(item.sale_id as string, list);
  }
  const paymentsBySale = new Map<string, Record<string, unknown>[]>();
  for (const payment of payments) {
    const list = paymentsBySale.get(payment.sale_id as string) ?? [];
    list.push(mapSaleRow(payment));
    paymentsBySale.set(payment.sale_id as string, list);
  }

  return sales.map((sale) => ({
    ...mapSaleRow(sale),
    items: itemsBySale.get(sale.id as string) ?? [],
    payments: paymentsBySale.get(sale.id as string) ?? []
  }));
}

/**
 * Create a sale atomically: sale + snapshots + stock movements + payments.
 * Server computes every monetary value from catalog data. Client values are
 * only accepted as a tolerance check and for offline-generated ids/receipts.
 */
export async function createSale(
  trx: Db,
  user: AuthUser,
  input: CreateSaleInput
): Promise<ReturnType<typeof getSaleDetail>> {
  const saleId = input.id ?? uuid();

  if (input.id) {
    const existing = await trx('sales').where({ id: input.id }).first();
    if (existing) return getSaleDetail(trx, input.id);
  }

  if (!input.items?.length) throw badRequest('A sale needs at least one item', 'items');
  if (!input.deviceId) throw badRequest('A registered device is required', 'deviceId');

  const device = (await trx('devices').where({ id: input.deviceId }).first()) as
    | { id: string; user_id: string | null }
    | undefined;
  if (!device) throw badRequest('Device is not registered', 'deviceId');

  const discount = roundMoney(input.discount ?? 0);
  if (discount < 0) throw badRequest('Discount cannot be negative', 'discount');
  if (discount > 0 && !hasPermission(user.role, user.permissions, 'sales.discount')) {
    throw forbidden('You need the "sales.discount" permission to discount a sale');
  }

  if (input.customerId) {
    const customer = await trx('customers').where({ id: input.customerId }).first();
    if (!customer) throw badRequest('Customer not found', 'customerId');
  }

  const preparedItems: Array<Record<string, unknown>> = [];
  let subtotal = 0;

  for (const item of input.items) {
    const product = await getProduct(trx, item.productId);
    const resolved = await resolveUnit(trx, product, item.unitId, Number(item.qty), item.qtyBase);
    const total = lineTotal(Number(item.qty), resolved.pricePerUnit);
    const cost = lineCost(resolved.qtyBase, product.cost_per_base);
    const profit = lineProfit(total, cost);
    subtotal += total;

    preparedItems.push({
      id: item.id ?? uuid(),
      product_id: product.id,
      product_name: product.name,
      unit_id: resolved.unit.id,
      unit_symbol: resolved.unit.symbol,
      qty: Number(item.qty),
      qty_base: resolved.qtyBase,
      factor: resolved.factor,
      price_per_unit: resolved.pricePerUnit,
      price_per_base: resolved.pricePerBase,
      cost_per_base: product.cost_per_base,
      line_total: total,
      profit,
      movement_id: item.movementId ?? uuid()
    });
  }

  if (discount > subtotal) throw badRequest('Discount cannot exceed the subtotal', 'discount');
  const total = subtotal - discount;

  const payments = input.payments ?? [];
  if (!Array.isArray(payments) || payments.length === 0) {
    throw badRequest('At least one payment is required', 'payments');
  }
  let paymentSum = 0;
  for (const payment of payments) {
    if (!TENDERS.includes(payment.tender)) {
      throw badRequest(`Unknown tender "${payment.tender}"`, 'payments');
    }
    const amount = roundMoney(Number(payment.amount));
    if (!Number.isFinite(amount) || amount < 0) {
      throw badRequest('Payment amount is invalid', 'payments');
    }
    if (payment.tender === 'credit' && !input.customerId) {
      throw badRequest('Credit sales require a customer', 'customerId');
    }
    paymentSum += amount;
  }
  if (paymentSum !== total) {
    throw badRequest(
      `Payments (${paymentSum}) must equal the sale total (${total})`,
      'payments'
    );
  }

  let receiptNo: string;
  if (input.receiptNo) {
    receiptNo = input.receiptNo;
    const clash = await trx('sales').where({ receipt_no: receiptNo }).first();
    if (clash) throw conflict('DUPLICATE_RECEIPT', `Receipt ${receiptNo} already exists`);
    if (device.user_id && device.user_id !== user.id) {
      // A device belongs to a user; still allow the owner to correct history.
      if (user.role !== 'owner') throw forbidden('This device is bound to another user');
    }
  } else {
    receiptNo = (await nextReceiptNumber(trx, input.deviceId)).receiptNo;
  }

  const soldAt = input.soldAt ? new Date(input.soldAt) : new Date();
  if (Number.isNaN(soldAt.getTime())) throw badRequest('Invalid sale date', 'soldAt');

  await trx('sales').insert({
    id: saleId,
    receipt_no: receiptNo,
    device_id: input.deviceId,
    user_id: user.id,
    customer_id: input.customerId ?? null,
    subtotal,
    discount,
    total,
    status: 'completed',
    notes: input.notes ?? null,
    sold_at: soldAt
  });

  const itemRows = preparedItems.map((item) => {
    const copy = { ...item };
    delete copy.movement_id;
    return { ...copy, sale_id: saleId };
  });
  await trx('sale_items').insert(itemRows);

  await trx('stock_movements').insert(
    preparedItems.map((item) => ({
      id: item.movement_id,
      product_id: item.product_id,
      movement_type: 'sale',
      qty_base: -(item.qty_base as number),
      unit_cost: item.cost_per_base,
      reference_type: 'sale',
      reference_id: saleId,
      user_id: user.id,
      device_id: input.deviceId
    }))
  );

  await trx('payments').insert(
    payments.map((payment) => ({
      id: payment.id ?? uuid(),
      sale_id: saleId,
      tender: payment.tender,
      amount: roundMoney(Number(payment.amount)),
      reference: payment.reference ?? null
    }))
  );

  if (input.receiptNo) await bumpReceiptSequence(trx, input.deviceId, receiptNo);

  await writeAudit(trx, {
    userId: user.id,
    action: 'sale.created',
    entity: 'sales',
    entityId: saleId,
    details: {
      receiptNo,
      total,
      customerId: input.customerId ?? null,
      items: preparedItems.length
    }
  });

  if (discount > 0) {
    await writeAudit(trx, {
      userId: user.id,
      action: 'sale.discount',
      entity: 'sales',
      entityId: saleId,
      details: { discount, subtotal, total, receiptNo }
    });
  }
  if (payments.some((p) => p.tender === 'credit')) {
    await writeAudit(trx, {
      userId: user.id,
      action: 'sale.credit',
      entity: 'sales',
      entityId: saleId,
      details: {
        customerId: input.customerId,
        credit: payments.filter((p) => p.tender === 'credit').reduce((s, p) => s + p.amount, 0),
        receiptNo
      }
    });
  }

  return getSaleDetail(trx, saleId);
}

export async function voidSale(
  trx: Db,
  user: AuthUser,
  saleId: string,
  reversalMovements?: Array<{ id?: string; productId: string; qtyBase: number; unitCost?: number }>
) {
  const sale = (await trx('sales').where({ id: saleId }).forUpdate().first()) as
    | { id: string; receipt_no: string; status: string; total: number; device_id: string | null }
    | undefined;
  if (!sale) throw notFound('Sale not found');
  if (sale.status === 'voided') throw conflict('ALREADY_VOIDED', 'This sale is already voided');

  const items = (await trx('sale_items').where({ sale_id: saleId })) as Record<string, unknown>[];

  await trx('sales')
    .where({ id: saleId })
    .update({ status: 'voided', updated_at: trx.fn.now() });

  if (items.length > 0) {
    await trx('stock_movements').insert(
      items.map((item, index) => {
        const supplied = reversalMovements?.[index];
        return {
          id: supplied?.id ?? uuid(),
          product_id: item.product_id,
          movement_type: 'return',
          qty_base: supplied ? Math.abs(supplied.qtyBase) : Number(item.qty_base),
          unit_cost: supplied?.unitCost ?? item.cost_per_base,
          reference_type: 'sale',
          reference_id: saleId,
          user_id: user.id,
          device_id: sale.device_id
        };
      })
    );
  }

  await trx('payments')
    .where({ sale_id: saleId })
    .update({ is_reversed: true, updated_at: trx.fn.now() });

  await writeAudit(trx, {
    userId: user.id,
    action: 'sale.void',
    entity: 'sales',
    entityId: saleId,
    details: { receiptNo: sale.receipt_no, total: sale.total, items: items.length }
  });

  return getSaleDetail(trx, saleId);
}
