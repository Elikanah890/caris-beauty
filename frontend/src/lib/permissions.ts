import type { Permissions, Role, User } from './types';
import { PERMISSION_FLAGS, OWNER_PERMISSIONS } from './types';

export function normalizePermissions(role: Role, raw: unknown): Permissions {
  if (role === 'owner') return { ...OWNER_PERMISSIONS };
  const input = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return Object.fromEntries(
    PERMISSION_FLAGS.map((flag) => [flag, input[flag] === true])
  ) as Permissions;
}

export function can(
  user: Pick<User, 'role' | 'permissions'> | null | undefined,
  flag: keyof Permissions
): boolean {
  if (!user) return false;
  if (user.role === 'owner') return true;
  return user.permissions?.[flag] === true;
}

export function defaultEmployeePermissions(): Permissions {
  return {
    'sales.make': true,
    'stock.view': true,
    'stock.receive': false,
    'stock.adjust': false,
    'sales.discount': false,
    'sales.void': false,
    'expenses.record': false,
    'reports.view': false
  };
}

export const PERMISSION_LABELS: Record<
  keyof Permissions,
  { label: string; hint: string }
> = {
  'sales.make': { label: 'Make sales', hint: 'Open the till and complete sales' },
  'stock.view': { label: 'View stock', hint: 'See products and quantities' },
  'stock.receive': { label: 'Receive stock', hint: 'Record purchases and stock in' },
  'stock.adjust': { label: 'Adjust stock', hint: 'Correct counts, damage and expiry' },
  'sales.discount': { label: 'Give discounts', hint: 'Reduce a sale total' },
  'sales.void': { label: 'Void sales', hint: 'Reverse completed sales' },
  'expenses.record': { label: 'Record expenses', hint: 'Track money going out' },
  'reports.view': { label: 'View reports', hint: 'Revenue, profit and insights' }
};
