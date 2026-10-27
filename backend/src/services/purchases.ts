import type { Db } from '../db';
import { badRequest, notFound } from '../lib/errors';
import { writeAudit } from '../lib/audit';
import { lineTotal, roundMoney } from '../lib/money';
import { uuid } from '../lib/ids';
import { getProduct, resolveUnit } from './stock';
import { camelize } from '../lib/case';
import type { AuthUser } from '../lib/types';

export interface PurchaseItemInput {
  id?: string;
  productId: string;
  unitId: string;
  qty: number;
  qtyBase?: number;
  costPerBase?: number;
  costPerUnit?: number;
  movementId?: string;
}

export interface CreatePurchaseInput {
  id?: string;
  supplierId?: string | null;
  reference?: string | null;
  notes?: string | null;
  purchasedAt?: string;
  deviceId?: string | null;
  items: PurchaseItemInput[];
}

function mapPurchase(row: Record<string, unknown>): Record<string, unknown> {
  return camelize<Record<string, unknown>>(row);
}

export async function getPurchaseDetail(trx: Db, purchaseId: string) {
  const purchase = (await trx('purchases as p')
    .leftJoin('suppliers as s', 's.id', 'p.supplier_id')
    .leftJoin('users as u', 'u.id', 'p.created_by')
    .where('p.id', purchaseId)
    .select('p.*', 's.name as supplier_name', 'u.name as created_by_name')
    .first()) as Record<string, unknown> | undefined;
  if (!purchase) throw notFound('Purchase not found');
  const items = (await trx('purchase_items').where({ purchase_id: purchaseId })) as Record<
    string,
    unknown
  >[];
  return {
    ...mapPurchase(purchase),
    items: items.map((i) => {
      const mapped = camelize(i) as Record<string, unknown>;
      mapped.qty = Number(mapped.qty);
      return mapped;
    })
  };
}

export async function createPurchase(
  trx: Db,
  user: AuthUser,
  input: CreatePurchaseInput
) {
  const purchaseId = input.id ?? uuid();
  if (input.id) {
    const existing = await trx('purchases').where({ id: input.id }).first();
    if (existing) return getPurchaseDetail(trx, input.id);
  }
  if (!input.items?.length) throw badRequest('A purchase needs at least one item', 'items');

  if (input.supplierId) {
    const supplier = await trx('suppliers').where({ id: input.supplierId }).first();
    if (!supplier) throw badRequest('Supplier not found', 'supplierId');
  }

  const prepared: Array<Record<string, unknown>> = [];
  let total = 0;

  for (const item of input.items) {
    const product = await getProduct(trx, item.productId);
    const resolved = await resolveUnit(trx, product, item.unitId, Number(item.qty), item.qtyBase);

    let costPerBase: number;
    if (item.costPerBase !== undefined) {
      costPerBase = Math.max(0, roundMoney(Number(item.costPerBase)));
    } else if (item.costPerUnit !== undefined) {
      costPerBase = Math.max(0, roundMoney(Number(item.costPerUnit) / resolved.factor));
    } else {
      costPerBase = product.cost_per_base;
    }

    // The line total must use the actual per-unit purchase cost, never the
    // rounded per-base cost multiplied back up. This keeps offline and online
    // totals identical to the shilling.
    const unitCost = item.costPerUnit !== undefined
      ? roundMoney(Number(item.costPerUnit))
      : costPerBase * resolved.factor;
    const line = lineTotal(Number(item.qty), unitCost);
    total += line;

    prepared.push({
      id: item.id ?? uuid(),
      product_id: product.id,
      product_name: product.name,
      unit_id: resolved.unit.id,
      unit_symbol: resolved.unit.symbol,
      qty: Number(item.qty),
      qty_base: resolved.qtyBase,
      factor: resolved.factor,
      cost_per_base: costPerBase,
      line_total: line,
      movement_id: item.movementId ?? uuid()
    });
  }

  const purchasedAt = input.purchasedAt ? new Date(input.purchasedAt) : new Date();
  if (Number.isNaN(purchasedAt.getTime())) throw badRequest('Invalid purchase date', 'purchasedAt');

  await trx('purchases').insert({
    id: purchaseId,
    supplier_id: input.supplierId ?? null,
    device_id: input.deviceId ?? null,
    reference: input.reference ?? null,
    total_cost: total,
    status: 'received',
    notes: input.notes ?? null,
    created_by: user.id,
    purchased_at: purchasedAt
  });

  const itemRows = prepared.map((item) => {
    const copy = { ...item };
    delete copy.movement_id;
    return { ...copy, purchase_id: purchaseId };
  });
  await trx('purchase_items').insert(itemRows);

  await trx('stock_movements').insert(
    prepared.map((item) => ({
      id: item.movement_id,
      product_id: item.product_id,
      movement_type: 'purchase',
      qty_base: item.qty_base,
      unit_cost: item.cost_per_base,
      reference_type: 'purchase',
      reference_id: purchaseId,
      user_id: user.id,
      device_id: input.deviceId ?? null
    }))
  );

  for (const item of prepared) {
    const product = await trx('products').where({ id: item.product_id }).first();
    if (product && Number(product.cost_per_base) !== Number(item.cost_per_base)) {
      await trx('products')
        .where({ id: item.product_id })
        .update({ cost_per_base: item.cost_per_base, updated_at: trx.fn.now() });
      await writeAudit(trx, {
        userId: user.id,
        action: 'product.cost_change',
        entity: 'products',
        entityId: item.product_id as string,
        details: {
          source: 'purchase',
          purchaseId,
          from: product.cost_per_base,
          to: item.cost_per_base
        }
      });
    }
  }

  await writeAudit(trx, {
    userId: user.id,
    action: 'purchase.created',
    entity: 'purchases',
    entityId: purchaseId,
    details: { total, items: prepared.length, supplierId: input.supplierId ?? null }
  });

  return getPurchaseDetail(trx, purchaseId);
}
