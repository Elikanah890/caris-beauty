import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';

const OWNER_DEVICE = '33333333-3333-4333-8333-333333333333';
const GRAM = '00000000-0000-4000-8000-000000000002';

describe('public catalog', () => {
  it('lists inventory categories with active product counts without authentication', async () => {
    const setup = await request(app).post('/api/v1/auth/setup').send({
      businessName: 'Loveness Beauty',
      name: 'Loveness Owner',
      email: 'owner@public-catalog.test',
      password: 'OwnerPass123',
      deviceId: OWNER_DEVICE,
      deviceName: 'Owner Phone',
      receiptPrefix: 'LOV'
    });
    expect(setup.status).toBe(201);
    const auth = { Authorization: `Bearer ${setup.body.accessToken as string}` };

    const skinCare = await request(app)
      .post('/api/v1/categories')
      .set(auth)
      .send({ name: 'Skin care' });
    expect(skinCare.status).toBe(201);

    const nailCare = await request(app)
      .post('/api/v1/categories')
      .set(auth)
      .send({ name: 'Nail care' });
    expect(nailCare.status).toBe(201);

    const product = await request(app).post('/api/v1/products/with-stock').set(auth).send({
      product: {
        name: 'Face Wash',
        categoryId: skinCare.body.category.id,
        baseUnitId: GRAM,
        pricePerBase: 2000
      },
      initialStock: {
        quantity: 5,
        costPerBase: 1000,
        supplierName: 'Mbeya Wholesale'
      }
    });
    expect(product.status).toBe(201);
    expect(product.body.purchase.items).toHaveLength(1);
    expect(product.body.supplier.name).toBe('Mbeya Wholesale');

    const addStockViaAdjustment = await request(app)
      .post('/api/v1/stock/adjust')
      .set(auth)
      .send({ productId: product.body.product.id, qtyBase: 5, reason: 'other' });
    expect(addStockViaAdjustment.status).toBe(400);
    expect(addStockViaAdjustment.body.error.message).toContain('Record Stock Purchase');

    const products = await request(app).get('/api/v1/public/products');
    expect(products.status).toBe(200);
    expect(products.body.total).toBe(1);
    expect(products.body.products).toHaveLength(1);
    expect(products.body.products[0]).toMatchObject({
      id: product.body.product.id,
      name: 'Face Wash',
      categoryId: skinCare.body.category.id,
      categoryName: 'Skin care',
      price: 2000,
      displayUnit: 'g',
      inStock: true
    });
    expect(products.body.products[0].costPerBase).toBeUndefined();

    const filtered = await request(app).get(
      `/api/v1/public/products?category=${skinCare.body.category.id}`
    );
    expect(filtered.status).toBe(200);
    expect(filtered.body.products).toHaveLength(1);

    const empty = await request(app).get(
      `/api/v1/public/products?category=${nailCare.body.category.id}`
    );
    expect(empty.status).toBe(200);
    expect(empty.body.products).toHaveLength(0);

    const response = await request(app).get('/api/v1/public/categories');
    expect(response.status).toBe(200);

    const categories = response.body.categories as {
      name: string;
      color: string | null;
      productCount: number;
    }[];
    const byName = new Map(categories.map((category) => [category.name, category]));

    expect(byName.get('Skin care')).toMatchObject({ productCount: 1, color: null });
    expect(byName.get('Nail care')).toMatchObject({ productCount: 0, color: null });

    const unauthReset = await request(app).post('/api/v1/sync/reset');
    expect(unauthReset.status).toBe(401);

    const reset = await request(app).post('/api/v1/sync/reset').set(auth);
    expect(reset.status).toBe(200);
    expect(reset.body.ok).toBe(true);

    const stillThere = await request(app).get('/api/v1/public/products');
    expect(stillThere.body.total).toBe(1);

    const deleted = await request(app)
      .delete(`/api/v1/products/${product.body.product.id}`)
      .set(auth);
    expect(deleted.status).toBe(204);

    const afterDelete = await request(app).get('/api/v1/public/products');
    expect(afterDelete.body.total).toBe(0);

    const pull = await request(app)
      .post('/api/v1/sync/pull')
      .set(auth)
      .send({ since: new Date(0).toISOString() });
    expect(pull.status).toBe(200);
    expect(pull.body.deletions.products).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: product.body.product.id })
      ])
    );

    const resurrection = await request(app)
      .post('/api/v1/sync/push')
      .set(auth)
      .send({
        batch: [
          {
            id: '99999999-9999-4999-8999-999999999999',
            entity: 'products',
            op: 'update',
            payload: {
              id: product.body.product.id,
              name: 'Face Wash',
              categoryId: skinCare.body.category.id,
              baseUnitId: GRAM,
              costPerBase: 1000,
              pricePerBase: 2000,
              updatedAt: new Date().toISOString()
            }
          }
        ]
      });
    expect(resurrection.status).toBe(200);
    expect(resurrection.body.results[0].status).toBe('error');
    expect(resurrection.body.results[0].reason).toMatch(/deleted on the server/i);
  });
});
