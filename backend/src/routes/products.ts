import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { asyncHandler, badRequest, conflict, notFound } from '../lib/errors';
import { camelize } from '../lib/case';
import { writeAudit } from '../lib/audit';
import { authRequired, requireOwner, requirePermission, requireAnyPermission } from '../middleware/auth';
import { validateBody, validateQuery } from '../middleware/validate';
import { getProduct, getStock } from '../services/stock';
import { createPurchase } from '../services/purchases';
import type { Request, Response } from 'express';

export const productsRouter = Router();

const unitConversionSchema = z.object({
  id: z.string().uuid().optional(),
  unitId: z.string().uuid(),
  factor: z.coerce.number().int().positive(),
  priceOverride: z.coerce.number().int().min(0).nullable().optional()
});

const productSchema = z.object({
  name: z.string().min(1).max(160),
  sku: z.string().max(80).nullable().optional(),
  barcode: z.string().max(80).nullable().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  baseUnitId: z.string().uuid(),
  costPerBase: z.coerce.number().int().min(0),
  pricePerBase: z.coerce.number().int().min(0),
  reorderLevelBase: z.coerce.number().int().min(0).optional(),
  expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  isActive: z.boolean().optional(),
  units: z.array(unitConversionSchema).optional()
});

const updateSchema = productSchema.partial();

const withStockSchema = z.object({
  product: productSchema.omit({ costPerBase: true }),
  initialStock: z.object({
    supplierId: z.string().uuid().nullable().optional(),
    supplierName: z.string().max(160).nullable().optional(),
    quantity: z.coerce.number().positive('Quantity must be greater than zero'),
    costPerBase: z.coerce.number().int().min(0),
    purchaseDate: z.string().optional()
  })
});

const listQuery = z.object({
  q: z.string().max(100).optional(),
  category: z.string().uuid().optional(),
  active: z.enum(['true', 'false']).optional()
});

const movementsQuery = z.object({
  from: z.string().optional(),
  to: z.string().optional()
});

async function hydrate(products: Record<string, unknown>[]) {
  if (products.length === 0) return [];
  const ids = products.map((p) => p.id as string);
  const conversions = (await db('product_units as pu')
    .join('units as u', 'u.id', 'pu.unit_id')
    .whereIn('pu.product_id', ids)
    .select(
      'pu.*',
      'u.name as unit_name',
      'u.symbol as unit_symbol'
    )) as Record<string, unknown>[];

  const byProduct = new Map<string, Record<string, unknown>[]>();
  for (const c of conversions) {
    const key = c.product_id as string;
    const list = byProduct.get(key) ?? [];
    list.push(camelize(c) as Record<string, unknown>);
    byProduct.set(key, list);
  }

  return products.map((p) => {
    const product = camelize(p) as Record<string, unknown>;
    const base = {
      unitId: p.base_unit_id,
      unitName: p.base_unit_name,
      unitSymbol: p.base_unit_symbol,
      factor: 1,
      priceOverride: null,
      isBase: true
    };
    const list = (byProduct.get(p.id as string) ?? []).map((u) => ({ ...u, isBase: false }));
    product.units = [base, ...list];
    return product;
  });
}

function applyProductRow(row: Record<string, unknown>) {
  return camelize(row) as Record<string, unknown>;
}

productsRouter.get(
  '/',
  authRequired,
  validateQuery(listQuery),
  asyncHandler(async (req: Request, res: Response) => {
    const q = req.query as unknown as z.infer<typeof listQuery>;
    const stockSub = db('stock_movements')
      .select('product_id')
      .sum({ stock_base: 'qty_base' })
      .groupBy('product_id')
      .as('sm');

    const query = db('products as p')
      .leftJoin('categories as c', 'c.id', 'p.category_id')
      .leftJoin('units as u', 'u.id', 'p.base_unit_id')
      .leftJoin(stockSub, 'sm.product_id', 'p.id')
      .whereNull('p.deleted_at')
      .select(
        'p.*',
        'c.name as category_name',
        'u.name as base_unit_name',
        'u.symbol as base_unit_symbol',
        db.raw('COALESCE(sm.stock_base, 0)::bigint as stock_base')
      )
      .orderBy('p.name', 'asc');

    if (q.q) {
      query.where((builder) => {
        builder
          .whereILike('p.name', `%${q.q}%`)
          .orWhereILike('p.barcode', `%${q.q}%`)
          .orWhereILike('p.sku', `%${q.q}%`);
      });
    }
    if (q.category) query.where('p.category_id', q.category);
    if (q.active) query.where('p.is_active', q.active === 'true');

    const rows = (await query) as Record<string, unknown>[];
    res.json({ products: await hydrate(rows) });
  })
);

