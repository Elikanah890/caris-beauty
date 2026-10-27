import type { Db } from '../db';
import { badRequest, notFound } from '../lib/errors';

export interface ProductRow {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  category_id: string | null;
  base_unit_id: string;
  cost_per_base: number;
  price_per_base: number;
  reorder_level_base: number;
  expiry_date: string | null;
  is_active: boolean;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface UnitRow {
  id: string;
  name: string;
  symbol: string;
  is_base: boolean;
}

export async function getStock(trx: Db, productId: string): Promise<number> {
  const row = (await trx('stock_movements')
    .where({ product_id: productId })
    .sum<{ total: string | null }[]>({ total: 'qty_base' }))[0];
  return Number(row?.total ?? 0);
}

export async function getProduct(trx: Db, productId: string): Promise<ProductRow> {
  const product = (await trx('products').where({ id: productId }).first()) as
    | ProductRow
    | undefined;
  if (!product || product.deleted_at) throw notFound('Product not found');
  return product;
}

export interface ResolvedUnit {
  unit: UnitRow;
  factor: number;
  pricePerUnit: number;
  qtyBase: number;
  pricePerBase: number;
}

/**
 * Resolve a client-supplied unit/qty against the product's conversion table.
 * The server always computes qty_base itself — a client value may only be used
 * as a sanity check (tolerance of 1 base unit).
 */
export async function resolveUnit(
  trx: Db,
  product: ProductRow,
  unitId: string,
  qty: number,
  clientQtyBase?: number | null
): Promise<ResolvedUnit> {
  const unit = (await trx<UnitRow>('units').where({ id: unitId }).first()) as
    | UnitRow
    | undefined;
  if (!unit) throw badRequest('Unit not found', 'unitId');

  let factor = 1;
  let priceOverride: number | null = null;

  if (unitId === product.base_unit_id) {
    factor = 1;
  } else {
    const conversion = (await trx('product_units')
      .where({ product_id: product.id, unit_id: unitId })
      .first()) as
      | { factor: number; price_override: number | null }
      | undefined;
    if (!conversion) {
      throw badRequest(`This product cannot be sold in ${unit.name}`, 'unitId');
    }
    factor = Number(conversion.factor);
    priceOverride = conversion.price_override === null ? null : Number(conversion.price_override);
  }

  const qtyBase = Math.sign(qty) * Math.round(Math.abs(qty) * factor);
  if (qtyBase === 0) throw badRequest('Quantity must be greater than zero', 'qty');

  if (
    typeof clientQtyBase === 'number' &&
    Number.isFinite(clientQtyBase) &&
    Math.abs(clientQtyBase - qtyBase) > 1
  ) {
    throw badRequest('Quantity conversion mismatch. Please refresh and try again.', 'qtyBase');
  }

  const pricePerUnit =
    priceOverride !== null
      ? priceOverride
      : Math.round(product.price_per_base * factor);

  return {
    unit,
    factor,
    pricePerUnit,
    qtyBase,
    pricePerBase: product.price_per_base
  };
}
