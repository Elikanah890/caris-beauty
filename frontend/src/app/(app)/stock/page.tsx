'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowDownToLine,
  Boxes,
  ChevronRight,
  Package,
  PackagePlus,
  Plus,
  Search,
  SlidersHorizontal,
  TrendingUp,
  Wallet
} from 'lucide-react';
import { PageHeader, EmptyState } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { PermissionGate } from '@/components/permission-gate';
import {
  AdjustStockDialog,
  CreateProductDialog,
  StockInDialog
} from '@/components/stock/stock-dialogs';
import { useCatalog, type CatalogProduct } from '@/lib/hooks';
import { useAuthStore } from '@/store/auth-store';
import { can } from '@/lib/permissions';
import { defaultChoice, stockDisplay } from '@/lib/pricing';
import { formatQty, formatTZS } from '@/lib/format';
import { t } from '@/lib/strings';
import { cn } from '@/lib/utils';

type Filter = 'all' | 'low' | 'out';

function StockContent() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const catalog = useCatalog();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [stockInProduct, setStockInProduct] = useState<CatalogProduct | null>(null);
  const [adjustProduct, setAdjustProduct] = useState<CatalogProduct | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('add') === '1' && user?.role === 'owner') setCreateOpen(true);
    const nextFilter = params.get('filter');
    if (nextFilter === 'low' || nextFilter === 'out') setFilter(nextFilter);
  }, [user?.role]);

  const filtered = useMemo(() => {
    if (!catalog) return [];
    const term = search.trim().toLowerCase();
    return catalog.products.filter((product) => {
      if (!product.isActive) return false;
      if (term && !`${product.name} ${product.sku ?? ''} ${product.barcode ?? ''}`.toLowerCase().includes(term)) {
        return false;
      }
      if (filter === 'low' && product.stockBase > product.reorderLevelBase) return false;
      if (filter === 'out' && product.stockBase > 0) return false;
      return true;
    });
  }, [catalog, search, filter]);

  const totals = useMemo(() => {
    const products = catalog?.products ?? [];
    const stockValue = products.reduce(
      (sum, product) => sum + Math.max(0, product.stockBase) * Number(product.costPerBase),
      0
    );
    return {
      products: products.length,
      low: products.filter(
        (product) => product.stockBase <= product.reorderLevelBase
      ).length,
      out: products.filter((product) => product.stockBase <= 0).length,
      stockValue
    };
  }, [catalog]);

  return (
    <div>
      <PageHeader
        eyebrow="Inventory"
        title={t.stock.title}
        subtitle={t.stock.subtitle}
        actions={
          user?.role === 'owner' ? (
            <Button onClick={() => setCreateOpen(true)}>
              <PackagePlus size={15} />
              Add product
            </Button>
          ) : undefined
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          {
            label: 'Products',
            value: formatQty(totals.products),
            icon: Boxes,
            tone: 'bg-brand-50 text-brand-600'
          },
          {
            label: 'Stock value',
            value: formatTZS(totals.stockValue),
            icon: Wallet,
            tone: 'bg-[#eef4ec] text-moss'
          },
          {
            label: 'Low stock',
            value: formatQty(totals.low),
            icon: AlertTriangle,
            tone: 'bg-[#fdf3dd] text-[#9a7020]'
          },
          {
            label: 'Out of stock',
            value: formatQty(totals.out),
            icon: TrendingUp,
            tone: 'bg-[#fbecef] text-berry'
          }
        ].map((item, index) => {
          const Icon = item.icon;
          return (
            <Card key={item.label} className={cn('animate-fade-up', index > 0 && `delay-${index}`)}>
              <CardContent className="p-4">
                <span className={cn('inline-flex rounded-xl p-2.5', item.tone)}>
                  <Icon size={17} />
                </span>
                <p className="mt-3 text-[10px] font-medium uppercase tracking-wide text-muted">
                  {item.label}
                </p>
                <p className="numeric mt-0.5 font-display text-xl font-semibold text-ink">{item.value}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="surface mt-4 overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-line p-3.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 sm:max-w-md">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t.stock.search}
              className="pl-10"
            />
          </div>
          <div className="flex items-center gap-1.5 rounded-xl bg-cream p-1">
            {(
              [
                { id: 'all', label: t.stock.all, icon: SlidersHorizontal },
                { id: 'low', label: t.stock.low, icon: AlertTriangle },
                { id: 'out', label: t.stock.out, icon: Boxes }
              ] as const
            ).map((option) => {
              const Icon = option.icon;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setFilter(option.id)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition',
                    filter === option.id ? 'bg-white text-ink shadow-sm' : 'text-muted hover:text-ink'
                  )}
                >
                  <Icon size={12} />
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        {!catalog ? (
          <div className="space-y-2 p-4">
            {[0, 1, 2, 3].map((index) => (
              <div key={index} className="h-14 animate-pulse rounded-xl bg-cream" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            title={search || filter !== 'all' ? 'No products match this view' : t.stock.none}
            description={
              search || filter !== 'all'
                ? 'Try a different search or filter.'
                : 'Add a product to start tracking stock.'
            }
            icon={<Boxes size={22} />}
            action={
              user?.role === 'owner' && !search && filter === 'all' ? (
                <Button onClick={() => setCreateOpen(true)}>
                  <Plus size={15} /> Add product
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Category</th>
                    <th className="text-right">On hand</th>
                    <th className="text-right">Stock value</th>
                    <th>Status</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((product) => {
                    const primary = defaultChoice(product.choices);
                    const stock = stockDisplay(product.stockBase, primary);
                    const isOut = product.stockBase <= 0;
                    const isLow = product.stockBase <= product.reorderLevelBase;
                    return (
                      <tr key={product.id} className="group transition hover:bg-cream/40">
                        <td>
                          <Link href={`/stock/${product.id}`} className="flex items-center gap-3">
                            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-100 to-cream text-brand-600">
                              <Package size={16} />
                            </span>
                            <span>
                              <span className="block text-xs font-semibold text-ink">{product.name}</span>
                              <span className="block text-[10px] text-muted">
                                {product.sku ?? product.barcode ?? 'No SKU'}
                              </span>
                            </span>
                          </Link>
                        </td>
                        <td className="text-xs text-muted">{product.categoryName ?? '—'}</td>
                        <td className="numeric text-right text-xs font-semibold text-ink">
                          {formatQty(stock)} {primary.unitSymbol}
                        </td>
                        <td className="numeric text-right text-xs text-muted">
                          {formatTZS(Math.max(0, product.stockBase) * Number(product.costPerBase))}
                        </td>
                        <td>
                          <Badge variant={isOut ? 'danger' : isLow ? 'warning' : 'success'}>
                            {isOut ? 'Out' : isLow ? 'Low' : 'Healthy'}
                          </Badge>
                        </td>
                        <td>
                          <div className="flex items-center justify-end gap-1">
                            {can(user, 'stock.receive') && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setStockInProduct(product)}
                              >
                                <ArrowDownToLine size={13} /> In
                              </Button>
                            )}
                            {can(user, 'stock.adjust') && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setAdjustProduct(product)}
                              >
                                <SlidersHorizontal size={13} /> Adjust
                              </Button>
                            )}
                            <Link
                              href={`/stock/${product.id}`}
                              className="rounded-lg p-2 text-muted transition hover:bg-cream hover:text-ink"
                            >
                              <ChevronRight size={15} />
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-line/70 md:hidden">
              {filtered.map((product) => {
                const primary = defaultChoice(product.choices);
                const stock = stockDisplay(product.stockBase, primary);
                const isOut = product.stockBase <= 0;
                const isLow = product.stockBase <= product.reorderLevelBase;
                return (
                  <div key={product.id} className="p-3.5">
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-100 to-cream text-brand-600">
                        <Package size={17} />
                      </span>
                      <Link href={`/stock/${product.id}`} className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-ink">{product.name}</p>
                        <p className="text-[10px] text-muted">
                          {product.categoryName ?? 'Uncategorised'}
                        </p>
                      </Link>
                      <Badge variant={isOut ? 'danger' : isLow ? 'warning' : 'success'}>
                        {isOut ? 'Out' : isLow ? 'Low' : 'Healthy'}
                      </Badge>
                    </div>
                    <div className="mt-2 flex items-center justify-between pl-[52px]">
                      <div>
                        <p className="numeric text-sm font-semibold text-ink">
                          {formatQty(stock)} <span className="text-[10px] font-normal text-muted">{primary.unitSymbol}</span>
                        </p>
                        <p className="text-[10px] text-muted">
                          {formatTZS(Math.max(0, product.stockBase) * Number(product.costPerBase))} value
                        </p>
                      </div>
                      <div className="flex gap-1">
                        {can(user, 'stock.receive') && (
                          <Button variant="soft" size="sm" onClick={() => setStockInProduct(product)}>
                            {t.stock.stockIn}
                          </Button>
                        )}
                        {can(user, 'stock.adjust') && (
                          <Button variant="outline" size="sm" onClick={() => setAdjustProduct(product)}>
                            Adjust
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" onClick={() => router.push(`/stock/${product.id}`)}>
                          <ChevronRight size={16} />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      <CreateProductDialog open={createOpen} onOpenChange={setCreateOpen} />
      <StockInDialog
        product={stockInProduct}
        open={Boolean(stockInProduct)}
        onOpenChange={(open) => !open && setStockInProduct(null)}
      />
      <AdjustStockDialog
        product={adjustProduct}
        open={Boolean(adjustProduct)}
        onOpenChange={(open) => !open && setAdjustProduct(null)}
      />
    </div>
  );
}

export default function StockPage() {
  return (
    <PermissionGate flag="stock.view">
      <StockContent />
    </PermissionGate>
  );
}
