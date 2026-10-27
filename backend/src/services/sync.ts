import type { Knex } from 'knex';
import type { Db } from '../db';
import { db } from '../db';
import { badRequest, forbidden } from '../lib/errors';
import { snakeize, camelize } from '../lib/case';
import { writeAudit } from '../lib/audit';
import { hasPermission } from '../lib/permissions';
import { createSale, voidSale } from './sales';
import { createPurchase } from './purchases';
import { getProduct } from './stock';
import { normalizedPhone } from '../lib/ids';
import type { AuthUser } from '../lib/types';

export interface SyncRow {
  id: string;
  entity: string;
  op: string;
  payload: Record<string, unknown>;
  createdAt?: string;
}

export interface SyncAck {
  id: string;
  status: 'ok' | 'error';
  reason?: string;
}

const PRODUCT_FIELDS = [
  'id',
  'name',
  'sku',
  'barcode',
  'categoryId',
  'baseUnitId',
  'costPerBase',
  'pricePerBase',
  'reorderLevelBase',
  'expiryDate',
  'isActive',
  'createdAt',
  'updatedAt'
] as const;

const CUSTOMER_FIELDS = [
  'id',
  'name',
  'phone',
  'email',
  'creditLimit',
  'notes',
  'isActive',
  'deletedAt',
  'createdAt',
  'updatedAt'
] as const;

const SUPPLIER_FIELDS = [
  'id',
  'name',
  'phone',
  'email',
  'address',
  'deletedAt',
  'createdAt',
  'updatedAt'
] as const;

const EXPENSE_FIELDS = [
  'id',
  'category',
  'description',
  'amount',
  'paidVia',
  'userId',
  'spentAt',
  'deletedAt',
  'createdAt',
  'updatedAt'
] as const;

const BUSINESS_FIELDS = [
  'id',
  'name',
  'tin',
  'vrn',
  'efdDeviceId',
  'phone',
  'address',
  'receiptFooter',
  'createdAt',
  'updatedAt'
] as const;

function pick(payload: Record<string, unknown>, keys: readonly string[]) {
  const out: Record<string, unknown> = {};
  for (const key of keys) if (payload[key] !== undefined) out[key] = payload[key];
  return out;
}

async function upsertLww(
  trx: Db,
  table: string,
  payload: Record<string, unknown>,
  keys: readonly string[]
) {
  const allowed = snakeize(pick(payload, keys)) as Record<string, unknown>;
  const id = allowed.id as string | undefined;
  if (!id) throw badRequest('Synced row is missing an id');

  const existing = (await trx(table).where({ id }).first()) as
    | { updated_at?: Date; created_at?: Date }
    | undefined;

  const incomingUpdated = allowed.updated_at ? new Date(allowed.updated_at as string) : new Date();
  allowed.updated_at = incomingUpdated;

  if (!existing) {
    if (!allowed.created_at) allowed.created_at = incomingUpdated;
    await trx(table).insert(allowed);
    return;
  }

  const currentUpdated = existing.updated_at ? new Date(existing.updated_at) : new Date(0);
  if (incomingUpdated <= currentUpdated) return;

  const patch = { ...allowed };
  delete patch.id;
  delete patch.created_at;
  await trx(table).where({ id }).update(patch);
}

async function requireFlag(
  user: AuthUser,
  flag: 'stock.adjust' | 'stock.receive' | 'sales.discount' | 'sales.void' | 'sales.make' | 'expenses.record'
) {
  if (!hasPermission(user.role, user.permissions, flag)) {
    throw forbidden(`You need the "${flag}" permission for this action`);
  }
}

async function upsertProductUnits(
  trx: Db,
  productId: string,
  units: Array<Record<string, unknown>>
) {
  await trx('product_units').where({ product_id: productId }).delete();
  if (units.length === 0) return;
  await trx('product_units').insert(
    units
      .filter((u) => u.unitId && Number(u.factor) > 0)
      .map((u) => ({
        id: (u.id as string | undefined) ?? undefined,
        product_id: productId,
        unit_id: u.unitId as string,
        factor: Number(u.factor),
        price_override: u.priceOverride === null || u.priceOverride === undefined
          ? null
          : Number(u.priceOverride),
        created_at: u.createdAt ? new Date(u.createdAt as string) : undefined,
        updated_at: u.updatedAt ? new Date(u.updatedAt as string) : undefined
      }))
  );
}

