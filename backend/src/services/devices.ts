import type { Db } from '../db';
import { conflict } from '../lib/errors';
import { isUuid, receiptPrefix, uuid } from '../lib/ids';

interface DeviceRow {
  id: string;
  receipt_prefix: string;
  name: string;
  user_id: string | null;
  last_receipt_seq: number;
}

async function buildPrefix(trx: Db, desired?: string): Promise<string> {
  const business = (await trx('business').select('name').first()) as
    | { name: string }
    | undefined;
  const root = desired?.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) ??
    receiptPrefix(business?.name ?? 'Duka');

  let candidate = root;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const exists = await trx('devices').where({ receipt_prefix: candidate }).first();
    if (!exists) return candidate;
    candidate = `${root.slice(0, 5)}${String(10 + attempt).slice(-2)}${Math.floor(Math.random() * 90 + 10)}`;
    candidate = candidate.slice(0, 8);
  }
  return `${root.slice(0, 4)}${Date.now().toString().slice(-4)}`;
}

/**
 * Bind a client-generated UUID device to a user. One email = one active device.
 * Throws DEVICE_LOCKED when another device is already bound.
 */
export async function bindDevice(
  trx: Db,
  input: {
    userId: string;
    deviceId: string;
    deviceName?: string;
    desiredPrefix?: string;
  }
): Promise<DeviceRow> {
  if (!isUuid(input.deviceId)) {
    throw conflict('INVALID_DEVICE', 'Device id must be a UUID v4');
  }

  const user = (await trx('users').where({ id: input.userId }).first()) as
    | { id: string; device_id: string | null; role: 'owner' | 'employee' }
    | undefined;
  if (!user) throw conflict('USER_NOT_FOUND', 'User not found');

  const existingBinding = user.device_id
    ? ((await trx('devices').where({ id: user.device_id }).first()) as DeviceRow | undefined)
    : undefined;

  if (existingBinding && existingBinding.id !== input.deviceId) {
    if (user.role === 'owner') {
      // Owner: auto-release old device and allow rebind. Password is
      // sufficient proof of identity for the shop owner.
      await trx('devices')
        .where({ id: existingBinding.id })
        .update({
          user_id: null,
          released_at: trx.fn.now(),
          updated_at: trx.fn.now()
        });
      await trx('users')
        .where({ id: input.userId })
        .update({ device_id: null, updated_at: trx.fn.now() });
    } else {
      // Employee: strict device binding. Owner must release via Staff.
      throw conflict(
        'DEVICE_LOCKED',
        'This account is locked to another device. Ask the owner to release it first.'
      );
    }
  }

  const target = (await trx('devices').where({ id: input.deviceId }).first()) as
    | DeviceRow
    | undefined;

  if (target) {
    if (target.user_id && target.user_id !== input.userId) {
      throw conflict('DEVICE_LOCKED', 'This device is registered to another account');
    }
    const updated = (await trx('devices')
      .where({ id: target.id })
      .update({
        user_id: input.userId,
        name: input.deviceName || target.name,
        released_at: null,
        updated_at: trx.fn.now()
      })
      .returning('*')) as DeviceRow[];
    await trx('users')
      .where({ id: input.userId })
      .update({ device_id: target.id, updated_at: trx.fn.now() });
    return updated[0] as DeviceRow;
  }

  const prefix = await buildPrefix(trx, input.desiredPrefix);
  const inserted = (await trx('devices')
    .insert({
      id: input.deviceId,
      receipt_prefix: prefix,
      name: input.deviceName || 'Duka Device',
      user_id: input.userId
    })
    .returning('*')) as DeviceRow[];

  await trx('users')
    .where({ id: input.userId })
    .update({ device_id: input.deviceId, updated_at: trx.fn.now() });

  return inserted[0] as DeviceRow;
}

export async function ensureDeviceForUser(
  trx: Db,
  userId: string,
  deviceName = 'Duka Device'
): Promise<DeviceRow> {
  const user = (await trx('users').where({ id: userId }).first()) as
    | { device_id: string | null }
    | undefined;
  if (user?.device_id) {
    const device = (await trx('devices').where({ id: user.device_id }).first()) as
      | DeviceRow
      | undefined;
    if (device) return device;
  }
  return bindDevice(trx, { userId, deviceId: uuid(), deviceName });
}

export async function releaseDevice(trx: Db, userId: string): Promise<void> {
  const user = (await trx('users').where({ id: userId }).first()) as
    | { device_id: string | null }
    | undefined;
  if (!user?.device_id) return;
  await trx('devices')
    .where({ id: user.device_id })
    .update({ user_id: null, released_at: trx.fn.now(), updated_at: trx.fn.now() });
  await trx('users')
    .where({ id: userId })
    .update({ device_id: null, updated_at: trx.fn.now() });
}

export async function nextReceiptNumber(
  trx: Db,
  deviceId: string
): Promise<{ receiptNo: string; seq: number }> {
  const device = (await trx('devices')
    .where({ id: deviceId })
    .forUpdate()
    .first()) as DeviceRow | undefined;
  if (!device) throw conflict('DEVICE_NOT_FOUND', 'Device is not registered');

  const seq = Number(device.last_receipt_seq) + 1;
  await trx('devices')
    .where({ id: deviceId })
    .update({ last_receipt_seq: seq, updated_at: trx.fn.now() });
  return {
    receiptNo: `${device.receipt_prefix}-${String(seq).padStart(6, '0')}`,
    seq
  };
}

export async function bumpReceiptSequence(
  trx: Db,
  deviceId: string,
  receiptNo: string
): Promise<void> {
  const match = /-(\d+)$/.exec(receiptNo);
  if (!match) return;
  const seq = Number(match[1]);
  if (!Number.isFinite(seq)) return;
  const device = (await trx('devices').where({ id: deviceId }).forUpdate().first()) as
    | DeviceRow
    | undefined;
  if (device && seq > Number(device.last_receipt_seq)) {
    await trx('devices')
      .where({ id: deviceId })
      .update({ last_receipt_seq: seq, updated_at: trx.fn.now() });
  }
}
