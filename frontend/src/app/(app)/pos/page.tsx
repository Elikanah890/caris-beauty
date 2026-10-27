'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Barcode,
  Boxes,
  ChevronRight,
  Package,
  Plus,
  Search,
  ShoppingBasket,
  ShoppingCart,
  Sparkles,
  X
} from 'lucide-react';
import { PageHeader } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/misc';
import { CartPanel } from '@/components/pos/cart-panel';
import { AddProductDialog } from '@/components/pos/add-product-dialog';
import { CheckoutDialog } from '@/components/pos/checkout-dialog';
import { ReceiptDialog } from '@/components/pos/receipt-dialog';
import { PermissionGate } from '@/components/permission-gate';
import { useCatalog, type CatalogProduct } from '@/lib/hooks';
import { useAuthStore } from '@/store/auth-store';
import { useCartStore, cartTotals } from '@/store/cart-store';
import { db } from '@/lib/db';
import { defaultChoice, stockDisplay } from '@/lib/pricing';
import { formatDate, formatQty, formatTZS } from '@/lib/format';
import { can } from '@/lib/permissions';
import { t } from '@/lib/strings';
import { cn } from '@/lib/utils';
import type { Sale } from '@/lib/types';

function ProductCard({
  product,
  onOpen,
  onQuickAdd
}: {
  product: CatalogProduct;
  onOpen: () => void;
  onQuickAdd: () => void;
}) {
  const primary = defaultChoice(product.choices);
  const stock = stockDisplay(product.stockBase, primary);
  const out = product.stockBase <= 0;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-paper p-3 text-left shadow-soft transition-all duration-300 hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-lift"
    >
      <div className="relative mb-3 flex h-24 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-[#fff4e6] via-[#fdf8f0] to-[#f3ece1]">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/80 text-brand-500 shadow-sm transition group-hover:scale-105">
          <Package size={22} />
        </span>
        <Badge
          variant={out ? 'danger' : stock <= 3 ? 'warning' : 'success'}
          className="absolute left-2 top-2"
        >
          {out ? t.pos.outOfStock : `${formatQty(Math.max(0, stock))} ${primary.unitSymbol} ${t.pos.left}`}
        </Badge>
        <span className="absolute bottom-2 right-2 rounded-full bg-white/80 px-1.5 py-0.5 text-[9px] font-medium text-muted">
          {product.categoryName ?? 'Uncategorised'}
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-ink">{product.name}</p>
        <p className="mt-0.5 text-[10px] text-muted">
          {product.sku ? `SKU ${product.sku}` : product.barcode ?? 'Tap to choose unit'}
          {product.expiryDate ? ` · exp ${formatDate(product.expiryDate, { day: '2-digit', month: 'short' })}` : ''}
        </p>
      </div>

      <div className="mt-3 flex items-end justify-between gap-2">
        <div>
          <p className="numeric text-sm font-bold text-ink">{formatTZS(primary.pricePerUnit)}</p>
          <p className="text-[9px] text-muted">per {primary.unitSymbol}</p>
        </div>
        <span
          role="button"
          tabIndex={0}
          onClick={(event) => {
            event.stopPropagation();
            onQuickAdd();
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              event.stopPropagation();
              onQuickAdd();
            }
          }}
          className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-500 text-white shadow-sm transition hover:bg-brand-600 active:scale-95"
          aria-label={`Add ${product.name}`}
        >
          <Plus size={15} />
        </span>
      </div>
    </button>
  );
}

function EmployeeTodayCard({ userId }: { userId: string }) {
  const todayStart = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return start.toISOString();
  }, []);
  const todaySales = useLiveQuery(
    () => db.sales.where('soldAt').aboveOrEqual(todayStart).toArray(),
    [todayStart]
  );
  const completed = (todaySales ?? []).filter((sale) => sale.status === 'completed');
  const mine = completed.filter((sale) => sale.userId === userId);
  const myTotal = mine.reduce((sum, sale) => sum + Number(sale.total), 0);
  const shopTotal = completed.reduce((sum, sale) => sum + Number(sale.total), 0);

  return (
    <div className="rounded-2xl border border-line bg-white p-3.5 shadow-soft">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">Today</p>
      <div className="mt-2 flex items-center justify-between text-xs">
        <span className="text-muted">You</span>
        <span className="numeric font-semibold text-ink">
          {formatTZS(myTotal)}{' '}
          <span className="text-[10px] font-normal text-muted">
            ({mine.length} sale{mine.length === 1 ? '' : 's'})
          </span>
        </span>
      </div>
      <div className="mt-1 flex items-center justify-between text-xs">
        <span className="text-muted">Shop total</span>
        <span className="numeric font-semibold text-ink">{formatTZS(shopTotal)}</span>
      </div>
    </div>
  );
}

