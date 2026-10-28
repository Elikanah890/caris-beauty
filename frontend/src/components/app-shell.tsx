'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  BarChart3,
  Boxes,
  ChevronRight,
  ClipboardList,
  CloudDownload,
  LayoutDashboard,
  LogOut,
  Menu,
  Search,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Store,
  UserRound,
  Users,
  Wallet,
  X
} from 'lucide-react';
import { useAuthStore } from '@/store/auth-store';
import { useSyncStore } from '@/store/sync-store';
import { can } from '@/lib/permissions';
import { t } from '@/lib/strings';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/format';
import { BrandLockup, BrandMark } from './brand-mark';
import { SyncStatus } from './sync-status';
import { InstallPwaButton } from './install-pwa-button';
import { SyncEngine } from './sync-engine';
import { logoutOnline } from '@/lib/auth';
import { clearAccessToken } from '@/lib/token';
import { toast } from './ui/toast';
import type { PermissionFlag } from '@/lib/types';

interface NavItem {
  href: string;
  label: string;
  shortLabel: string;
  icon: typeof LayoutDashboard;
  permission?: PermissionFlag;
  ownerOnly?: boolean;
}

const NAV: NavItem[] = [
  { href: '/dashboard', label: t.nav.dashboard, shortLabel: 'Overview', icon: LayoutDashboard, ownerOnly: true },
  { href: '/pos', label: t.nav.sell, shortLabel: 'Sale', icon: ShoppingCart, permission: 'sales.make' },
  { href: '/stock', label: t.nav.stock, shortLabel: 'Stock', icon: Boxes, permission: 'stock.view' },
  { href: '/reports', label: t.nav.reports, shortLabel: 'Reports', icon: BarChart3, permission: 'reports.view' },
  { href: '/more/staff', label: t.more.team, shortLabel: 'Workers', icon: Users, ownerOnly: true },
  { href: '/more/expenses', label: t.more.expenses, shortLabel: 'Costs', icon: Wallet, permission: 'expenses.record' },
  { href: '/more/purchases', label: t.more.purchases, shortLabel: 'Purchases', icon: ShoppingBag, permission: 'stock.receive' },
  { href: '/more/customers', label: t.more.customers, shortLabel: 'Debts', icon: UserRound, ownerOnly: true },
  { href: '/more/settings', label: t.more.settings, shortLabel: 'Settings', icon: Store, ownerOnly: true },
  { href: '/more/audit', label: t.more.audit, shortLabel: 'Activity', icon: ClipboardList, ownerOnly: true },
  { href: '/more/profile', label: t.more.profile, shortLabel: 'Profile', icon: UserRound }
];

