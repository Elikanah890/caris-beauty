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

export const DEFAULT_EMPLOYEE_PERMISSIONS: Permissions = {
  'sales.make': true,
  'stock.view': true,
  'stock.receive': false,
  'stock.adjust': false,
  'sales.discount': false,
  'sales.void': false,
  'expenses.record': false,
  'reports.view': false
};

export function normalizePermissions(
  role: 'owner' | 'employee',
  raw: unknown
): Permissions {
  if (role === 'owner') return { ...OWNER_PERMISSIONS };
  const input = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return Object.fromEntries(
    PERMISSION_FLAGS.map((flag) => [flag, input[flag] === true])
  ) as Permissions;
}

export function hasPermission(
  role: 'owner' | 'employee',
  permissions: Permissions,
  flag: PermissionFlag
): boolean {
  return role === 'owner' || permissions[flag] === true;
}
