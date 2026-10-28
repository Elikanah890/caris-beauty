import Dexie, { type Table } from 'dexie';
import type {
  AppMeta,
  AuditLog,
  Business,
  Category,
  Customer,
  Device,
  Expense,
  OfflineCredential,
  Payment,
  Product,
  ProductUnit,
  Purchase,
  PurchaseItem,
  Sale,
  SaleItem,
  StockMovement,
  Supplier,
  SyncQueueItem,
  Unit,
  User
} from './types';

export class DukaDB extends Dexie {
  business!: Table<Business, string>;
  units!: Table<Unit, string>;
  categories!: Table<Category, string>;
  users!: Table<User, string>;
  devices!: Table<Device, string>;
  products!: Table<Product, string>;
  product_units!: Table<ProductUnit, string>;
  customers!: Table<Customer, string>;
  suppliers!: Table<Supplier, string>;
  purchases!: Table<Purchase, string>;
  purchase_items!: Table<PurchaseItem, string>;
  sales!: Table<Sale, string>;
  sale_items!: Table<SaleItem, string>;
  payments!: Table<Payment, string>;
  stock_movements!: Table<StockMovement, string>;
  expenses!: Table<Expense, string>;
  audit_log!: Table<AuditLog, string>;
  sync_queue!: Table<SyncQueueItem, string>;
  offline_credentials!: Table<OfflineCredential, string>;
  app_meta!: Table<AppMeta, string>;

  constructor() {
    super('duka_local');
    this.version(1).stores({
      business: 'id, updatedAt',
      units: 'id, name',
      categories: 'id, name, updatedAt',
      users: 'id, email, role, updatedAt',
      devices: 'id, userId, receiptPrefix, updatedAt',
      products: 'id, name, categoryId, baseUnitId, barcode, sku, updatedAt',
      product_units: 'id, productId, unitId, [productId+unitId], updatedAt',
      customers: 'id, name, phone, updatedAt',
      suppliers: 'id, name, updatedAt',
      purchases: 'id, purchasedAt, supplierId, createdBy, updatedAt',
      purchase_items: 'id, purchaseId, productId, createdAt',
      sales: 'id, receiptNo, soldAt, userId, customerId, status, deviceId, updatedAt',
      sale_items: 'id, saleId, productId, createdAt',
      payments: 'id, saleId, tender, isReversed, updatedAt',
      stock_movements: 'id, productId, movementType, referenceId, createdAt',
      expenses: 'id, spentAt, category, userId, updatedAt',
      audit_log: 'id, userId, action, entity, entityId, createdAt',
      sync_queue: 'id, entity, createdAt, status',
      localAuth: 'email, deviceId',
      app_meta: 'key'
    });
    this.version(2).stores({
      localAuth: null,
      offline_credentials: 'email, updatedAt'
    });
  }
}

export const db = new DukaDB();

export async function getMeta(key: string): Promise<string | null> {
  const row = await db.app_meta.get(key);
  return row?.value ?? null;
}

export async function setMeta(key: string, value: string): Promise<void> {
  await db.app_meta.put({ key, value });
}

export async function getActiveBusiness(): Promise<Business | null> {
  const rows = await db.business.toArray();
  return rows.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))[0] ?? null;
}

export async function clearLocalAuth(): Promise<void> {
  await db.offline_credentials.clear();
  await db.app_meta.delete('activeEmail');
  if (typeof window !== 'undefined') {
    window.sessionStorage.removeItem('duka_unlocked_email');
  }
}

export async function getDeviceForUser(userId: string): Promise<Device | null> {
  const user = await db.users.get(userId);
  if (user?.deviceId) {
    const device = await db.devices.get(user.deviceId);
    if (device) return device;
  }
  return db.devices.where('userId').equals(userId).first().then((d) => d ?? null);
}