function PosContent() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const catalog = useCatalog();
  const lines = useCartStore((state) => state.lines);
  const addLine = useCartStore((state) => state.addLine);
  const totals = cartTotals(lines, useCartStore((state) => state.discount));
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [active, setActive] = useState<CatalogProduct | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [receipt, setReceipt] = useState<Sale | null>(null);
  const business = useAuthStore((state) => state.business);

  const filtered = useMemo(() => {
    if (!catalog) return [];
    const term = search.trim().toLowerCase();
    return catalog.products.filter((product) => {
      if (!product.isActive) return false;
      if (categoryId && product.categoryId !== categoryId) return false;
      if (!term) return true;
      return (
        product.name.toLowerCase().includes(term) ||
        (product.sku ?? '').toLowerCase().includes(term) ||
        (product.barcode ?? '').toLowerCase().includes(term)
      );
    });
  }, [catalog, search, categoryId]);

  const quickAdd = (product: CatalogProduct) => {
    addLine(product, defaultChoice(product.choices), 1);
  };

  return (
    <div>
      <PageHeader
        eyebrow="Point of sale"
        title={t.pos.title}
        subtitle={t.pos.subtitle}
        actions={
          <Badge variant="success" className="hidden sm:inline-flex">
            <span className="h-1.5 w-1.5 rounded-full bg-moss" />
            Stock updates live
          </Badge>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_390px]">
        <section className="min-w-0">
          <div className="surface p-3 sm:p-4">
            <div className="relative">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onFocus={() => setSearchOpen(true)}
                onBlur={() => setTimeout(() => setSearchOpen(false), 120)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    setSearch('');
                    setSearchOpen(false);
                  }
                  if (event.key === 'Enter' && search.trim() && filtered[0]) {
                    event.preventDefault();
                    quickAdd(filtered[0]);
                    setSearch('');
                    setSearchOpen(false);
                  }
                }}
                placeholder={t.pos.search}
                className="h-11 pl-10 pr-24"
                autoFocus
              />
              <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="rounded-lg p-1.5 text-muted hover:bg-cream hover:text-ink"
                    aria-label="Clear search"
                  >
                    <X size={14} />
                  </button>
                )}
                <span className="hidden items-center gap-1 rounded-lg bg-cream px-2 py-1 text-[10px] font-medium text-muted sm:flex">
                  <Barcode size={12} /> scan
                </span>
              </div>

              {searchOpen && search.trim().length > 0 && (
                <div className="absolute inset-x-0 top-full z-20 mt-2 max-h-72 overflow-y-auto rounded-xl border border-line bg-white shadow-lift">
                  {filtered.length === 0 ? (
                    <p className="px-3 py-2.5 text-xs text-muted">No products match “{search}”.</p>
                  ) : (
                    filtered.slice(0, 6).map((product) => (
                      <button
                        key={product.id}
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                          quickAdd(product);
                          setSearch('');
                          setSearchOpen(false);
                        }}
                        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition hover:bg-cream"
                      >
                        <span className="min-w-0 truncate text-xs font-medium text-ink">
                          {product.name}
                        </span>
                        <span className="shrink-0 text-[10px] text-muted">
                          {product.sku ?? product.barcode ?? ''}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            <div className="no-scrollbar mt-3 flex gap-1.5 overflow-x-auto">
              <button
                type="button"
                onClick={() => setCategoryId(null)}
                className={cn(
                  'shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold transition',
                  categoryId === null
                    ? 'bg-ink text-white'
                    : 'bg-cream text-muted hover:bg-brand-50 hover:text-brand-700'
                )}
              >
                {t.pos.all}
              </button>
              {(catalog?.categories ?? []).map((category) => {
                const inStock = catalog?.products.filter(
                  (product) => product.categoryId === category.id && product.isActive && (product.stockBase ?? 0) > 0
                ).length ?? 0;
                const totalActive = catalog?.products.filter(
                  (product) => product.categoryId === category.id && product.isActive
                ).length;
                return (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => setCategoryId(category.id)}
                    className={cn(
                      'shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold transition',
                      categoryId === category.id
                        ? `bg-ink text-white ${inStock > 0 ? '' : 'opacity-50'}`
                        : `bg-cream text-muted hover:bg-brand-50 hover:text-brand-700`
                    )}
                  >
                    {category.name}
                    {inStock ? (
                      <span className="ml-1 opacity-80">{inStock} in stock</span>
                    ) : null}
                    {totalActive === 0 && inStock === 0 && (
                      <span className="text-[9px] text-berry ml-1">empty</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {!catalog ? (
            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
              {[0, 1, 2, 3, 4, 5, 6, 7].map((index) => (
                <div key={index} className="h-56 animate-pulse rounded-2xl bg-white/60" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="surface mt-4">
              <EmptyState
                title={search ? 'No products match your search' : t.stock.none}
                description={
                  search
                    ? 'Try a different name, SKU or barcode.'
                    : can(user, 'stock.receive')
                      ? 'Add your first product to start selling.'
                      : 'Ask the owner to add products to this shop.'
                }
                icon={<ShoppingBasket size={24} />}
                action={
                  can(user, 'stock.receive') && !search ? (
                    <Button onClick={() => router.push('/stock?add=1')}>
                      <Plus size={15} /> Add product
                    </Button>
                  ) : undefined
                }
              />
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-3 xl:grid-cols-4">
              {filtered.map((product, index) => (
                <div
                  key={product.id}
                  className="animate-fade-up"
                  style={{ animationDelay: `${Math.min(index, 10) * 35}ms` }}
                >
                  <ProductCard
                    product={product}
                    onOpen={() => setActive(product)}
                    onQuickAdd={() => quickAdd(product)}
                  />
                </div>
              ))}
            </div>
          )}

          {filtered.length > 0 && (
            <div className="mt-4 flex items-center justify-between rounded-2xl border border-dashed border-line px-4 py-3 text-[11px] text-muted">
              <span className="inline-flex items-center gap-1.5">
                <Sparkles size={13} className="text-brand-500" />
                Tap a product to choose its unit and quantity.
              </span>
              <button
                type="button"
                onClick={() => router.push('/stock')}
                className="inline-flex items-center gap-1 font-semibold text-brand-600"
              >
                <Boxes size={13} /> View stock <ChevronRight size={12} />
              </button>
            </div>
          )}
        </section>

        <aside className="hidden lg:block">
          <div className="sticky top-20 flex h-[calc(100vh-6rem)] flex-col gap-3">
            {user?.role === 'employee' && <EmployeeTodayCard userId={user.id} />}
            <div className="min-h-0 flex-1">
              <CartPanel onCheckout={() => setCheckoutOpen(true)} />
            </div>
          </div>
        </aside>
      </div>

      {lines.length > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] z-20 px-3 lg:hidden">
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="flex w-full items-center gap-3 rounded-2xl border border-brand-200 bg-ink px-4 py-3 text-white shadow-[0_18px_40px_-18px_rgba(33,26,19,.9)] animate-slide-up"
          >
            <span className="relative rounded-xl bg-white/10 p-2">
              <ShoppingCart size={17} />
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-500 px-1 text-[9px] font-bold">
                {formatQty(totals.itemCount)}
              </span>
            </span>
            <span className="text-left">
              <span className="block text-[10px] uppercase tracking-wide text-white/50">
                {t.pos.cart}
              </span>
              <span className="numeric block text-sm font-bold">{formatTZS(totals.total)}</span>
            </span>
            <span className="ml-auto flex items-center gap-1 rounded-xl bg-brand-500 px-3 py-2 text-xs font-semibold">
              View cart <ChevronRight size={14} />
            </span>
          </button>
        </div>
      )}

      <Dialog
        open={cartOpen}
        onOpenChange={setCartOpen}
        size="sm"
        className="max-h-[86vh] overflow-hidden p-0"
      >
        <div className="flex max-h-[86vh] flex-col">
          {user?.role === 'employee' && (
            <div className="p-3 pb-0">
              <EmployeeTodayCard userId={user.id} />
            </div>
          )}
          <CartPanel
            compact
            onCheckout={() => {
              setCartOpen(false);
              setCheckoutOpen(true);
            }}
          />
        </div>
      </Dialog>

      <AddProductDialog product={active} open={Boolean(active)} onOpenChange={(open) => !open && setActive(null)} />
      <CheckoutDialog
        open={checkoutOpen}
        onOpenChange={setCheckoutOpen}
        onCompleted={(sale) => setReceipt(sale)}
      />
      <ReceiptDialog
        sale={receipt}
        business={business}
        onDone={() => setReceipt(null)}
      />
    </div>
  );
}

export default function PosPage() {
  return (
    <PermissionGate flag="sales.make">
      <PosContent />
    </PermissionGate>
  );
}
