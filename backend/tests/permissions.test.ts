import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';

const OWNER_DEVICE = '44444444-4444-4444-8444-444444444444';
const WORKER_DEVICE = '55555555-5555-4555-8555-555555555555';

describe('employee permissions', () => {
  it('creates an employee, forces a password change, and enforces permissions at the API', async () => {
    const setup = await request(app).post('/api/v1/auth/setup').send({
      businessName: 'Permission Duka',
      name: 'Permission Owner',
      email: 'owner@permissions.test',
      password: 'OwnerPass123',
      deviceId: OWNER_DEVICE,
      receiptPrefix: 'PRM'
    });
    expect(setup.status).toBe(201);
    const ownerAuth = { Authorization: `Bearer ${setup.body.accessToken as string}` };

    const created = await request(app)
      .post('/api/v1/users')
      .set(ownerAuth)
      .send({
        name: 'Test Worker',
        email: 'worker@permissions.test',
        phone: '0712345678',
        permissions: {
          'sales.make': true,
          'stock.view': false,
          'stock.receive': false,
          'stock.adjust': false,
          'sales.discount': false,
          'sales.void': false,
          'expenses.record': false,
          'reports.view': false
        }
      });
    expect(created.status).toBe(201);
    expect(created.body.credentials.email).toBe('worker@permissions.test');
    expect(created.body.credentials.phone).toBe('+255712345678');
    expect(created.body.user.phone).toBe('+255712345678');
    expect(created.body.credentials.tempPassword).toBeTruthy();
    expect(created.body.credentials.loginUrl).toContain('/login');
    expect(created.body.user.permissions['reports.view']).toBe(false);

    const workerId = created.body.user.id as string;
    const tempPassword = created.body.credentials.tempPassword as string;

    // Phone can be updated and is normalized; invalid numbers are rejected.
    const phoneUpdate = await request(app)
      .patch(`/api/v1/users/${workerId}`)
      .set(ownerAuth)
      .send({ phone: '0765432109' });
    expect(phoneUpdate.status).toBe(200);
    expect(phoneUpdate.body.user.phone).toBe('+255765432109');
    expect(
      (
        await request(app)
          .patch(`/api/v1/users/${workerId}`)
          .set(ownerAuth)
          .send({ phone: '12345' })
      ).status
    ).toBe(400);

    const firstLogin = await request(app).post('/api/v1/auth/login').send({
      email: 'worker@permissions.test',
      password: tempPassword,
      deviceId: WORKER_DEVICE,
      deviceName: 'Worker Phone'
    });
    expect(firstLogin.status).toBe(200);
    expect(firstLogin.body.mustChangePassword).toBe(true);

    const changed = await request(app)
      .post('/api/v1/auth/change-password')
      .set({ Authorization: `Bearer ${firstLogin.body.accessToken as string}` })
      .send({ currentPassword: tempPassword, newPassword: 'WorkerPass123' });
    expect(changed.status).toBe(200);

    const login = await request(app).post('/api/v1/auth/login').send({
      email: 'worker@permissions.test',
      password: 'WorkerPass123',
      deviceId: WORKER_DEVICE,
      deviceName: 'Worker Phone'
    });
    expect(login.status).toBe(200);
    expect(login.body.mustChangePassword).toBe(false);
    const workerAuth = { Authorization: `Bearer ${login.body.accessToken as string}` };

    // Allowed: authenticated product access and sales (has sales.make).
    expect((await request(app).get('/api/v1/products').set(workerAuth)).status).toBe(200);
    expect((await request(app).get('/api/v1/sales').set(workerAuth)).status).toBe(200);

    // Denied: reports, expenses, stock adjustments and owner-only user admin.
    expect((await request(app).get('/api/v1/reports/summary').set(workerAuth)).status).toBe(403);
    expect((await request(app).get('/api/v1/expenses').set(workerAuth)).status).toBe(403);
    expect(
      (
        await request(app)
          .post('/api/v1/stock/adjust')
          .set(workerAuth)
          .send({
            productId: '00000000-0000-4000-8000-000000000001',
            qtyBase: -1,
            reason: 'damaged'
          })
      ).status
    ).toBe(403);
    expect((await request(app).get('/api/v1/users').set(workerAuth)).status).toBe(403);
    expect(
      (
        await request(app)
          .post('/api/v1/users')
          .set(workerAuth)
          .send({ name: 'Another Worker', email: 'another@permissions.test' })
      ).status
    ).toBe(403);

    // Owner can see reports and users.
    expect((await request(app).get('/api/v1/reports/summary').set(ownerAuth)).status).toBe(200);
    expect((await request(app).get('/api/v1/users').set(ownerAuth)).status).toBe(200);

    // Audit records the employee creation (owner action, visible in the global audit log).
    const audit = await request(app).get('/api/v1/audit').set(ownerAuth);
    expect(audit.status).toBe(200);
    expect(
      (audit.body.audit as Array<{ action: string }>).some(
        (row) => row.action === 'employee_created'
      )
    ).toBe(true);

    // Disable blocks login; enable restores it.
    expect(
      (
        await request(app)
          .patch(`/api/v1/users/${workerId}`)
          .set(ownerAuth)
          .send({ isActive: false })
      ).status
    ).toBe(200);

    // An already-issued token is rejected immediately after deactivation.
    const disabledSession = await request(app).get('/api/v1/products').set(workerAuth);
    expect(disabledSession.status).toBe(403);
    expect(disabledSession.body.error.code).toBe('ACCOUNT_DISABLED');

    expect(
      (
        await request(app).post('/api/v1/auth/login').send({
          email: 'worker@permissions.test',
          password: 'WorkerPass123',
          deviceId: WORKER_DEVICE,
          deviceName: 'Worker Phone'
        })
      ).status
    ).toBe(403);
    expect(
      (
        await request(app)
          .patch(`/api/v1/users/${workerId}`)
          .set(ownerAuth)
          .send({ isActive: true })
      ).status
    ).toBe(200);
    expect(
      (
        await request(app).post('/api/v1/auth/login').send({
          email: 'worker@permissions.test',
          password: 'WorkerPass123',
          deviceId: WORKER_DEVICE,
          deviceName: 'Worker Phone'
        })
      ).status
    ).toBe(200);

    // Releasing the device invalidates the previously issued token.
    expect(
      (
        await request(app)
          .post(`/api/v1/users/${workerId}/release-device`)
          .set(ownerAuth)
      ).status
    ).toBe(200);
    expect((await request(app).get('/api/v1/products').set(workerAuth)).status).toBe(401);

    // Permanently delete an employee: removed from the list, login rejected,
    // and the owner account cannot be deleted.
    const doomed = await request(app)
      .post('/api/v1/users')
      .set(ownerAuth)
      .send({ name: 'Delete Me', email: 'delete@permissions.test' });
    expect(doomed.status).toBe(201);
    const doomedId = doomed.body.user.id as string;
    const deleted = await request(app)
      .delete(`/api/v1/users/${doomedId}`)
      .set(ownerAuth);
    expect(deleted.status).toBe(204);
    const usersAfter = await request(app).get('/api/v1/users').set(ownerAuth);
    expect(
      (usersAfter.body.users as Array<{ id: string }>).some((user) => user.id === doomedId)
    ).toBe(false);
    expect(
      (
        await request(app).post('/api/v1/auth/login').send({
          email: 'delete@permissions.test',
          password: doomed.body.credentials.tempPassword as string,
          deviceId: '66666666-6666-4666-8666-666666666666',
          deviceName: 'Deleted Phone'
        })
      ).status
    ).toBe(401);
    expect(
      (
        await request(app)
          .delete(`/api/v1/users/${setup.body.user.id as string}`)
          .set(ownerAuth)
      ).status
    ).toBe(403);
  });
});
