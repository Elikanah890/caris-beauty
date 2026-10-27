export type Role = 'owner' | 'employee';
export type Tender = 'cash' | 'mpesa' | 'tigopesa' | 'airtel' | 'bank' | 'credit';

export const PERMISSION_FLAGS = [
  'sales.make',
  'stock.view',
  'stock.receive',
  'stock.adjust',
  'sales.discount',
  'sales.void',
  'expenses.record',
  'reports.view'
] as const;

export type PermissionFlag = (typeof PERMISSION_FLAGS)[number];
export type Permissions = Record<PermissionFlag, boolean>;

export const OWNER_PERMISSIONS: Permissions = Object.fromEntries(
  PERMISSION_FLAGS.map((flag) => [flag, true])
) as Permissions;

export interface Business {
  id: string;
  name: string;
  tin?: string | null;
  vrn?: string | null;
  efdDeviceId?: string | null;
  phone?: string | null;
  address?: string | null;
  receiptFooter?: string | null;
  currency?: string;
  timezone?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Unit {
  id: string;
  name: string;
  symbol: string;
  isBase: boolean;
}

export interface Category {
  id: string;
  name: string;
  color?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface Device {
  id: string;
  receiptPrefix: string;
  name: string;
  userId: string | null;
  lastReceiptSeq: number;
  releasedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  phone?: string | null;
  role: Role;
  permissions: Permissions;
  isActive: boolean;
  mustChangePassword: boolean;
  deviceId: string | null;
  lastLoginAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string | null;
  device?: {
    id: string;
    receiptPrefix: string;
    name: string;
  } | null;
}

export interface ProductUnit {
  id: string;
  productId: string;
  unitId: string;
  unitName?: string;
  unitSymbol?: string;
  factor: number;
  priceOverride: number | null;
  isBase?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface Product {
  id: string;
  name: string;
  sku?: string | null;
  barcode?: string | null;
  categoryId?: string | null;
  categoryName?: string | null;
  baseUnitId: string;
  baseUnitName?: string | null;
  baseUnitSymbol?: string | null;
  costPerBase: number;
  pricePerBase: number;
  reorderLevelBase: number;
  expiryDate?: string | null;
  isActive: boolean;
  deletedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  stockBase?: number;
  units?: ProductUnit[];
}

export interface UnitChoice {
  unitId: string;
  unitName: string;
  unitSymbol: string;
  factor: number;
  pricePerUnit: number;
  isBase: boolean;
}

export interface Customer {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  creditLimit: number;
  notes?: string | null;
  isActive: boolean;
  deletedAt?: string | null;
  creditOwed?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface Supplier {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  deletedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface SaleItem {
  id: string;
  saleId: string;
  productId: string | null;
  productName: string;
  unitId: string | null;
  unitSymbol: string;
  qty: number;
  qtyBase: number;
  factor: number;
  pricePerUnit: number;
  pricePerBase: number;
  costPerBase: number;
  lineTotal: number;
  profit: number;
  createdAt?: string;
}

export interface Payment {
  id: string;
  saleId: string;
  tender: Tender;
  amount: number;
  reference?: string | null;
  isReversed: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface Sale {
  id: string;
  receiptNo: string;
  deviceId: string | null;
  userId: string | null;
  userName?: string | null;
  customerId: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  subtotal: number;
  discount: number;
  total: number;
  status: 'completed' | 'voided';
  notes?: string | null;
  soldAt: string;
  createdAt?: string;
  updatedAt?: string;
  items: SaleItem[];
  payments: Payment[];
}

export interface StockMovement {
  id: string;
  productId: string;
  productName?: string;
  movementType: 'purchase' | 'sale' | 'adjustment' | 'return' | 'sale_void' | 'opening';
  qtyBase: number;
  unitCost?: number | null;
  referenceType?: string | null;
  referenceId?: string | null;
  reason?: 'damaged' | 'expired' | 'count_correction' | 'other' | null;
  note?: string | null;
  userId?: string | null;
  userName?: string | null;
  deviceId?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface PurchaseItem {
  id: string;
  purchaseId: string;
  productId: string | null;
  productName: string;
  unitId: string | null;
  unitSymbol: string;
  qty: number;
  qtyBase: number;
  factor: number;
  costPerBase: number;
  lineTotal: number;
  createdAt?: string;
}

export interface Purchase {
  id: string;
  supplierId: string | null;
  supplierName?: string | null;
  deviceId: string | null;
  reference?: string | null;
  totalCost: number;
  status: 'received' | 'voided';
  notes?: string | null;
  createdBy?: string | null;
  createdByName?: string | null;
  purchasedAt: string;
  createdAt?: string;
  updatedAt?: string;
  items: PurchaseItem[];
}

export interface Expense {
  id: string;
  category: string;
  description: string;
  amount: number;
  paidVia: Tender;
  userId?: string | null;
  userName?: string;
  spentAt: string;
  deletedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface AuditLog {
  id: string;
  userId: string | null;
  userName?: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  details: Record<string, unknown>;
  createdAt: string;
}

export interface SyncQueueItem {
  id: string;
  entity: string;
  op: 'create' | 'update' | 'delete' | 'void';
  payload: Record<string, unknown>;
  createdAt: string;
  status?: 'pending' | 'error';
  error?: string | null;
}

export interface LocalAuth {
  email: string;
  pinHash: string;
  pinSalt: string;
  deviceId: string;
  cachedPermissions: Permissions;
  cachedProfile: User;
  updatedAt: string;
}

export interface AppMeta {
  key: string;
  value: string;
}

export interface AuthSession {
  accessToken: string;
  user: User;
  device: Device | null;
  business: Business | null;
  mustChangePassword?: boolean;
  deviceToken?: string;
}

export type Period = 'today' | 'week' | 'month' | 'year' | 'custom';

export interface Insight {
  id: string;
  severity: 'info' | 'warn' | 'danger';
  message: string;
  cta?: string;
}
