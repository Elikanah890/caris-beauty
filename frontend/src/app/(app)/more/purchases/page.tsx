'use client';

import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  ChevronRight,
  Loader2,
  PackagePlus,
  Plus,
  ShoppingBag,
  Trash2,
  Truck
} from 'lucide-react';
import { PageHeader, EmptyState } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { Input, Label, Select } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { PermissionGate } from '@/components/permission-gate';
import { toast } from '@/components/ui/toast';
import { useCatalog } from '@/lib/hooks';
import { useAuthStore } from '@/store/auth-store';
import { recordPurchase, LocalRuleError } from '@/lib/repo';
import { db } from '@/lib/db';
import { apiRequest } from '@/lib/api';
import { defaultChoice, roundTZS } from '@/lib/pricing';
import { eatDateKey, formatDate, formatQty, formatTZS } from '@/lib/format';
import { t } from '@/lib/strings';
import { uuid } from '@/lib/utils';
import type { Purchase, PurchaseItem, Supplier } from '@/lib/types';

interface DraftRow {
  key: string;
  productId: string;
  unitId: string;
  qty: string;
  costPerUnit: string;
}

const headerSchema = z.object({
  supplierId: z.string().optional(),
  reference: z.string().optional(),
  notes: z.string().optional()
});

type HeaderForm = z.infer<typeof headerSchema>;

interface PurchaseWithItems extends Purchase {
  items: PurchaseItem[];
}

