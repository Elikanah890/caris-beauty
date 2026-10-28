import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';

const DEVICE_A = '33333333-3333-4333-8333-333333333333';
const DEVICE_B = '44444444-4444-4444-8444-444444444444';

describe('multi-device auth', () => {
  it('allows several devices, lists them, and revokes one independently', async () => {
    const setup = await request(app).post('/api/v1/auth/setup').send({
      businessName: 'Multi Device Shop',
      name: 'Multi Owner',
      email: 'multi@example.test',
      password: 'MultiPass123',
      deviceId: DEVICE_A,
      deviceName: 'Counter A',
      receiptPrefix: 'MDS'
    });
    expect(setup.status).toBe(201);
    const tokenA = setup.body.accessToken as string;

    const agentB = request.agent(app);
    const loginB = await agentB.post('/api/v1/auth/login').send({
      email: 'multi@example.test',
      password: 'MultiPass123',
      deviceId: DEVICE_B,
      deviceName: 'Counter B'
    });
    expect(loginB.status).toBe(200);
    const tokenB = loginB.body.accessToken as string;
    expect(loginB.body.device.id).toBe(DEVICE_B);

    const loginBAgain = await request(app).post('/api/v1/auth/login').send({
      email: 'multi@example.test',
      password: 'MultiPass123',
      deviceId: DEVICE_B,
      deviceName: 'Counter B'
    });
    expect(loginBAgain.status).toBe(200);

    const list = await request(app)
      .get('/api/v1/devices')
      .set({ Authorization: `Bearer ${tokenA}` });
    expect(list.status).toBe(200);
    expect(list.body.devices).toHaveLength(2);

    const revoke = await request(app)
      .post(`/api/v1/devices/${DEVICE_B}/revoke`)
      .set({ Authorization: `Bearer ${tokenA}` });
    expect(revoke.status).toBe(204);

    const oldDevice = await request(app)
      .get('/api/v1/devices')
      .set({ Authorization: `Bearer ${tokenB}` });
    expect(oldDevice.status).toBe(401);
    expect(oldDevice.body.error.code).toBe('DEVICE_REVOKED');

    const refreshB = await agentB.post('/api/v1/auth/refresh');
    expect(refreshB.status).toBe(401);
    expect(refreshB.body.error.code).toBe('DEVICE_REVOKED');

    const listAfter = await request(app)
      .get('/api/v1/devices')
      .set({ Authorization: `Bearer ${tokenA}` });
    expect(listAfter.body.devices).toHaveLength(1);

    const rebind = await request(app).post('/api/v1/auth/login').send({
      email: 'multi@example.test',
      password: 'MultiPass123',
      deviceId: DEVICE_B,
      deviceName: 'Counter B again'
    });
    expect(rebind.status).toBe(200);
  });
});