productsRouter.get(
  '/:id',
  authRequired,
  asyncHandler(async (req: Request, res: Response) => {
    const row = (await db('products as p')
      .leftJoin('categories as c', 'c.id', 'p.category_id')
      .leftJoin('units as u', 'u.id', 'p.base_unit_id')
      .where('p.id', req.params.id)
      .whereNull('p.deleted_at')
      .select('p.*', 'c.name as category_name', 'u.name as base_unit_name', 'u.symbol as base_unit_symbol')
      .first()) as Record<string, unknown> | undefined;
    if (!row) throw notFound('Product not found');
    const stockBase = await getStock(db, row.id as string);
    const [hydrated] = await hydrate([row]);
    res.json({ product: { ...hydrated, stockBase } });
  })
);

productsRouter.get(
  '/:id/stock',
  authRequired,
  requireAnyPermission('stock.view', 'sales.make'),
  asyncHandler(async (req: Request, res: Response) => {
    const product = await getProduct(db, req.params.id as string);
    const stockBase = await getStock(db, product.id);
    const unit = await db('units').where({ id: product.base_unit_id }).first();
    const conversions = await db('product_units as pu')
      .join('units as u', 'u.id', 'pu.unit_id')
      .where('pu.product_id', product.id)
      .select('pu.factor', 'u.name', 'u.symbol', 'u.id');

    const byUnit = conversions.map((c) => ({
      unitId: c.id,
      unitName: c.name,
      unitSymbol: c.symbol,
      factor: Number(c.factor),
      qty: Number(c.factor) > 0 ? stockBase / Number(c.factor) : 0
    }));

    res.json({
      productId: product.id,
      stockBase,
      baseUnit: unit,
      byUnit,
      reorderLevelBase: product.reorder_level_base
    });
  })
);

productsRouter.get(
  '/:id/movements',
  authRequired,
  requirePermission('stock.view'),
  validateQuery(movementsQuery),
  asyncHandler(async (req: Request, res: Response) => {
    const q = req.query as unknown as z.infer<typeof movementsQuery>;
    await getProduct(db, req.params.id as string);
    const query = db('stock_movements as sm')
      .leftJoin('users as u', 'u.id', 'sm.user_id')
      .where('sm.product_id', req.params.id)
      .select('sm.*', 'u.name as user_name')
      .orderBy('sm.created_at', 'desc')
      .limit(300);
    if (q.from) query.where('sm.created_at', '>=', new Date(q.from));
    if (q.to) query.where('sm.created_at', '<=', new Date(q.to));
    const rows = (await query) as Record<string, unknown>[];
    res.json({ movements: rows.map((r) => camelize(r)) });
  })
);

productsRouter.post(
  '/',
  authRequired,
  requireOwner,
  validateBody(productSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const user = req.auth!.user;
    const body = req.body as z.infer<typeof productSchema>;

    const baseUnit = await db('units').where({ id: body.baseUnitId }).first();
    if (!baseUnit) throw badRequest('Base unit not found', 'baseUnitId');
    if (!baseUnit.is_base) throw badRequest('Base unit must be piece, gram or millilitre', 'baseUnitId');
    if (body.categoryId) {
      const category = await db('categories').where({ id: body.categoryId }).first();
      if (!category) throw badRequest('Category not found', 'categoryId');
    }
    for (const u of body.units ?? []) {
      if (u.unitId === body.baseUnitId) throw badRequest('Base unit does not need a conversion', 'units');
      const unit = await db('units').where({ id: u.unitId }).first();
      if (!unit) throw badRequest('Unit not found', 'units');
    }

    const product = await db.transaction(async (trx) => {
      const rows = (await trx('products')
        .insert({
          name: body.name,
          sku: body.sku ?? null,
          barcode: body.barcode ?? null,
          category_id: body.categoryId ?? null,
          base_unit_id: body.baseUnitId,
          cost_per_base: body.costPerBase,
          price_per_base: body.pricePerBase,
          reorder_level_base: body.reorderLevelBase ?? 0,
          expiry_date: body.expiryDate ?? null,
          is_active: body.isActive ?? true
        })
        .returning('*')) as Record<string, unknown>[];

      const created = rows[0]!;
      if (body.units?.length) {
        await trx('product_units').insert(
          body.units.map((u) => ({
            product_id: created.id,
            unit_id: u.unitId,
            factor: u.factor,
            price_override: u.priceOverride ?? null
          }))
        );
      }

      await writeAudit(trx, {
        userId: user.id,
        action: 'product.created',
        entity: 'products',
        entityId: created.id as string,
        details: {
          name: body.name,
          pricePerBase: body.pricePerBase,
          costPerBase: body.costPerBase
        }
      });
      return created;
    });

    const [hydrated] = await hydrate([product]);
    res.status(201).json({ product: hydrated });
  })
);

