'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ArrowDownToLine,
  ArrowLeft,
  CalendarDays,
  Layers,
  Package,
  SlidersHorizontal,
  Trash2,
  TrendingUp
} from 'lucide-react';
import { PageHeader, EmptyState } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { PermissionGate } from '@/components/permission-gate';
import {
  AdjustStockDialog,
  StockInDialog
} from '@/components/stock/stock-dialogs';
import { useCatalog, type CatalogProduct } from '@/lib/hooks';
import { db } from '@/lib/db';
import { apiRequest } from '@/lib/api';
import { useAuthStore } from '@/store/auth-store';
import { can } from '@/lib/permissions';
import { defaultChoice, stockDisplay } from '@/lib/pricing';
import { formatDate, formatDateTime, formatQty, formatTZS } from '@/lib/format';
import { t } from '@/lib/strings';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import type { StockMovement } from '@/lib/types';

const TYPE_LABEL: Record<StockMovement['movementType'], string> = {
  purchase: t.stock.stockIn,
  sale: 'Sale',
  adjustment: 'Adjustment',
  return: 'Sale return',
  sale_void: 'Void return',
  opening: 'Opening stock'
};

function StockDetailContent() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;
  const catalog = useCatalog();
  const user = useAuthStore((state) => state.user);
  const [stockInOpen, setStockInOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const product = catalog?.products.find((entry) => entry.id === id) as CatalogProduct | undefined;
  const movements = useLiveQuery(
    () => db.stock_movements.where('productId').equals(id).reverse().sortBy('createdAt'),
    [id]
  );

  const summary = useMemo(() => {
    if (!product) return null;
    const primary = defaultChoice(product.choices);
    const stock = stockDisplay(product.stockBase, primary);
    const value = Math.max(0, product.stockBase) * Number(product.costPerBase);
    const margin =
      product.pricePerBase > 0
        ? Math.round(((product.pricePerBase - product.costPerBase) / product.pricePerBase) * 100)
        : 0;
    return { primary, stock, value, margin };
  }, [product]);

  if (!catalog) {
    return (
      <div className="space-y-4">
        <div className="h-16 animate-pulse rounded-2xl bg-white/60" />
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="h-64 animate-pulse rounded-2xl bg-white/60 lg:col-span-2" />
          <div className="h-64 animate-pulse rounded-2xl bg-white/60" />
        </div>
      </div>
    );
  }

  if (!product || !summary) {
    return (
      <EmptyState
        title="Product not found"
        description="It may have been deleted or is no longer in this shop."
        action={
          <Button onClick={() => router.push('/stock')}>
            <ArrowLeft size={15} /> Back to stock
          </Button>
        }
      />
    );
  }

  const deleteProduct = async () => {
    setDeleting(true);
    try {
      await apiRequest(`/products/${product.id}`, { method: 'DELETE' });
      const existing = await db.products.get(product.id);
      if (existing) {
        await db.products.put({
          ...existing,
          deletedAt: new Date().toISOString(),
          isActive: false,
          updatedAt: new Date().toISOString()
        });
      }
      toast.success('Product deleted', product.name);
      router.replace('/stock');
    } catch (err) {
      toast.error('Could not delete product', err instanceof Error ? err.message : undefined);
    } finally {
      setDeleting(false);
      setDeleteOpen(false);
    }
  };

  return (
    <div>
      <div className="mb-4 flex items-center gap-2 text-xs text-muted">
        <Link href="/stock" className="inline-flex items-center gap-1 font-semibold hover:text-ink">
          <ArrowLeft size={14} /> Stock
        </Link>
        <span>/</span>
        <span className="truncate">{product.name}</span>
      </div>

      <PageHeader
        eyebrow={product.categoryName ?? 'Product'}
        title={product.name}
        subtitle={product.sku ? `SKU ${product.sku}` : product.barcode ? `Barcode ${product.barcode}` : 'No SKU'}
        actions={
          <>
            {can(user, 'stock.receive') && (
              <Button variant="outline" onClick={() => setStockInOpen(true)}>
                <ArrowDownToLine size={15} /> {t.stock.stockIn}
              </Button>
            )}
            {can(user, 'stock.adjust') && (
              <Button onClick={() => setAdjustOpen(true)}>
                <SlidersHorizontal size={15} /> Adjust
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              {
                label: 'On hand',
                value: `${formatQty(summary.stock)} ${summary.primary.unitSymbol}`,
                icon: Package,
                tone: 'text-brand-600 bg-brand-50'
              },
              {
                label: 'Stock value',
                value: formatTZS(summary.value),
                icon: Layers,
                tone: 'text-moss bg-[#eef4ec]'
              },
              {
                label: 'Margin',
                value: `${summary.margin}%`,
                icon: TrendingUp,
                tone: 'text-sky bg-[#edf3f7]'
              },
              {
                label: 'Reorder at',
                value: `${formatQty(product.reorderLevelBase)} base`,
                icon: CalendarDays,
                tone: 'text-[#9a7020] bg-[#fdf3dd]'
              }
            ].map((item) => {
              const Icon = item.icon;
              return (
                <Card key={item.label}>
                  <CardContent className="p-3.5">
                    <span className={cn('inline-flex rounded-lg p-2', item.tone)}>
                      <Icon size={15} />
                    </span>
                    <p className="mt-2 text-[9px] font-medium uppercase tracking-wide text-muted">
                      {item.label}
                    </p>
                    <p className="numeric mt-0.5 text-sm font-semibold text-ink">{item.value}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{t.stock.movements}</CardTitle>
              <Badge variant="default">{movements?.length ?? 0}</Badge>
            </CardHeader>
            <CardContent>
              {!movements ? (
                <div className="space-y-2">
                  {[0, 1, 2].map((index) => (
                    <div key={index} className="h-12 animate-pulse rounded-xl bg-cream" />
                  ))}
                </div>
              ) : movements.length === 0 ? (
                <EmptyState title={t.stock.noMovements} description="Add stock or adjust to get started." icon={<Package size={20} />} />
              ) : (
                <div className="relative space-y-1">
                  <span className="absolute bottom-3 left-[15px] top-3 w-px bg-line" />
                  {movements.map((movement) => {
                    const positive = Number(movement.qtyBase) > 0;
                    return (
                      <div key={movement.id} className="relative flex gap-3 rounded-xl px-1 py-2 transition hover:bg-cream/50">
                        <span
                          className={cn(
                            'z-10 mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-paper text-[10px] font-bold',
                            positive ? 'bg-[#eef4ec] text-moss' : 'bg-[#fbecef] text-berry'
                          )}
                        >
                          {positive ? '+' : '−'}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-semibold text-ink">
                              {TYPE_LABEL[movement.movementType]}
                              {movement.reason ? ` · ${movement.reason.replace('_', ' ')}` : ''}
                            </p>
                            <p
                              className={cn(
                                'numeric text-xs font-bold',
                                positive ? 'text-moss' : 'text-berry'
                              )}
                            >
                              {positive ? '+' : ''}
                              {formatQty(movement.qtyBase)} base
                            </p>
                          </div>
                          <p className="mt-0.5 text-[10px] text-muted">
                            {formatDateTime(movement.createdAt)}
                            {movement.userName ? ` · ${movement.userName}` : ''}
                          </p>
                          {movement.note && (
                            <p className="mt-1 rounded-lg bg-cream px-2 py-1 text-[10px] text-muted">
                              {movement.note}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Selling units</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {product.choices.map((choice) => (
                  <div
                    key={choice.unitId}
                    className="flex items-center justify-between rounded-xl border border-line px-3 py-2.5"
                  >
                    <div>
                      <p className="text-xs font-semibold text-ink">{choice.unitName}</p>
                      <p className="text-[10px] text-muted">
                        1 {choice.unitSymbol} = {formatQty(choice.factor)} base
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="numeric text-xs font-bold text-ink">
                        {formatTZS(choice.pricePerUnit)}
                      </p>
                      <p className="text-[10px] text-muted">per {choice.unitSymbol}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Product details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              <div className="flex justify-between border-b border-line/70 py-1.5">
                <span className="text-muted">Base unit</span>
                <span className="font-semibold text-ink">{product.baseUnitName ?? '—'}</span>
              </div>
              <div className="flex justify-between border-b border-line/70 py-1.5">
                <span className="text-muted">Cost per base</span>
                <span className="numeric font-semibold text-ink">{formatTZS(product.costPerBase)}</span>
              </div>
              <div className="flex justify-between border-b border-line/70 py-1.5">
                <span className="text-muted">Price per base</span>
                <span className="numeric font-semibold text-ink">{formatTZS(product.pricePerBase)}</span>
              </div>
              <div className="flex justify-between border-b border-line/70 py-1.5">
                <span className="text-muted">Expiry</span>
                <span className="font-semibold text-ink">
                  {product.expiryDate ? formatDate(product.expiryDate) : '—'}
                </span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-muted">Status</span>
                <Badge variant={product.isActive ? 'success' : 'default'}>
                  {product.isActive ? 'Active' : 'Inactive'}
                </Badge>
              </div>
            </CardContent>
          </Card>

          {user?.role === 'owner' && (
            <Button variant="outline" className="w-full text-berry" onClick={() => setDeleteOpen(true)}>
              <Trash2 size={15} /> Delete product
            </Button>
          )}
        </div>
      </div>

      <StockInDialog
        product={product}
        open={stockInOpen}
        onOpenChange={setStockInOpen}
      />
      <AdjustStockDialog
        product={product}
        open={adjustOpen}
        onOpenChange={setAdjustOpen}
      />
      <Dialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete this product?"
        description="Stock history stays in your reports. The product will be hidden from selling and stock lists."
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" disabled={deleting} onClick={() => void deleteProduct()}>
              <Trash2 size={15} /> Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted">
          You are deleting <span className="font-semibold text-ink">{product.name}</span>.
        </p>
      </Dialog>
    </div>
  );
}

export default function StockDetailPage() {
  return (
    <PermissionGate flag="stock.view">
      <StockDetailContent />
    </PermissionGate>
  );
}
