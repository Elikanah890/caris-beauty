import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { app } from '../src/app';

const DEVICE = '33333333-3333-4333-8333-333333333333';
const GRAM = '00000000-0000-4000-8000-000000000002';
const KILOGRAM = '00000000-0000-4000-8000-000000000004';

describe('offline sync', () => {
  it('pushes an offline sale envelope and pulls the changed rows', async () => {
    const setup = await request(app).post('/api/v1/auth/setup').send({
      businessName: 'Sync Duka',
      name: 'Sync Owner',
      email: 'sync@duka.test',
      password: 'SyncPass123',
      deviceId: DEVICE,
      receiptPrefix: 'SYN'
    });
    expect(setup.status).toBe(201);
    const auth = { Authorization: `Bearer ${setup.body.accessToken}` };

    const productRes = await request(app).post('/api/v1/products').set(auth).send({
      name: 'Rice',
      baseUnitId: GRAM,
      costPerBase: 1,
      pricePerBase: 2,
      units: [{ unitId: KILOGRAM, factor: 1000, priceOverride: 2000 }]
    });
    const productId = productRes.body.product.id as string;

    await request(app).post('/api/v1/purchases').set(auth).send({
      items: [{ productId, unitId: KILOGRAM, qty: 3, costPerUnit: 1000 }]
    });

    const saleId = randomUUID();
    const saleItemId = randomUUID();
    const paymentId = randomUUID();
    const movementId = randomUUID();
    const queueId = randomUUID();

    const pushRes = await request(app)
      .post('/api/v1/sync/push')
      .set(auth)
      .send({
        batch: [
          {
            id: queueId,
            entity: 'sales',
            op: 'create',
            payload: {
              id: saleId,
              receiptNo: 'SYN-000777',
              deviceId: DEVICE,
              soldAt: new Date().toISOString(),
              items: [
                {
                  id: saleItemId,
                  productId,
                  unitId: KILOGRAM,
                  qty: 1,
                  qtyBase: 1000,
                  movementId
                }
              ],
              discount: 0,
              payments: [{ id: paymentId, tender: 'mpesa', amount: 2000, reference: 'MP123' }]
            }
          }
        ]
      });
    expect(pushRes.status).toBe(200);
    expect(pushRes.body.results[0].status).toBe('ok');

    const saleRes = await request(app).get(`/api/v1/sales/${saleId}`).set(auth);
    expect(saleRes.status).toBe(200);
    expect(saleRes.body.sale.receiptNo).toBe('SYN-000777');
    expect(saleRes.body.sale.total).toBe(2000);
    expect(saleRes.body.sale.payments[0].tender).toBe('mpesa');

    const stockRes = await request(app).get(`/api/v1/products/${productId}/stock`).set(auth);
    expect(stockRes.body.stockBase).toBe(2000);

    const pullRes = await request(app)
      .post('/api/v1/sync/pull')
      .set(auth)
      .send({ since: new Date(0).toISOString() });
    expect(pullRes.status).toBe(200);
    expect(pullRes.body.tables.products.length).toBeGreaterThan(0);
    expect(pullRes.body.tables.sales.some((s: { id: string }) => s.id === saleId)).toBe(true);
    expect(JSON.stringify(pullRes.body.tables.users)).not.toContain('password_hash');
  });

  it('is idempotent when the same queue row is pushed twice', async () => {
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'sync@duka.test', password: 'SyncPass123', deviceId: DEVICE });
    const auth = { Authorization: `Bearer ${login.body.accessToken}` };
    const batch = [
      {
        id: randomUUID(),
        entity: 'expenses',
        op: 'create',
        payload: {
          id: randomUUID(),
          category: 'Transport',
          description: 'Boda',
          amount: 3000,
          paidVia: 'cash',
          spentAt: new Date().toISOString()
        }
      }
    ];
    const first = await request(app).post('/api/v1/sync/push').set(auth).send({ batch });
    const second = await request(app).post('/api/v1/sync/push').set(auth).send({ batch });
    expect(first.body.results[0].status).toBe('ok');
    expect(second.body.results[0].status).toBe('ok');

    const expenses = await request(app).get('/api/v1/expenses').set(auth);
    expect(expenses.body.expenses.length).toBe(1);
  });
});
