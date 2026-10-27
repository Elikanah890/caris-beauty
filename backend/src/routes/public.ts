import { Router } from 'express';
import { db } from '../db';
import { asyncHandler } from '../lib/errors';

export const publicRouter = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function displayPrice(
  product: { price_per_base: number; base_unit_symbol: string },
  conversions: { factor: number; price_override: number | null; unit_symbol: string }[]
) {
  const basePrice = Number(product.price_per_base);

  if (product.base_unit_symbol === 'pc') {
    return { price: basePrice, displayUnit: 'each' };
  }

  const pack = conversions
    .filter((conversion) => conversion.price_override !== null && Number(conversion.factor) > 1)
    .sort((a, b) => Number(a.factor) - Number(b.factor))[0];

  if (pack) {
    return {
      price: Number(pack.price_override),
      displayUnit: `${Number(pack.factor)} ${pack.unit_symbol}`
    };
  }

  return { price: basePrice, displayUnit: product.base_unit_symbol };
}

publicRouter.get(
  '/products',
  asyncHandler(async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
    const category = typeof req.query.category === 'string' ? req.query.category.trim() : '';
    const limit = Math.min(
      Math.max(Number.parseInt(String(req.query.limit ?? '100'), 10) || 100, 1),
      100
    );
    const offset = Math.max(Number.parseInt(String(req.query.offset ?? '0'), 10) || 0, 0);

    const stockSub = db('stock_movements')
      .select('product_id')
      .sum({ stock_base: 'qty_base' })
      .groupBy('product_id')
      .as('sm');

    const query = db('products as p')
      .leftJoin('categories as c', 'c.id', 'p.category_id')
      .join('units as u', 'u.id', 'p.base_unit_id')
      .leftJoin(stockSub, 'sm.product_id', 'p.id')
      .whereNull('p.deleted_at')
      .where('p.is_active', true);

    if (q) {
      query.where((builder) => {
        builder.whereILike('p.name', `%${q}%`).orWhereILike('p.sku', `%${q}%`);
      });
    }

    if (category) {
      const categoryRow = UUID_RE.test(category)
        ? await db('categories').where({ id: category }).first()
        : await db('categories').whereRaw('lower(name) = lower(?)', [category]).first();
      if (!categoryRow) {
        res.set('Cache-Control', 'public, max-age=30');
        return res.json({ products: [], total: 0 });
      }
      query.where('p.category_id', categoryRow.id);
    }

    const totalRow = await query
      .clone()
      .clearSelect()
      .clearOrder()
      .count({ count: 'p.id' })
      .first();
    const total = Number(totalRow?.count ?? 0);

    const rows = (await query
      .select(
        'p.id',
        'p.name',
        'p.sku',
        'p.category_id',
        'c.name as category_name',
        'p.price_per_base',
        'u.symbol as base_unit_symbol',
        db.raw('COALESCE(sm.stock_base, 0)::bigint as stock_base')
      )
      .orderBy('p.name', 'asc')
      .limit(limit)
      .offset(offset)) as {
      id: string;
      name: string;
      sku: string | null;
      category_id: string | null;
      category_name: string | null;
      price_per_base: number;
      base_unit_symbol: string;
      stock_base: number;
    }[];

    const conversions = await db('product_units as pu')
      .join('units as u', 'u.id', 'pu.unit_id')
      .whereIn(
        'pu.product_id',
        rows.map((row) => row.id)
      )
      .select(
        'pu.product_id',
        'pu.factor',
        'pu.price_override',
        'u.symbol as unit_symbol'
      );

    const byProduct = new Map<string, typeof conversions>();
    for (const conversion of conversions) {
      const list = byProduct.get(conversion.product_id) ?? [];
      list.push(conversion);
      byProduct.set(conversion.product_id, list);
    }

    res.set('Cache-Control', 'public, max-age=30');
    res.json({
      products: rows.map((row) => {
        const pricing = displayPrice(row, byProduct.get(row.id) ?? []);
        return {
          id: row.id,
          name: row.name,
          sku: row.sku,
          categoryId: row.category_id,
          categoryName: row.category_name,
          price: pricing.price,
          displayUnit: pricing.displayUnit,
          inStock: Number(row.stock_base) > 0
        };
      }),
      total
    });
  })
);

publicRouter.get(
  '/categories',
  asyncHandler(async (_req, res) => {
    const counts = db('products')
      .select('category_id')
      .count({ product_count: 'id' })
      .whereNull('deleted_at')
      .where('is_active', true)
      .whereNotNull('category_id')
      .groupBy('category_id')
      .as('pc');

    const rows = (await db('categories as c')
      .leftJoin(counts, 'pc.category_id', 'c.id')
      .select('c.id', 'c.name', 'c.color')
      .select(db.raw('COALESCE(pc.product_count, 0)::int AS product_count'))
      .orderBy('c.name')) as {
      id: string;
      name: string;
      color: string | null;
      product_count: number;
    }[];

    res.set('Cache-Control', 'public, max-age=60');
    res.json({
      categories: rows.map((row) => ({
        id: row.id,
        name: row.name,
        color: row.color,
        productCount: row.product_count
      }))
    });
  })
);