function PurchasesContent() {
  const catalog = useCatalog();
  const user = useAuthStore((state) => state.user);
  const device = useAuthStore((state) => state.device);
  const purchases = useLiveQuery(async () => {
    const rows = await db.purchases.orderBy('purchasedAt').reverse().limit(100).toArray();
    const items = await db.purchase_items.toArray();
    const byPurchase = new Map<string, PurchaseItem[]>();
    for (const item of items) {
      const list = byPurchase.get(item.purchaseId) ?? [];
      list.push(item);
      byPurchase.set(item.purchaseId, list);
    }
    return rows
      .map((row) => ({ ...row, items: byPurchase.get(row.id) ?? [] }))
      .filter((row) => row.items.length > 0) as PurchaseWithItems[];
  }, []);
  const suppliers = useLiveQuery(() => db.suppliers.filter((s) => !s.deletedAt).toArray(), []);
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<PurchaseWithItems | null>(null);
  const [rows, setRows] = useState<DraftRow[]>([
    { key: uuid(), productId: '', unitId: '', qty: '1', costPerUnit: '' }
  ]);
  const [error, setError] = useState<string | null>(null);
  const [supplierOpen, setSupplierOpen] = useState(false);
  const [supplierName, setSupplierName] = useState('');
  const [supplierPhone, setSupplierPhone] = useState('');
  const [supplierError, setSupplierError] = useState<string | null>(null);
  const [savingSupplier, setSavingSupplier] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { isSubmitting }
  } = useForm<HeaderForm>({
    resolver: zodResolver(headerSchema),
    defaultValues: { supplierId: '', reference: '', notes: '' }
  });

  const monthKey = eatDateKey().slice(0, 7);
  const monthSpend = (purchases ?? [])
    .filter((purchase) => eatDateKey(purchase.purchasedAt).startsWith(monthKey))
    .reduce((sum, purchase) => sum + Number(purchase.totalCost), 0);

  const draftTotal = useMemo(
    () =>
      rows.reduce(
        (sum, row) => sum + roundTZS((Number(row.qty) || 0) * (Number(row.costPerUnit) || 0)),
        0
      ),
    [rows]
  );

  const updateRow = (key: string, patch: Partial<DraftRow>) => {
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, ...patch } : row))
    );
  };

  const onProductChange = (key: string, productId: string) => {
    const product = catalog?.products.find((entry) => entry.id === productId);
    if (!product) {
      updateRow(key, { productId, unitId: '', costPerUnit: '' });
      return;
    }
    const baseChoice =
      product.choices.find(
        (choice) => choice.isBase || choice.unitId === product.baseUnitId
      ) ?? defaultChoice(product.choices);
    updateRow(key, {
      productId,
      unitId: baseChoice.unitId,
      costPerUnit: String(Math.round(Number(product.costPerBase)))
    });
  };

  const onUnitChange = (key: string, unitId: string) => {
    const row = rows.find((entry) => entry.key === key);
    const product = catalog?.products.find((entry) => entry.id === row?.productId);
    const choice = product?.choices.find((entry) => entry.unitId === unitId);
    updateRow(key, {
      unitId,
      ...(product && choice
        ? { costPerUnit: String(Math.round(Number(product.costPerBase) * choice.factor)) }
        : {})
    });
  };

  const addSupplier = async () => {
    const name = supplierName.trim();
    if (name.length < 2) {
      setSupplierError('Enter at least 2 characters');
      return;
    }
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setSupplierError('Adding suppliers needs internet');
      return;
    }
    setSavingSupplier(true);
    setSupplierError(null);
    try {
      const res = await apiRequest<{ supplier: Supplier }>('/suppliers', {
        method: 'POST',
        body: { name, phone: supplierPhone.trim() || null }
      });
      await db.suppliers.put({
        ...res.supplier,
        updatedAt: new Date().toISOString()
      });
      setValue('supplierId', res.supplier.id, {
        shouldDirty: true,
        shouldValidate: true
      });
      toast.success('Supplier added', res.supplier.name);
      setSupplierName('');
      setSupplierPhone('');
      setSupplierOpen(false);
    } catch (err) {
      setSupplierError(err instanceof Error ? err.message : 'Could not add supplier');
    } finally {
      setSavingSupplier(false);
    }
  };

  const submit = async (header: HeaderForm) => {
    if (!user) return;
    setError(null);
    if (!header.supplierId) {
      setError('Select a supplier');
      return;
    }
    const selected = rows.filter(
      (row) => row.productId && Number(row.qty) > 0
    );
    if (selected.length === 0) {
      setError('Add at least one product');
      return;
    }
    if (selected.some((row) => !row.unitId)) {
      setError('Choose a unit for each product');
      return;
    }
    if (
      selected.some(
        (row) =>
          !Number.isFinite(Number(row.costPerUnit)) ||
          Number(row.costPerUnit) < 0
      )
    ) {
      setError('Enter a valid cost for each product');
      return;
    }
    const items = selected.map((row) => ({
      productId: row.productId,
      unitId: row.unitId,
      qty: Number(row.qty),
      costPerUnit: Number(row.costPerUnit) || 0
    }));
    try {
      await recordPurchase({
        supplierId: header.supplierId,
        reference: header.reference || null,
        notes: header.notes || null,
        items,
        user,
        device
      });
      toast.success(
        'Purchase recorded — stock updated',
        `${items.length} item${items.length === 1 ? '' : 's'} added.`
      );
      setOpen(false);
      reset({ supplierId: '', reference: '', notes: '' });
      setRows([{ key: uuid(), productId: '', unitId: '', qty: '1', costPerUnit: '' }]);
      setSupplierOpen(false);
      setSupplierName('');
      setSupplierPhone('');
      setSupplierError(null);
    } catch (err) {
      setError(err instanceof LocalRuleError ? err.message : 'Could not record purchase');
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow={t.purchases.title}
        title={t.purchases.title}
        subtitle={t.purchases.subtitle}
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus size={15} /> {t.purchases.add}
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <span className="inline-flex rounded-xl bg-brand-50 p-2.5 text-brand-600">
              <ShoppingBag size={17} />
            </span>
            <p className="mt-3 text-[10px] font-medium uppercase tracking-wide text-muted">
              {t.purchases.title}
            </p>
            <p className="numeric mt-0.5 font-display text-xl font-semibold text-ink">
              {purchases?.length ?? 0}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <span className="inline-flex rounded-xl bg-[#eef4ec] p-2.5 text-moss">
              <Truck size={17} />
            </span>
            <p className="mt-3 text-[10px] font-medium uppercase tracking-wide text-muted">
              This month
            </p>
            <p className="numeric mt-0.5 font-display text-xl font-semibold text-ink">
              {formatTZS(monthSpend)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <span className="inline-flex rounded-xl bg-[#fdf3dd] p-2.5 text-[#9a7020]">
              <PackagePlus size={17} />
            </span>
            <p className="mt-3 text-[10px] font-medium uppercase tracking-wide text-muted">
              Suppliers
            </p>
            <p className="numeric mt-0.5 font-display text-xl font-semibold text-ink">
              {suppliers?.length ?? 0}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="surface mt-4 overflow-hidden">
        {!purchases ? (
          <div className="h-40 animate-pulse bg-cream/50" />
        ) : purchases.length === 0 ? (
          <EmptyState
            title={t.purchases.empty}
            description="Record a supplier delivery to add stock and update your cost price."
            icon={<Truck size={22} />}
            action={<Button onClick={() => setOpen(true)}>Record purchase</Button>}
          />
        ) : (
          <div className="divide-y divide-line/70">
            {purchases.map((purchase) => (
              <button
                key={purchase.id}
                type="button"
                onClick={() => setDetail(purchase)}
                className="flex w-full items-center gap-3 p-3.5 text-left transition hover:bg-cream/40"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-cream text-brand-600">
                  <Truck size={17} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs font-semibold text-ink">
                      {purchase.supplierName ?? 'No supplier'}
                    </p>
                    {purchase.reference && <Badge variant="default">{purchase.reference}</Badge>}
                  </div>
                  <p className="text-[10px] text-muted">
                    {formatDate(purchase.purchasedAt)} · {purchase.items.length} item
                    {purchase.items.length === 1 ? '' : 's'} · {purchase.createdByName ?? '—'}
                  </p>
                </div>
                <p className="numeric text-sm font-bold text-ink">{formatTZS(purchase.totalCost)}</p>
                <ChevronRight size={15} className="text-muted" />
              </button>
            ))}
          </div>
        )}
      </div>

      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={t.purchases.add}
        description="Offline-friendly. Stock and cost prices update on this device now."
        size="xl"
      >
        <form onSubmit={handleSubmit(submit)} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="purchase-supplier">Supplier</Label>
              <div className="flex gap-2">
                <Select
                  id="purchase-supplier"
                  {...register('supplierId')}
                  className="flex-1"
                >
                  <option value="">Select supplier</option>
                  {(suppliers ?? []).map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
                </Select>
                {user?.role === 'owner' && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSupplierOpen((value) => !value);
                      setSupplierError(null);
                    }}
                  >
                    <Plus size={13} /> Add
                  </Button>
                )}
              </div>
              {supplierOpen && user?.role === 'owner' && (
                <div className="mt-2 rounded-xl border border-line bg-cream/60 p-3">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input
                      value={supplierName}
                      onChange={(event) => {
                        setSupplierName(event.target.value);
                        setSupplierError(null);
                      }}
                      placeholder="Supplier name"
                    />
                    <Input
                      value={supplierPhone}
                      onChange={(event) => setSupplierPhone(event.target.value)}
                      placeholder="Phone (optional)"
                      inputMode="tel"
                    />
                  </div>
                  {supplierError && (
                    <p className="mt-2 text-[11px] font-medium text-berry">
                      {supplierError}
                    </p>
                  )}
                  <div className="mt-2 flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void addSupplier()}
                      disabled={savingSupplier || supplierName.trim().length < 2}
                    >
                      {savingSupplier ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : null}
                      Save
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setSupplierOpen(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
            <div>
              <Label htmlFor="purchase-ref">Reference</Label>
              <Input id="purchase-ref" placeholder="Invoice number" {...register('reference')} />
            </div>
          </div>

          <div className="rounded-2xl border border-line">
            <div className="flex items-center justify-between border-b border-line px-3 py-2">
              <p className="text-[11px] font-semibold text-ink">{t.purchases.items}</p>
              <Button
                type="button"
                variant="soft"
                size="sm"
                onClick={() =>
                  setRows((current) => [
                    ...current,
                    { key: uuid(), productId: '', unitId: '', qty: '1', costPerUnit: '' }
                  ])
                }
              >
                <Plus size={13} /> Add item
              </Button>
            </div>
            <div className="space-y-2 p-2.5">
              {rows.map((row) => {
                const product = catalog?.products.find((entry) => entry.id === row.productId);
                return (
                  <div key={row.key} className="rounded-xl border border-line bg-white p-3">
                    <div className="flex items-end gap-2">
                      <div className="min-w-0 flex-1">
                        <Label className="mb-1 text-[9px]">Product</Label>
                        <Select
                          value={row.productId}
                          onChange={(event) => onProductChange(row.key, event.target.value)}
                        >
                          <option value="">Choose product</option>
                          {(catalog?.products ?? [])
                            .filter((entry) => !entry.deletedAt)
                            .map((entry) => (
                              <option key={entry.id} value={entry.id}>
                                {entry.name}
                                {entry.sku ? ` (${entry.sku})` : ''}
                              </option>
                            ))}
                        </Select>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setRows((current) => current.filter((entry) => entry.key !== row.key))
                        }
                        className="mb-0.5 flex h-9 w-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-[#fbecef] hover:text-berry"
                        aria-label="Remove item"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>

                    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                      <div>
                        <Label className="mb-1 text-[9px]">Qty</Label>
                        <Input
                          type="number"
                          min={0.001}
                          step="any"
                          value={row.qty}
                          onChange={(event) => updateRow(row.key, { qty: event.target.value })}
                        />
                      </div>
                      <div>
                        <Label className="mb-1 text-[9px]">Unit</Label>
                        <Select
                          value={row.unitId}
                          onChange={(event) => onUnitChange(row.key, event.target.value)}
                          className="h-10 text-xs"
                        >
                          <option value="">Select unit</option>
                          {(product?.choices ?? []).map((choice) => (
                            <option key={choice.unitId} value={choice.unitId}>
                              {choice.unitName} ({choice.unitSymbol})
                            </option>
                          ))}
                        </Select>
                      </div>
                      <div className="col-span-2 sm:col-span-1">
                        <Label className="mb-1 text-[9px]">Cost / unit</Label>
                        <Input
                          type="number"
                          min={0}
                          step={1}
                          value={row.costPerUnit}
                          onChange={(event) =>
                            updateRow(row.key, { costPerUnit: event.target.value })
                          }
                        />
                      </div>
                    </div>

                    <div className="mt-2 flex items-center justify-between rounded-lg bg-cream/70 px-3 py-1.5">
                      <span className="text-[10px] text-muted">Line total</span>
                      <span className="numeric text-sm font-semibold text-ink">
                        {formatTZS(
                          roundTZS((Number(row.qty) || 0) * (Number(row.costPerUnit) || 0))
                        )}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center justify-between border-t border-line px-3 py-2.5">
              <span className="text-[11px] text-muted">Total cost</span>
              <span className="numeric font-display text-lg font-semibold text-ink">
                {formatTZS(draftTotal)}
              </span>
            </div>
          </div>

          <div>
            <Label htmlFor="purchase-notes">Notes (optional)</Label>
            <Input id="purchase-notes" {...register('notes')} />
          </div>

          {error && (
            <div className="rounded-xl border border-[#f0cdd5] bg-[#fbecef] px-3 py-2 text-xs font-medium text-berry">
              {error}
            </div>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || draftTotal <= 0}>
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackagePlus size={15} />}
              Record purchase
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={Boolean(detail)}
        onOpenChange={(open) => !open && setDetail(null)}
        title={`Purchase · ${detail?.reference ?? detail?.supplierName ?? 'Details'}`}
        description={detail ? formatDate(detail.purchasedAt) : undefined}
        size="md"
      >
        {detail && (
          <div>
            <div className="space-y-1">
              {detail.items.map((item) => (
                <div key={item.id} className="flex items-center justify-between rounded-xl border border-line px-3 py-2">
                  <div>
                    <p className="text-xs font-semibold text-ink">{item.productName}</p>
                    <p className="text-[10px] text-muted">
                      {formatQty(item.qty)} {item.unitSymbol} · {formatTZS(item.costPerBase)}/base
                    </p>
                  </div>
                  <p className="numeric text-xs font-bold text-ink">{formatTZS(item.lineTotal)}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between rounded-xl bg-ink px-3 py-2.5 text-white">
              <span className="text-xs">Total</span>
              <span className="numeric text-sm font-bold">{formatTZS(detail.totalCost)}</span>
            </div>
            {detail.notes && <p className="mt-2 text-[11px] text-muted">{detail.notes}</p>}
          </div>
        )}
      </Dialog>
    </div>
  );
}

export default function PurchasesPage() {
  return (
    <PermissionGate flag="stock.receive">
      <PurchasesContent />
    </PermissionGate>
  );
}