async function processRow(trx: Db, user: AuthUser, row: SyncRow): Promise<void> {
  const payload = row.payload ?? {};
  const entity = row.entity;
  const op = row.op;

  switch (entity) {
    case 'business': {
      const allowed = snakeize(pick(payload, BUSINESS_FIELDS)) as Record<string, unknown>;
      const id = allowed.id as string | undefined;
      const existing = id
        ? ((await trx('business').where({ id }).first()) as Record<string, unknown> | undefined)
        : ((await trx('business').orderBy('created_at').first()) as Record<string, unknown> | undefined);
      const incomingUpdated = new Date(
        (allowed.updated_at as string | undefined) ?? new Date().toISOString()
      );
      allowed.updated_at = incomingUpdated;
      if (!existing) {
        if (!allowed.created_at) allowed.created_at = incomingUpdated;
        await trx('business').insert(allowed);
      } else if (incomingUpdated > new Date(existing.updated_at as string)) {
        const patch = { ...allowed };
        delete patch.id;
        delete patch.created_at;
        await trx('business').where({ id: existing.id as string }).update(patch);
      }
      return;
    }

    case 'products': {
      if (op === 'delete') {
        if (user.role !== 'owner') throw forbidden('Only the owner can delete products');
        const id = (payload.id as string) ?? row.id;
        await trx('products')
          .where({ id })
          .update({ deleted_at: trx.fn.now(), is_active: false, updated_at: trx.fn.now() });
        await writeAudit(trx, {
          userId: user.id,
          action: 'product.deleted',
          entity: 'products',
          entityId: id,
          details: { source: 'sync' }
        });
        return;
      }
      if (user.role !== 'owner') throw forbidden('Only the owner can change products');
      const units = Array.isArray(payload.units)
        ? (payload.units as Array<Record<string, unknown>>)
        : [];
      const allowed = snakeize(pick(payload, PRODUCT_FIELDS)) as Record<string, unknown>;
      const id = allowed.id as string | undefined;
      if (!id) throw badRequest('Product id is required');
      const existing = (await trx('products').where({ id }).first()) as
        | Record<string, unknown>
        | undefined;
      const tombstone = (await trx('sync_deletions')
        .where({ entity: 'products', entity_id: id })
        .first()) as Record<string, unknown> | undefined;
      if ((existing && existing.deleted_at) || tombstone) {
        throw badRequest('Product was deleted on the server');
      }
      const incomingUpdated = new Date(
        (payload.updatedAt as string | undefined) ??
          (payload.createdAt as string | undefined) ??
          new Date().toISOString()
      );
      allowed.updated_at = incomingUpdated;
      if (!existing) {
        if (!allowed.created_at) allowed.created_at = incomingUpdated;
        await trx('products').insert(allowed);
      } else if (incomingUpdated > new Date(existing.updated_at as string)) {
        const patch = { ...allowed };
        delete patch.id;
        delete patch.created_at;
        await trx('products').where({ id }).update(patch);
      }
      if (units.length) await upsertProductUnits(trx, id, units);
      return;
    }

    case 'product_units': {
      const id = payload.id as string | undefined;
      if (!id) throw badRequest('product_units row needs an id');
      const existing = await trx('product_units').where({ id }).first();
      if (existing) return;
      await trx('product_units').insert({
        id,
        product_id: payload.productId,
        unit_id: payload.unitId,
        factor: Number(payload.factor),
        price_override:
          payload.priceOverride === null || payload.priceOverride === undefined
            ? null
            : Number(payload.priceOverride),
        created_at: payload.createdAt ? new Date(payload.createdAt as string) : undefined,
        updated_at: payload.updatedAt ? new Date(payload.updatedAt as string) : undefined
      });
      return;
    }

    case 'categories': {
      if (user.role !== 'owner') throw forbidden('Only the owner can change categories');
      await upsertLww(trx, 'categories', payload, [
        'id',
        'name',
        'color',
        'createdAt',
        'updatedAt'
      ]);
      return;
    }

    case 'customers': {
      if (op === 'delete') {
        const id = (payload.id as string) ?? row.id;
        await trx('customers')
          .where({ id })
          .update({ deleted_at: trx.fn.now(), is_active: false, updated_at: trx.fn.now() });
        return;
      }
      const allowed = pick(payload, CUSTOMER_FIELDS);
      if (typeof allowed.phone === 'string' && allowed.phone) {
        allowed.phone = normalizedPhone(allowed.phone) ?? allowed.phone;
      }
      await upsertLww(trx, 'customers', allowed, CUSTOMER_FIELDS);
      return;
    }

    case 'suppliers': {
      if (op === 'delete') {
        const id = (payload.id as string) ?? row.id;
        await trx('suppliers')
          .where({ id })
          .update({ deleted_at: trx.fn.now(), updated_at: trx.fn.now() });
        return;
      }
      const allowed = pick(payload, SUPPLIER_FIELDS);
      if (typeof allowed.phone === 'string' && allowed.phone) {
        allowed.phone = normalizedPhone(allowed.phone) ?? allowed.phone;
      }
      await upsertLww(trx, 'suppliers', allowed, SUPPLIER_FIELDS);
      return;
    }

    case 'expenses': {
      await requireFlag(user, 'expenses.record');
      if (op === 'delete') {
        const id = (payload.id as string) ?? row.id;
        await trx('expenses')
          .where({ id })
          .update({ deleted_at: trx.fn.now(), updated_at: trx.fn.now() });
        await writeAudit(trx, {
          userId: user.id,
          action: 'expense.deleted',
          entity: 'expenses',
          entityId: id,
          details: { source: 'sync' }
        });
        return;
      }
      const id = payload.id as string | undefined;
      if (!id) throw badRequest('Expense id is required');
      const existing = await trx('expenses').where({ id }).first();
      if (existing) return;
      const allowed = pick(payload, EXPENSE_FIELDS);
      allowed.userId = user.id;
      await upsertLww(trx, 'expenses', allowed, EXPENSE_FIELDS);
      await writeAudit(trx, {
        userId: user.id,
        action: 'expense.recorded',
        entity: 'expenses',
        entityId: id,
        details: {
          category: payload.category,
          amount: payload.amount,
          description: payload.description,
          source: 'sync'
        }
      });
      return;
    }

    case 'sales': {
      if (op === 'void') {
        await requireFlag(user, 'sales.void');
        const id = (payload.id as string) ?? row.id;
        const reversalMovements = Array.isArray(payload.reversalMovements)
          ? (payload.reversalMovements as Array<Record<string, unknown>>).map((m) => ({
              id: m.id as string | undefined,
              productId: m.productId as string,
              qtyBase: Number(m.qtyBase),
              unitCost: m.unitCost === undefined ? undefined : Number(m.unitCost)
            }))
          : undefined;
        await voidSale(trx, user, id, reversalMovements);
        return;
      }
      await requireFlag(user, 'sales.make');
      const deviceId = (payload.deviceId as string | undefined) ?? null;
      if (!deviceId) throw badRequest('Sale is missing deviceId');
      await createSale(trx, user, {
        id: (payload.id as string | undefined) ?? row.id,
        receiptNo: payload.receiptNo as string | undefined,
        soldAt: payload.soldAt as string | undefined,
        deviceId,
        customerId: (payload.customerId as string | null | undefined) ?? null,
        items: (payload.items as Array<Record<string, unknown>>).map((item) => ({
          id: item.id as string | undefined,
          productId: item.productId as string,
          unitId: item.unitId as string,
          qty: Number(item.qty),
          qtyBase: item.qtyBase === undefined ? undefined : Number(item.qtyBase),
          movementId: item.movementId as string | undefined
        })),
        discount: Number(payload.discount ?? 0),
        payments: (payload.payments as Array<Record<string, unknown>>).map((payment) => ({
          id: payment.id as string | undefined,
          tender: payment.tender as never,
          amount: Number(payment.amount),
          reference: (payment.reference as string | null | undefined) ?? null
        })),
        notes: (payload.notes as string | null | undefined) ?? null
      });
      return;
    }

    case 'sale_items': {
      await requireFlag(user, 'sales.make');
      const id = payload.id as string | undefined;
      if (!id) throw badRequest('sale_items row needs an id');
      const sale = await trx('sales').where({ id: payload.saleId }).first();
      if (!sale) throw badRequest('Parent sale has not been synced yet');
      const existing = await trx('sale_items').where({ id }).first();
      if (existing) return;
      const allowed = snakeize(
        pick(payload, [
          'id',
          'saleId',
          'productId',
          'productName',
          'unitId',
          'unitSymbol',
          'qty',
          'qtyBase',
          'factor',
          'pricePerUnit',
          'pricePerBase',
          'costPerBase',
          'lineTotal',
          'profit',
          'createdAt'
        ])
      ) as Record<string, unknown>;
      await trx('sale_items').insert(allowed);
      return;
    }

    case 'payments': {
      await requireFlag(user, 'sales.make');
      const id = payload.id as string | undefined;
      if (!id) throw badRequest('payments row needs an id');
      const existing = await trx('payments').where({ id }).first();
      if (existing) return;
      const allowed = snakeize(
        pick(payload, [
          'id',
          'saleId',
          'tender',
          'amount',
          'reference',
          'isReversed',
          'createdAt',
          'updatedAt'
        ])
      ) as Record<string, unknown>;
      await trx('payments').insert(allowed);
      return;
    }

    case 'stock_movements': {
      const id = payload.id as string | undefined;
      if (!id) throw badRequest('stock_movements row needs an id');
      const existing = await trx('stock_movements').where({ id }).first();
      if (existing) return;

      const movementType = String(payload.movementType ?? 'adjustment');
      if (movementType === 'adjustment') {
        await requireFlag(user, 'stock.adjust');
      } else {
        // Sale, purchase and return movements must be created by their
        // envelope (which recomputes quantities/totals server-side). A child
        // row is only ever an idempotent duplicate of that envelope.
        throw badRequest(
          'This stock movement must be created by its sale or purchase envelope'
        );
      }

      const productId = payload.productId as string;
      const product = await getProduct(trx, productId);
      const qtyBase = Number(payload.qtyBase);
      if (!Number.isInteger(qtyBase) || qtyBase === 0) {
        throw badRequest('Stock movement quantity must be a non-zero integer');
      }
      if (movementType === 'adjustment' && qtyBase > 0) {
        throw badRequest(
          "To add new stock, use 'Record Stock Purchase' on the Purchases page."
        );
      }

      if (['sale', 'return', 'sale_void'].includes(movementType) && payload.referenceId) {
        const sale = await trx('sales').where({ id: payload.referenceId }).first();
        if (!sale) throw badRequest('Parent sale has not been synced yet');
      }

      await trx('stock_movements').insert({
        id,
        product_id: productId,
        movement_type: movementType,
        qty_base: qtyBase,
        unit_cost:
          payload.unitCost === undefined || payload.unitCost === null
            ? product.cost_per_base
            : Number(payload.unitCost),
        reference_type: (payload.referenceType as string | undefined) ?? null,
        reference_id: (payload.referenceId as string | undefined) ?? null,
        reason: (payload.reason as string | undefined) ?? null,
        note: (payload.note as string | undefined) ?? null,
        user_id: user.id,
        device_id: (payload.deviceId as string | undefined) ?? null,
        created_at: payload.createdAt ? new Date(payload.createdAt as string) : undefined,
        updated_at: payload.updatedAt ? new Date(payload.updatedAt as string) : undefined
      });

      if (movementType === 'adjustment') {
        await writeAudit(trx, {
          userId: user.id,
          action: 'stock.adjust',
          entity: 'stock_movements',
          entityId: id,
          details: {
            productId,
            qtyBase,
            reason: payload.reason,
            source: 'sync'
          }
        });
      }
      return;
    }

    case 'purchases': {
      await requireFlag(user, 'stock.receive');
      const deviceId = (payload.deviceId as string | undefined) ?? null;
      await createPurchase(trx, user, {
        id: (payload.id as string | undefined) ?? row.id,
        supplierId: (payload.supplierId as string | null | undefined) ?? null,
        reference: (payload.reference as string | null | undefined) ?? null,
        notes: (payload.notes as string | null | undefined) ?? null,
        purchasedAt: payload.purchasedAt as string | undefined,
        deviceId,
        items: (payload.items as Array<Record<string, unknown>>).map((item) => ({
          id: item.id as string | undefined,
          productId: item.productId as string,
          unitId: item.unitId as string,
          qty: Number(item.qty),
          qtyBase: item.qtyBase === undefined ? undefined : Number(item.qtyBase),
          costPerBase: item.costPerBase === undefined ? undefined : Number(item.costPerBase),
          costPerUnit: item.costPerUnit === undefined ? undefined : Number(item.costPerUnit),
          movementId: item.movementId as string | undefined
        }))
      });
      return;
    }

    case 'purchase_items': {
      await requireFlag(user, 'stock.receive');
      const id = payload.id as string | undefined;
      if (!id) throw badRequest('purchase_items row needs an id');
      const existing = await trx('purchase_items').where({ id }).first();
      if (existing) return;
      const allowed = snakeize(
        pick(payload, [
          'id',
          'purchaseId',
          'productId',
          'productName',
          'unitId',
          'unitSymbol',
          'qty',
          'qtyBase',
          'factor',
          'costPerBase',
          'lineTotal',
          'createdAt'
        ])
      ) as Record<string, unknown>;
      await trx('purchase_items').insert(allowed);
      return;
    }

    case 'users':
    case 'devices':
      throw forbidden('Staff and device changes must be made online');

    default:
      throw badRequest(`Unknown sync entity "${entity}"`);
  }
}