const SHOP_HREFS = ['/dashboard', '/pos', '/stock', '/reports'];
const MOBILE_HREFS = ['/dashboard', '/pos', '/stock', '/reports'];

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function activeFor(pathname: string, href: string): boolean {
  if (href === '/dashboard') return pathname === '/dashboard';
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({
  item,
  pathname,
  prefetch
}: {
  item: NavItem;
  pathname: string;
  prefetch: boolean;
}) {
  const Icon = item.icon;
  const active = activeFor(pathname, item.href);
  return (
    <Link
      href={item.href}
      prefetch={prefetch}
      className={cn(
        'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200',
        active
          ? 'bg-brand-500 text-white shadow-[0_10px_20px_-12px_rgba(249,115,22,.9)]'
          : 'text-[#6f6357] hover:bg-brand-50 hover:text-brand-700'
      )}
    >
      <Icon size={18} strokeWidth={active ? 2.4 : 2} />
      <span className="flex-1">{item.label}</span>
      {active && <ChevronRight size={14} className="opacity-70" />}
    </Link>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const user = useAuthStore((state) => state.user);
  const business = useAuthStore((state) => state.business);
  const reset = useAuthStore((state) => state.reset);
  const pending = useSyncStore((state) => state.pending);
  const online = useSyncStore((state) => state.online);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  if (!user) return null;

  const visibleNav = NAV.filter((item) =>
    item.ownerOnly
      ? user.role === 'owner'
      : item.permission
        ? can(user, item.permission)
        : true
  );

  const shopNav = visibleNav.filter((item) => SHOP_HREFS.includes(item.href));
  const manageNav = visibleNav.filter((item) => !SHOP_HREFS.includes(item.href));
  const mobileNav = visibleNav.filter((item) => MOBILE_HREFS.includes(item.href));

  const handleLogout = async () => {
    await logoutOnline();
    clearAccessToken();
    reset();
    toast.info('Signed out', 'Your sales queue is safe on this device.');
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      window.location.assign('/auth/login');
    } else {
      router.replace('/auth/login');
    }
  };

  return (
    <div className="min-h-screen bg-cream">
      <SyncEngine />

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[252px] flex-col border-r border-line bg-[#fffdf9] px-4 py-5 lg:flex">
        <Link href={user.role === 'owner' ? '/dashboard' : '/pos'} prefetch={online} className="px-2">
          <BrandLockup name={business?.name ?? 'Duka'} />
        </Link>

        <nav className="mt-6 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pr-1">
          <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted/70">
            Shop
          </p>
          {shopNav.map((item) => (
            <NavLink key={item.href} item={item} pathname={pathname} prefetch={online} />
          ))}
          {manageNav.length > 0 && (
            <>
              <p className="mb-2 mt-5 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted/70">
                Shop management
              </p>
              {manageNav.map((item) => (
                <NavLink key={item.href} item={item} pathname={pathname} prefetch={online} />
              ))}
            </>
          )}
        </nav>

        <InstallPwaButton variant="outline" className="mt-4 w-full" />

        <div className="mt-4 rounded-2xl border border-line bg-gradient-to-br from-[#fff5e8] to-[#fdf0e0] p-3.5">
          <div className="flex items-center gap-2 text-brand-700">
            <span className="rounded-lg bg-white/80 p-1.5">
              <CloudDownload size={15} />
            </span>
            <p className="text-xs font-bold">{t.app.offlineReady}</p>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-[#88725c]">
            {online
              ? pending > 0
                ? `${pending} change${pending === 1 ? '' : 's'} waiting to sync.`
                : 'Everything on this device is synced.'
              : 'Keep selling. Changes queue safely and sync later.'}
          </p>
          <div className="mt-2">
            <SyncStatus compact />
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2.5 rounded-2xl border border-line bg-white p-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-ink text-xs font-bold text-white">
            {initials(user.name)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-ink">{user.name}</p>
            <p className="truncate text-[10px] capitalize text-muted">{user.role}</p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-full p-1.5 text-muted transition hover:bg-cream hover:text-berry"
            aria-label={t.auth.logout}
          >
            <LogOut size={15} />
          </button>
        </div>
      </aside>

      <div className="lg:pl-[252px]">
        <header className="sticky top-0 z-20 border-b border-line/80 bg-cream/90 backdrop-blur-xl">
          <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-2.5 lg:hidden">
              <BrandMark size="sm" />
              <div>
                <p className="font-display text-lg font-semibold leading-none text-ink">
                  {business?.name ?? 'Duka'}
                </p>
                <p className="mt-1 text-[9px] font-medium uppercase tracking-[0.14em] text-muted">
                  Point of sale
                </p>
              </div>
            </div>

            <div className="hidden items-center gap-3 lg:flex">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                  {business?.name ?? 'Your shop'}
                </p>
                <p className="text-sm font-medium text-ink">
                  {formatDate(new Date(), {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long'
                  })}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {can(user, 'sales.make') && (
                <button
                  type="button"
                  onClick={() => {
                    if (typeof navigator !== 'undefined' && !navigator.onLine) {
                      window.location.assign('/pos');
                    } else {
                      router.push('/pos');
                    }
                  }}
                  className="hidden items-center gap-2 rounded-xl border border-line bg-white px-3 py-2 text-xs font-medium text-muted transition hover:border-brand-300 hover:text-ink sm:flex"
                >
                  <Search size={14} />
                  Search products
                  <kbd className="ml-2 rounded-md bg-cream px-1.5 py-0.5 text-[10px] text-muted">⌘K</kbd>
                </button>
              )}
              <SyncStatus />
              {user.role === 'owner' && (
                <button
                  type="button"
                  onClick={() => {
                    if (typeof navigator !== 'undefined' && !navigator.onLine) {
                      window.location.assign('/dashboard');
                    } else {
                      router.push('/dashboard');
                    }
                  }}
                  className="relative hidden rounded-full border border-line bg-white p-2 text-muted transition hover:text-brand-600 sm:block"
                  aria-label="Insights"
                >
                  <Sparkles size={16} />
                </button>
              )}
              <Link
                href="/more/profile"
                prefetch={online}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-ink text-[11px] font-bold text-white ring-2 ring-white"
              >
                {initials(user.name)}
              </Link>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1440px] px-4 pb-safe pt-5 sm:px-6 lg:px-8 lg:pb-10">
          {children}
        </main>
      </div>

      {menuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-ink/40 backdrop-blur-sm"
            onClick={() => setMenuOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-3xl border-t border-line bg-[#fffdf9] px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4 shadow-lift">
            <div className="mb-3 flex items-center justify-between">
              <p className="font-display text-lg font-semibold text-ink">Menu</p>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                className="rounded-full p-1.5 text-muted transition hover:bg-cream hover:text-ink"
                aria-label="Close menu"
              >
                <X size={18} />
              </button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {visibleNav.map((item) => {
                const Icon = item.icon;
                const active = activeFor(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch={online}
                    onClick={() => setMenuOpen(false)}
                    className={cn(
                      'flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm font-medium transition',
                      active
                        ? 'border-brand-200 bg-brand-50 text-brand-700'
                        : 'border-line bg-white text-[#6f6357] hover:border-brand-200 hover:text-ink'
                    )}
                  >
                    <Icon size={17} />
                    <span className="flex-1">{item.label}</span>
                    <ChevronRight size={14} className="text-muted" />
                  </Link>
                );
              })}
            </div>
            <InstallPwaButton variant="outline" className="mt-4 w-full" />
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-line px-3 py-2.5 text-sm font-medium text-berry transition hover:bg-cream"
            >
              <LogOut size={16} /> {t.auth.logout}
            </button>
          </div>
        </div>
      )}

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-[#fffdf9]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
        <div className="mx-auto flex max-w-lg items-stretch justify-around px-2">
          {mobileNav.map((item) => {
            const Icon = item.icon;
            const active = activeFor(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={online}
                className={cn(
                  'flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-semibold transition',
                  active ? 'text-brand-600' : 'text-muted'
                )}
              >
                <span
                  className={cn(
                    'rounded-xl p-1.5 transition-all',
                    active ? 'bg-brand-50' : 'bg-transparent'
                  )}
                >
                  <Icon size={19} strokeWidth={active ? 2.4 : 2} />
                </span>
                {item.shortLabel}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className={cn(
              'flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-semibold transition',
              menuOpen ? 'text-brand-600' : 'text-muted'
            )}
            aria-expanded={menuOpen}
            aria-label="Open menu"
          >
            <span
              className={cn(
                'rounded-xl p-1.5 transition-all',
                menuOpen ? 'bg-brand-50' : 'bg-transparent'
              )}
            >
              <Menu size={19} />
            </span>
            Menu
          </button>
        </div>
      </nav>
    </div>
  );
}
