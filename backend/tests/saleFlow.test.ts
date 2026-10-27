import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';

const OWNER_DEVICE = '11111111-1111-4111-8111-111111111111';
const EMPLOYEE_DEVICE = '22222222-2222-4222-8222-222222222222';
const GRAM = '00000000-0000-4000-8000-000000000002';
const KILOGRAM = '00000000-0000-4000-8000-000000000004';

async function setupOwner() {
  const res = await request(app).post('/api/v1/auth/setup').send({
    businessName: 'Karera Duka',
    name: 'Karera Owner',
    email: 'owner@example.test',
    password: 'OwnerPass123',
    deviceId: OWNER_DEVICE,
    deviceName: 'Owner Phone',
    receiptPrefix: 'KAR'
  });
  expect(res.status).toBe(201);
  return {
    token: res.body.accessToken as string,
    device: res.body.device as { id: string; receiptPrefix: string },
    owner: res.body.user as { id: string }
  };
}

describe('full sale flow', () => {
  it('sets up owner, receives stock, sells in kilograms, voids and reconciles', async () => {
    const { token, device } = await setupOwner();
    const auth = { Authorization: `Bearer ${token}` };

    const productRes = await request(app)
      .post('/api/v1/products')
      .set(auth)
      .send({
        name: 'Sugar',
        baseUnitId: GRAM,
        costPerBase: 2,
        pricePerBase: 3,
        units: [{ unitId: KILOGRAM, factor: 1000, priceOverride: 2500 }]
      });
    expect(productRes.status).toBe(201);
    const productId = productRes.body.product.id as string;

    const purchaseRes = await request(app)
      .post('/api/v1/purchases')
      .set(auth)
      .send({
        supplierId: null,
        items: [
          {
            productId,
            unitId: KILOGRAM,
            qty: 5,
            costPerUnit: 2000
          }
        ]
      });
    expect(purchaseRes.status).toBe(201);
    expect(purchaseRes.body.purchase.totalCost).toBe(10000);

    const stockAfterPurchase = await request(app)
      .get(`/api/v1/products/${productId}/stock`)
      .set(auth);
    expect(stockAfterPurchase.status).toBe(200);
    expect(stockAfterPurchase.body.stockBase).toBe(5000);

    const saleRes = await request(app)
      .post('/api/v1/sales')
      .set(auth)
      .send({
        items: [{ productId, unitId: KILOGRAM, qty: 2, qtyBase: 2000 }],
        payments: [{ tender: 'cash', amount: 5000 }]
      });
    expect(saleRes.status).toBe(201);
    const sale = saleRes.body.sale;
    expect(sale.subtotal).toBe(5000);
    expect(sale.total).toBe(5000);
    expect(sale.receiptNo).toBe('KAR-000001');
    expect(sale.items[0].qtyBase).toBe(2000);
    expect(sale.items[0].profit).toBe(1000);
    expect(device.receiptPrefix).toBe('KAR');

    const stockAfterSale = await request(app)
      .get(`/api/v1/products/${productId}/stock`)
      .set(auth);
    expect(stockAfterSale.body.stockBase).toBe(3000);

    const summaryRes = await request(app)
      .get('/api/v1/reports/summary?period=today')
      .set(auth);
    expect(summaryRes.status).toBe(200);
    expect(summaryRes.body.summary.sales).toBe(5000);
    expect(summaryRes.body.summary.cogs).toBe(4000);
    expect(summaryRes.body.summary.grossProfit).toBe(1000);
    expect(summaryRes.body.summary.tenderBreakdown.cash).toBe(5000);

    const voidRes = await request(app).post(`/api/v1/sales/${sale.id}/void`).set(auth);
    expect(voidRes.status).toBe(200);
    expect(voidRes.body.sale.status).toBe('voided');

    const stockAfterVoid = await request(app)
      .get(`/api/v1/products/${productId}/stock`)
      .set(auth);
    expect(stockAfterVoid.body.stockBase).toBe(5000);

    const summaryAfterVoid = await request(app)
      .get('/api/v1/reports/summary?period=today')
      .set(auth);
    expect(summaryAfterVoid.body.summary.sales).toBe(0);
    expect(summaryAfterVoid.body.summary.saleCount).toBe(0);

    const movements = await request(app)
      .get(`/api/v1/products/${productId}/movements`)
      .set(auth);
    const types = movements.body.movements.map((m: { movementType: string }) => m.movementType);
    expect(types).toContain('purchase');
    expect(types).toContain('sale');
    expect(types).toContain('return');
  });

  it('rejects a mismatched client qtyBase and payment totals', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'owner@example.test', password: 'OwnerPass123', deviceId: OWNER_DEVICE });
    expect(res.status).toBe(200);
    const auth = { Authorization: `Bearer ${res.body.accessToken}` };

    const products = await request(app).get('/api/v1/products?q=Sugar').set(auth);
    const productId = products.body.products[0].id as string;

    const mismatch = await request(app)
      .post('/api/v1/sales')
      .set(auth)
      .send({
        items: [{ productId, unitId: KILOGRAM, qty: 1, qtyBase: 50 }],
        payments: [{ tender: 'cash', amount: 2500 }]
      });
    expect(mismatch.status).toBe(400);
    expect(mismatch.body.error.code).toBe('BAD_REQUEST');

    const badPayment = await request(app)
      .post('/api/v1/sales')
      .set(auth)
      .send({
        items: [{ productId, unitId: KILOGRAM, qty: 1 }],
        payments: [{ tender: 'cash', amount: 1000 }]
      });
    expect(badPayment.status).toBe(400);
    expect(badPayment.body.error.field).toBe('payments');
  });

  it('uses the entered per-unit purchase cost for line totals', async () => {
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'owner@example.test', password: 'OwnerPass123', deviceId: OWNER_DEVICE });
    const auth = { Authorization: `Bearer ${login.body.accessToken}` };

    const productRes = await request(app).post('/api/v1/products').set(auth).send({
      name: 'Test Oil',
      baseUnitId: GRAM,
      costPerBase: 3,
      pricePerBase: 5,
      units: [{ unitId: KILOGRAM, factor: 1000, priceOverride: 4500 }]
    });
    const productId = productRes.body.product.id as string;

    const purchase = await request(app)
      .post('/api/v1/purchases')
      .set(auth)
      .send({
        items: [
          {
            productId,
            unitId: KILOGRAM,
            qty: 1,
            costPerUnit: 2500,
            costPerBase: 3
          }
        ]
      });

    expect(purchase.status).toBe(201);
    expect(purchase.body.purchase.totalCost).toBe(2500);
    expect(purchase.body.purchase.items[0].lineTotal).toBe(2500);
    expect(purchase.body.purchase.items[0].costPerBase).toBe(3);
  });

  it('enforces employee permissions on the backend', async () => {
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'owner@example.test', password: 'OwnerPass123', deviceId: OWNER_DEVICE });
    const ownerAuth = { Authorization: `Bearer ${login.body.accessToken}` };

    const created = await request(app)
      .post('/api/v1/users')
      .set(ownerAuth)
      .send({
        name: 'Asha Employee',
        email: 'staff@example.test',
        permissions: { 'sales.make': true, 'stock.view': true }
      });
    expect(created.status).toBe(201);
    const tempPassword = created.body.tempPassword as string;
    expect(tempPassword).toMatch(/^Duka-/);

    const employeeLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'staff@example.test',
        password: tempPassword,
        deviceId: EMPLOYEE_DEVICE
      });
    expect(employeeLogin.status).toBe(200);
    expect(employeeLogin.body.mustChangePassword).toBe(true);
    const employeeAuth = { Authorization: `Bearer ${employeeLogin.body.accessToken}` };

    const changed = await request(app)
      .post('/api/v1/auth/change-password')
      .set(employeeAuth)
      .send({ currentPassword: tempPassword, newPassword: 'EmployeePass789' });
    expect(changed.status).toBe(200);

    const products = await request(app).get('/api/v1/products?q=Sugar').set(employeeAuth);
    const productId = products.body.products[0].id as string;
    const sale = await request(app)
      .post('/api/v1/sales')
      .set(employeeAuth)
      .send({
        items: [{ productId, unitId: KILOGRAM, qty: 1 }],
        payments: [{ tender: 'cash', amount: 2500 }]
      });
    expect(sale.status).toBe(201);

    const voidAttempt = await request(app)
      .post(`/api/v1/sales/${sale.body.sale.id}/void`)
      .set(employeeAuth);
    expect(voidAttempt.status).toBe(403);
    expect(voidAttempt.body.error.code).toBe('FORBIDDEN');

    const productAttempt = await request(app)
      .post('/api/v1/products')
      .set(employeeAuth)
      .send({ name: 'Nope', baseUnitId: GRAM, costPerBase: 1, pricePerBase: 2 });
    expect(productAttempt.status).toBe(403);

    const reportAttempt = await request(app)
      .get('/api/v1/reports/summary?period=today')
      .set(employeeAuth);
    expect(reportAttempt.status).toBe(403);
  });
});