export async function pushBatch(user: AuthUser, rows: SyncRow[]): Promise<SyncAck[]> {
  const results: SyncAck[] = [];

  for (const row of rows) {
    try {
      const ack = await db.transaction(async (trx) => {
        const inserted = (await trx('sync_queue')
          .insert({
            client_id: row.id,
            device_id: user.deviceId,
            entity: row.entity,
            op: row.op,
            payload: JSON.stringify(row.payload),
            status: 'pending'
          })
          .onConflict('client_id')
          .ignore()
          .returning('*')) as Array<Record<string, unknown>>;

        if (inserted.length === 0) {
          const existing = (await trx('sync_queue').where({ client_id: row.id }).first()) as
            | { status: string; error: string | null }
            | undefined;
          if (existing?.status === 'ok') return { id: row.id, status: 'ok' as const };
          if (existing?.status === 'error') {
            return {
              id: row.id,
              status: 'error' as const,
              reason: existing.error ?? 'Previously rejected'
            };
          }
          throw badRequest('This row is already being processed');
        }

        try {
          await processRow(trx, user, row);
          await trx('sync_queue')
            .where({ client_id: row.id })
            .update({ status: 'ok', processed_at: trx.fn.now() });
          return { id: row.id, status: 'ok' as const };
        } catch (err) {
          const reason = err instanceof Error ? err.message : 'Sync failed';
          await trx('sync_queue')
            .where({ client_id: row.id })
            .update({ status: 'error', error: reason, processed_at: trx.fn.now() });
          throw err;
        }
      });
      results.push(ack);
    } catch (err) {
      results.push({
        id: row.id,
        status: 'error',
        reason: err instanceof Error ? err.message : 'Sync failed'
      });
    }
  }

  return results;
}