productsRouter.post(
  '/with-stock',
  authRequired,
  requirePermission('stock.receive'),
  validateBody(withStockSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const user = req.auth!.user;
    const body = req.body as z.infer<typeof withStockSchema>;
    const { product: input, initialStock } = body;

    const baseUnit = await db('units').where({ id: input.baseUnitId }).first();
    if (!baseUnit) throw badRequest('Base unit not found', 'product.baseUnitId');
    if (!baseUnit.is_base) {
      throw badRequest('Base unit must be piece, gram or millilitre', 'product.baseUnitId');
    }
    if (input.categoryId) {
      const category = await db('categories').where({ id: input.categoryId }).first();
      if (!category) throw badRequest('Category not found', 'product.categoryId');
    }
    for (const u of input.units ?? []) {
      if (u.unitId === input.baseUnitId) {
        throw badRequest('Base unit does not need a conversion', 'product.units');
      }
      const unit = await db('units').where({ id: u.unitId }).first();
      if (!unit) throw badRequest('Unit not found', 'product.units');
    }

    if (initialStock.supplierId === null && !initialStock.supplierName?.trim()) {
      // No supplier is allowed; the purchase will be recorded without one.
    }

    const result = await db.transaction(async (trx) => {
      let supplierId = initialStock.supplierId ?? null;
      if (supplierId) {
        const supplier = await trx('suppliers').where({ id: supplierId }).first();
        if (!supplier) throw badRequest('Supplier not found', 'initialStock.supplierId');
      } else if (initialStock.supplierName?.trim()) {
        const supplierRows = (await trx('suppliers')
          .insert({ name: initialStock.supplierName.trim() })
          .returning('*')) as Record<string, unknown>[];
        supplierId = supplierRows[0]!.id as string;
      }

      const productRows = (await trx('products')
        .insert({
          name: input.name,
          sku: input.sku ?? null,
          barcode: input.barcode ?? null,
          category_id: input.categoryId ?? null,
          base_unit_id: input.baseUnitId,
          cost_per_base: initialStock.costPerBase,
          price_per_base: input.pricePerBase,
          reorder_level_base: input.reorderLevelBase ?? 0,
          expiry_date: input.expiryDate ?? null,
          is_active: input.isActive ?? true
        })
        .returning('*')) as Record<string, unknown>[];
      const created = productRows[0]!;

      if (input.units?.length) {
        await trx('product_units').insert(
          input.units.map((u) => ({
            product_id: created.id,
            unit_id: u.unitId,
            factor: u.factor,
            price_override: u.priceOverride ?? null
          }))
        );
      }

      const purchase = await createPurchase(trx, user, {
        supplierId,
        deviceId: req.auth!.device?.id ?? null,
        purchasedAt: initialStock.purchaseDate,
        notes: 'Initial stock on product creation',
        items: [
          {
            productId: created.id as string,
            unitId: input.baseUnitId,
            qty: initialStock.quantity,
            qtyBase: Math.round(initialStock.quantity),
            costPerBase: initialStock.costPerBase
          }
        ]
      });

      await writeAudit(trx, {
        userId: user.id,
        action: 'product.created',
        entity: 'products',
        entityId: created.id as string,
        details: {
          name: input.name,
          pricePerBase: input.pricePerBase,
          costPerBase: initialStock.costPerBase,
          initialStock: initialStock.quantity,
          purchaseId: (purchase as Record<string, unknown>).id
        }
      });

      return { product: created, purchase, supplierId };
    });

    const [hydrated] = await hydrate([result.product]);
    const supplierRow = result.supplierId
      ? ((await db('suppliers').where({ id: result.supplierId }).first()) as
          | Record<string, unknown>
          | undefined)
      : undefined;

    res.status(201).json({
      product: hydrated,
      purchase: result.purchase,
      supplier: supplierRow ? camelize(supplierRow) : null
    });
  })
);

