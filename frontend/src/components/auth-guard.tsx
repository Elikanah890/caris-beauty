'use client';

import { useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import type { PermissionFlag, User } from '@/lib/types';
import { useAuthStore } from '@/store/auth-store';
import { useBootstrap } from '@/lib/use-bootstrap';
import { db, clearLocalAuth } from '@/lib/db';
import { clearAccessToken } from '@/lib/token';
import { can } from '@/lib/permissions';
import { toast } from './ui/toast';
import { Splash } from './splash';

interface RouteRule {
  prefix: string;
  ownerOnly?: boolean;
  permission?: PermissionFlag;
  exact?: boolean;
}

const ROUTE_RULES: RouteRule[] = [
  { prefix: '/dashboard', ownerOnly: true },
  { prefix: '/pos', permission: 'sales.make' },
  { prefix: '/stock', permission: 'stock.view' },
  { prefix: '/reports', permission: 'reports.view' },
  { prefix: '/more/staff', ownerOnly: true },
  { prefix: '/more/settings', ownerOnly: true },
  { prefix: '/more/audit', ownerOnly: true },
  { prefix: '/more/expenses', permission: 'expenses.record' },
  { prefix: '/more/purchases', permission: 'stock.receive' },
  { prefix: '/more/customers', ownerOnly: true },
  { prefix: '/more/profile' },
  { prefix: '/more', ownerOnly: true, exact: true }
];

function routeRule(pathname: string): RouteRule | undefined {
  return ROUTE_RULES.find((rule) =>
    rule.exact
      ? pathname === rule.prefix
      : pathname === rule.prefix || pathname.startsWith(`${rule.prefix}/`)
  );
}

export function landingFor(user: User): string {
  if (user.role === 'owner') return '/dashboard';
  if (can(user, 'sales.make')) return '/pos';
  if (can(user, 'stock.view')) return '/stock';
  if (can(user, 'stock.receive')) return '/more/purchases';
  if (can(user, 'expenses.record')) return '/more/expenses';
  if (can(user, 'reports.view')) return '/reports';
  return '/more/profile';
}

function allow(user: User, rule: RouteRule): boolean {
  if (rule.ownerOnly) return user.role === 'owner';
  if (rule.permission) return can(user, rule.permission);
  return true;
}

export function AuthGuard({ children }: { children: React.ReactNode }) {
  useBootstrap();
  const router = useRouter();
  const pathname = usePathname();
  const user = useAuthStore((state) => state.user);
  const initialized = useAuthStore((state) => state.initialized);
  const hasLocalAuth = useAuthStore((state) => state.hasLocalAuth);
  const setUser = useAuthStore((state) => state.setUser);
  const setBusiness = useAuthStore((state) => state.setBusiness);
  const reset = useAuthStore((state) => state.reset);
  const offline = useAuthStore((state) => state.offline);
  const revokedRef = useRef(false);

  const localUser = useLiveQuery<User | undefined>(
    () => (user ? db.users.get(user.id) : undefined),
    [user?.id]
  );
  const business = useLiveQuery(() => db.business.toArray(), []);
  const localBusiness = business?.[0];

  useEffect(() => {
    if (localUser && user && localUser.updatedAt && localUser.updatedAt !== user.updatedAt) {
      setUser(localUser);
    }
  }, [localUser, setUser, user]);

  useEffect(() => {
    if (localBusiness) setBusiness(localBusiness);
  }, [localBusiness, setBusiness]);

  useEffect(() => {
    if (!initialized) return;
    if (!user) {
      router.replace(
        !navigator.onLine && hasLocalAuth ? '/auth/pin' : '/auth/login'
      );
      return;
    }
    if (user.mustChangePassword && pathname !== '/auth/change-password') {
      router.replace('/auth/change-password');
      return;
    }
    const rule = routeRule(pathname);
    if (rule && !allow(user, rule)) {
      router.replace(landingFor(user));
    }
  }, [initialized, user, hasLocalAuth, router, pathname]);

  useEffect(() => {
    const handleRevoked = (event: Event) => {
      if (revokedRef.current) return;
      revokedRef.current = true;
      const detail = (event as CustomEvent<{ code?: string; message?: string }>).detail ?? {};
      const disabled = detail.code === 'ACCOUNT_DISABLED';
      try {
        window.sessionStorage.setItem('duka_auth_notice', disabled ? 'disabled' : 'expired');
      } catch {
        // Session storage may be unavailable; the toast still informs the user.
      }
      void (async () => {
        await clearLocalAuth();
        clearAccessToken();
        reset();
        toast.error(
          disabled ? 'Account deactivated' : 'Signed out',
          disabled
            ? 'The owner has deactivated this account. You can no longer use it.'
            : 'Your session ended. Please sign in again.'
        );
        router.replace(disabled ? '/auth/login?disabled=1' : '/auth/login?session=expired');
      })();
    };
    window.addEventListener('duka:session-revoked', handleRevoked);
    return () => window.removeEventListener('duka:session-revoked', handleRevoked);
  }, [reset, router]);

  if (!initialized || !user) {
    return (
      <Splash
        label={offline ? 'Opening offline mode…' : 'Opening your duka…'}
        name={localBusiness?.name ?? 'Duka'}
      />
    );
  }

  if (user.mustChangePassword && pathname !== '/auth/change-password') {
    return (
      <Splash
        label="Please change your password…"
        name={localBusiness?.name ?? 'Duka'}
      />
    );
  }

  const rule = routeRule(pathname);
  if (rule && !allow(user, rule)) {
    return (
      <Splash
        label="Redirecting…"
        name={localBusiness?.name ?? 'Duka'}
      />
    );
  }

  return <>{children}</>;
}