const PULL_TABLES: Array<{
  name: string;
  timestamp: string;
  select?: (query: Knex.QueryBuilder) => Knex.QueryBuilder;
}> = [
  { name: 'business', timestamp: 'updated_at' },
  { name: 'units', timestamp: 'updated_at' },
  { name: 'categories', timestamp: 'updated_at' },
  {
    name: 'users',
    timestamp: 'updated_at',
    select: (q) =>
      q.select(
        'id',
        'email',
        'name',
        'role',
        'permissions',
        'is_active',
        'must_change_password',
        'device_id',
        'last_login_at',
        'created_at',
        'updated_at',
        'deleted_at'
      )
  },
  { name: 'devices', timestamp: 'updated_at' },
  {
    name: 'products',
    timestamp: 'updated_at',
    select: (q) => q.whereNull('deleted_at')
  },
  { name: 'product_units', timestamp: 'updated_at' },
  { name: 'customers', timestamp: 'updated_at' },
  { name: 'suppliers', timestamp: 'updated_at' },
  { name: 'purchases', timestamp: 'updated_at' },
  { name: 'purchase_items', timestamp: 'created_at' },
  { name: 'sales', timestamp: 'updated_at' },
  { name: 'sale_items', timestamp: 'created_at' },
  { name: 'payments', timestamp: 'updated_at' },
  { name: 'stock_movements', timestamp: 'created_at' },
  { name: 'expenses', timestamp: 'updated_at' },
  { name: 'audit_log', timestamp: 'created_at' }
];

export async function pullChanges(since: Date) {
  const serverTime = new Date();
  const tables: Record<string, unknown[]> = {};

  for (const table of PULL_TABLES) {
    let query = db(table.name)
      .where(table.timestamp, '>', since)
      .orderBy(table.timestamp, 'asc')
      .limit(5000);
    if (table.select) query = table.select(query);
    const rows = (await query) as Record<string, unknown>[];
    tables[table.name] = rows.map((r) => camelize(r));
  }

  const deletedProducts = (await db('sync_deletions')
    .where({ entity: 'products' })
    .where('deleted_at', '>', since)
    .orderBy('deleted_at', 'asc')
    .limit(5000)
    .select('entity_id', 'deleted_at')) as {
    entity_id: string;
    deleted_at: Date;
  }[];

  return {
    serverTime: serverTime.toISOString(),
    tables,
    deletions: {
      products: deletedProducts.map((row) => ({
        id: row.entity_id,
        deletedAt: row.deleted_at.toISOString()
      }))
    }
  };
}