productsRouter.patch(
  '/:id',
  authRequired,
  requireOwner,
  validateBody(updateSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const user = req.auth!.user;
    const body = req.body as z.infer<typeof updateSchema>;
    const existing = await getProduct(db, req.params.id as string);

    if (body.baseUnitId) {
      const baseUnit = await db('units').where({ id: body.baseUnitId }).first();
      if (!baseUnit || !baseUnit.is_base) {
        throw badRequest('Base unit must be piece, gram or millilitre', 'baseUnitId');
      }
    }
    if (body.categoryId) {
      const category = await db('categories').where({ id: body.categoryId }).first();
      if (!category) throw badRequest('Category not found', 'categoryId');
    }

    const updated = await db.transaction(async (trx) => {
      const patch: Record<string, unknown> = { updated_at: trx.fn.now() };
      const map: Record<string, string> = {
        name: 'name',
        sku: 'sku',
        barcode: 'barcode',
        categoryId: 'category_id',
        baseUnitId: 'base_unit_id',
        costPerBase: 'cost_per_base',
        pricePerBase: 'price_per_base',
        reorderLevelBase: 'reorder_level_base',
        expiryDate: 'expiry_date',
        isActive: 'is_active'
      };
      for (const [camel, column] of Object.entries(map)) {
        if (body[camel as keyof typeof body] !== undefined) {
          patch[column] = body[camel as keyof typeof body];
        }
      }
      const rows = (await trx('products')
        .where({ id: existing.id })
        .update(patch)
        .returning('*')) as Record<string, unknown>[];

      if (body.units) {
        await trx('product_units').where({ product_id: existing.id }).delete();
        const conversions = body.units.filter((u) => u.unitId !== (body.baseUnitId ?? existing.base_unit_id));
        if (conversions.length) {
          await trx('product_units').insert(
            conversions.map((u) => ({
              product_id: existing.id,
              unit_id: u.unitId,
              factor: u.factor,
              price_override: u.priceOverride ?? null
            }))
          );
        }
      }

      if (body.pricePerBase !== undefined && body.pricePerBase !== existing.price_per_base) {
        await writeAudit(trx, {
          userId: user.id,
          action: 'product.price_change',
          entity: 'products',
          entityId: existing.id,
          details: {
            field: 'price_per_base',
            from: existing.price_per_base,
            to: body.pricePerBase
          }
        });
      }
      if (body.costPerBase !== undefined && body.costPerBase !== existing.cost_per_base) {
        await writeAudit(trx, {
          userId: user.id,
          action: 'product.cost_change',
          entity: 'products',
          entityId: existing.id,
          details: {
            field: 'cost_per_base',
            from: existing.cost_per_base,
            to: body.costPerBase
          }
        });
      }
      return rows[0]!;
    });

    const row = (await db('products as p')
      .leftJoin('categories as c', 'c.id', 'p.category_id')
      .leftJoin('units as u', 'u.id', 'p.base_unit_id')
      .where('p.id', updated.id as string)
      .select('p.*', 'c.name as category_name', 'u.name as base_unit_name', 'u.symbol as base_unit_symbol')
      .first()) as Record<string, unknown>;
    const stockBase = await getStock(db, updated.id as string);
    const [hydrated] = await hydrate([row]);
    res.json({ product: { ...hydrated, stockBase } });
  })
);

productsRouter.delete(
  '/:id',
  authRequired,
  requireOwner,
  asyncHandler(async (req: Request, res: Response) => {
    const user = req.auth!.user;
    const existing = await getProduct(db, req.params.id as string);
    await db.transaction(async (trx) => {
      await trx('products')
        .where({ id: existing.id })
        .update({ deleted_at: trx.fn.now(), is_active: false, updated_at: trx.fn.now() });
      await writeAudit(trx, {
        userId: user.id,
        action: 'product.deleted',
        entity: 'products',
        entityId: existing.id,
        details: { name: existing.name }
      });
    });
    res.status(204).end();
  })
);

export const categoriesRouter = Router();

const categorySchema = z.object({
  name: z.string().min(1).max(80),
  color: z.string().max(20).nullable().optional()
});

categoriesRouter.get(
  '/',
  authRequired,
  asyncHandler(async (_req: Request, res: Response) => {
    const rows = (await db('categories').orderBy('name')) as Record<string, unknown>[];
    res.json({ categories: rows.map((r) => camelize(r)) });
  })
);

categoriesRouter.post(
  '/',
  authRequired,
  requireOwner,
  validateBody(categorySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as z.infer<typeof categorySchema>;
    const rows = (await db('categories')
      .insert({ name: body.name, color: body.color ?? null })
      .returning('*')) as Record<string, unknown>[];
    res.status(201).json({ category: camelize(rows[0]) });
  })
);

categoriesRouter.patch(
  '/:id',
  authRequired,
  requireOwner,
  validateBody(categorySchema.partial()),
  asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as Partial<z.infer<typeof categorySchema>>;
    const rows = (await db('categories')
      .where({ id: req.params.id })
      .update({ ...body, updated_at: db.fn.now() })
      .returning('*')) as Record<string, unknown>[];
    if (!rows[0]) throw notFound('Category not found');
    res.json({ category: camelize(rows[0]) });
  })
);

categoriesRouter.delete(
  '/:id',
  authRequired,
  requireOwner,
  asyncHandler(async (req: Request, res: Response) => {
    const deleted = await db('categories').where({ id: req.params.id }).del();
    if (!deleted) throw notFound('Category not found');
    res.status(204).end();
  })
);

export const unitsRouter = Router();

unitsRouter.get(
  '/',
  authRequired,
  asyncHandler(async (_req: Request, res: Response) => {
    const rows = (await db('units').orderBy('name')) as Record<string, unknown>[];
    res.json({ units: rows.map((r) => camelize(r)) });
  })
);
