'use client';

import { useEffect, useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useLiveQuery } from 'dexie-react-hooks';
import { Loader2, PackagePlus, Plus, Trash2 } from 'lucide-react';
import { Dialog } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input, Label, Select } from '../ui/input';
import { toast } from '../ui/toast';
import { useCatalog, type CatalogProduct } from '@/lib/hooks';
import { useAuthStore } from '@/store/auth-store';
import { db } from '@/lib/db';
import { apiRequest } from '@/lib/api';
import { pullAll, requestSync } from '@/lib/sync';
import { recordAdjustment, recordPurchase, LocalRuleError } from '@/lib/repo';
import { can } from '@/lib/permissions';
import { defaultChoice, roundTZS, stockDisplay } from '@/lib/pricing';
import { formatQty, formatTZS } from '@/lib/format';
import { t } from '@/lib/strings';

const productSchema = z
  .object({
    name: z.string().min(1, 'Product name is required'),
    sku: z.string().optional(),
    barcode: z.string().optional(),
    categoryId: z.string().optional(),
    baseUnitId: z.string().min(1, 'Choose a base unit'),
    pricePerBase: z.coerce.number().int().min(0),
    reorderLevelBase: z.coerce.number().int().min(0).default(0),
    expiryDate: z.string().optional(),
    supplierId: z.string().optional(),
    supplierName: z.string().optional(),
    quantity: z.coerce.number().int().positive('Quantity must be greater than zero'),
    costPerBase: z.coerce.number().int().positive('Cost must be greater than zero'),
    purchaseDate: z.string().optional(),
    conversions: z
      .array(
        z.object({
          unitId: z.string().min(1, 'Choose a unit'),
          factor: z.coerce.number().int().positive('Factor must be positive'),
          priceOverride: z
            .preprocess(
              (value) => (value === '' || value === undefined || value === null ? null : Number(value)),
              z.number().int().min(0).nullable()
            )
            .optional()
        })
      )
      .default([])
  })
  .refine(
    (values) => values.supplierId !== '__new__' || Boolean(values.supplierName?.trim()),
    { message: 'Enter the new supplier name', path: ['supplierName'] }
  );

type ProductForm = z.infer<typeof productSchema>;

export function CreateProductDialog({
  open,
  onOpenChange
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const catalog = useCatalog();
  const user = useAuthStore((state) => state.user);
  const [error, setError] = useState<string | null>(null);
  const [newCategory, setNewCategory] = useState('');
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [savingCategory, setSavingCategory] = useState(false);
  const baseUnits = (catalog?.units ?? []).filter((unit) => unit.isBase);
  const units = catalog?.units ?? [];

  const suppliers = useLiveQuery(() => db.suppliers.filter((supplier) => !supplier.deletedAt).toArray(), []);
  const today = new Date().toISOString().slice(0, 10);

  const form = useForm<ProductForm>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      name: '',
      baseUnitId: '00000000-0000-4000-8000-000000000001',
      pricePerBase: 0,
      reorderLevelBase: 0,
      supplierId: '',
      supplierName: '',
      quantity: 1,
      costPerBase: 0,
      purchaseDate: today,
      conversions: []
    }
  });
  const { control, register, handleSubmit, formState, reset, setValue, watch } = form;
  const { fields, append, remove } = useFieldArray({ control, name: 'conversions' });
  const baseUnitId = watch('baseUnitId');
  const baseUnit = units.find((unit) => unit.id === baseUnitId);
  const quantity = watch('quantity');
  const initialCost = watch('costPerBase');
  const supplierId = watch('supplierId');
  const initialTotal = Math.max(0, Math.round((Number(quantity) || 0) * (Number(initialCost) || 0)));

  useEffect(() => {
    if (!open) return;
    reset({
      name: '',
      baseUnitId: '00000000-0000-4000-8000-000000000001',
      pricePerBase: 0,
      reorderLevelBase: 0,
      supplierId: '',
      supplierName: '',
      quantity: 1,
      costPerBase: 0,
      purchaseDate: new Date().toISOString().slice(0, 10),
      conversions: []
    });
    setError(null);
  }, [open, reset]);

  const createCategory = async () => {
    if (!newCategory.trim()) return;
    setSavingCategory(true);
    try {
      const res = await apiRequest<{ category: { id: string; name: string; color?: string } }>(
        '/categories',
        { method: 'POST', body: { name: newCategory.trim() } }
      );
      await db.categories.put({
        id: res.category.id,
        name: res.category.name,
        color: res.category.color ?? null,
        updatedAt: new Date().toISOString()
      });
      setValue('categoryId', res.category.id);
      setNewCategory('');
      setShowNewCategory(false);
      toast.success('Category created');
    } catch (err) {
      toast.error('Could not create category', err instanceof Error ? err.message : undefined);
    } finally {
      setSavingCategory(false);
    }
  };

  const onSubmit = async (values: ProductForm) => {
    if (!navigator.onLine) {
      setError('Adding products needs internet. Stock-in and adjustments still work offline.');
      return;
    }
    if (!user || !can(user, 'stock.receive')) {
      setError('You need the stock.receive permission to add products.');
      return;
    }
    setError(null);
    try {
      const conversions = values.conversions
        .filter((conversion) => conversion.unitId && conversion.unitId !== values.baseUnitId)
        .map((conversion) => ({
          unitId: conversion.unitId,
          factor: conversion.factor,
          priceOverride:
            conversion.priceOverride === undefined || conversion.priceOverride === null
              ? null
              : Number(conversion.priceOverride)
        }));
      const supplierIsNew = values.supplierId === '__new__';
      await apiRequest('/products/with-stock', {
        method: 'POST',
        body: {
          product: {
            name: values.name,
            sku: values.sku || null,
            barcode: values.barcode || null,
            categoryId: values.categoryId || null,
            baseUnitId: values.baseUnitId,
            pricePerBase: values.pricePerBase,
            reorderLevelBase: values.reorderLevelBase,
            expiryDate: values.expiryDate || null,
            units: conversions
          },
          initialStock: {
            supplierId: supplierIsNew ? null : values.supplierId || null,
            supplierName: supplierIsNew ? values.supplierName?.trim() : null,
            quantity: values.quantity,
            costPerBase: values.costPerBase,
            purchaseDate: values.purchaseDate
              ? new Date(`${values.purchaseDate}T12:00:00`).toISOString()
              : new Date().toISOString()
          }
        }
      });
      // The product is already saved on the server. A refresh hiccup must not
      // look like a failed save (which would tempt the user to create it twice).
      try {
        await pullAll();
      } catch {
        requestSync(200);
      }
      toast.success('Product added with initial stock', values.name);
      requestSync(200);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add product');
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add product"
      description="Create the product and record its first stock purchase in one step."
      size="lg"
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="product-name">Product name</Label>
            <Input id="product-name" placeholder="e.g. Sugar" autoFocus {...register('name')} />
            {formState.errors.name && (
              <p className="mt-1 text-xs font-medium text-berry">{formState.errors.name.message}</p>
            )}
          </div>
          <div>
            <Label htmlFor="sku">SKU (optional)</Label>
            <Input id="sku" placeholder="SUG-001" {...register('sku')} />
          </div>
          <div>
            <Label htmlFor="barcode">Barcode (optional)</Label>
            <Input id="barcode" placeholder="Scan or type" {...register('barcode')} />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="category">Category</Label>
            <div className="flex gap-1.5">
              <Select id="category" {...register('categoryId')}>
                <option value="">Uncategorised</option>
                {(catalog?.categories ?? []).map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="shrink-0"
                onClick={() => setShowNewCategory((value) => !value)}
                aria-label="Add category"
              >
                <Plus size={15} />
              </Button>
            </div>
            {showNewCategory && (
              <div className="mt-2 flex gap-1.5">
                <Input
                  value={newCategory}
                  onChange={(event) => setNewCategory(event.target.value)}
                  placeholder="New category"
                />
                <Button
                  type="button"
                  size="sm"
                  disabled={savingCategory}
                  onClick={() => void createCategory()}
                >
                  {savingCategory ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Add'}
                </Button>
              </div>
            )}
          </div>
          <div>
            <Label htmlFor="baseUnit">Base unit</Label>
            <Select id="baseUnit" {...register('baseUnitId')}>
              {baseUnits.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.name} ({unit.symbol})
                </option>
              ))}
            </Select>
            <p className="mt-1 text-[10px] text-muted">Stock is always tracked in this unit.</p>
          </div>
        </div>

        <div className="rounded-2xl border border-line bg-cream/50 p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="pricePerBase">Selling price per {baseUnit?.symbol ?? 'base unit'}</Label>
              <Input
                id="pricePerBase"
                type="number"
                min={0}
                step={1}
                {...register('pricePerBase')}
              />
            </div>
            <div>
              <Label htmlFor="reorder">Reorder level</Label>
              <Input
                id="reorder"
                type="number"
                min={0}
                step={1}
                {...register('reorderLevelBase')}
              />
            </div>
          </div>
          <p className="mt-2 text-[10px] leading-relaxed text-muted">
            Money is whole TZS. The buying cost is entered in the initial stock purchase below.
          </p>
        </div>

        <div>
          <Label htmlFor="expiry">Expiry date (optional)</Label>
          <Input id="expiry" type="date" {...register('expiryDate')} />
        </div>

        <div className="rounded-2xl border border-line p-3">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-ink">Selling units</p>
              <p className="text-[10px] text-muted">
                Optional conversions, e.g. kilogram = 1,000 grams.
              </p>
            </div>
            <Button
              type="button"
              variant="soft"
              size="sm"
              onClick={() =>
                append({ unitId: '', factor: 1000, priceOverride: null })
              }
            >
              <Plus size={13} /> Add unit
            </Button>
          </div>
          {fields.length === 0 && (
            <p className="rounded-xl bg-cream px-3 py-2 text-[11px] text-muted">
              This product will sell in its base unit only.
            </p>
          )}
          {fields.map((field, index) => (
            <div key={field.id} className="mt-2 grid grid-cols-[1fr_84px_1fr_30px] items-end gap-1.5">
              <div>
                <Label className="mb-1 text-[9px]">Unit</Label>
                <Select {...register(`conversions.${index}.unitId`)}>
                  <option value="">Choose</option>
                  {units
                    .filter((unit) => !unit.isBase)
                    .map((unit) => (
                      <option key={unit.id} value={unit.id}>
                        {unit.name}
                      </option>
                    ))}
                </Select>
              </div>
              <div>
                <Label className="mb-1 text-[9px]">Factor</Label>
                <Input type="number" min={1} {...register(`conversions.${index}.factor`)} />
              </div>
              <div>
                <Label className="mb-1 text-[9px]">Price override</Label>
                <Input
                  type="number"
                  min={0}
                  placeholder="auto"
                  {...register(`conversions.${index}.priceOverride`)}
                />
              </div>
              <button
                type="button"
                onClick={() => remove(index)}
                className="mb-1 flex h-9 w-8 items-center justify-center rounded-lg text-muted hover:bg-[#fbecef] hover:text-berry"
                aria-label="Remove unit"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-brand-200 bg-brand-50/40 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold text-ink">Initial stock purchase</p>
              <p className="text-[10px] text-muted">
                Required — records the purchase and adds stock in one step.
              </p>
            </div>
            <span className="shrink-0 rounded-lg bg-white px-2 py-1 text-[10px] font-semibold text-brand-700">
              {formatTZS(initialTotal)}
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="supplier">Supplier</Label>
              <Select id="supplier" {...register('supplierId')}>
                <option value="">No supplier</option>
                {(suppliers ?? []).map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
                <option value="__new__">+ Add New Supplier</option>
              </Select>
              {supplierId === '__new__' && (
                <div className="mt-2">
                  <Input placeholder="Supplier name" {...register('supplierName')} />
                  {formState.errors.supplierName && (
                    <p className="mt-1 text-xs font-medium text-berry">
                      {formState.errors.supplierName.message}
                    </p>
                  )}
                </div>
              )}
            </div>
            <div>
              <Label htmlFor="purchaseDate">Purchase date</Label>
              <Input id="purchaseDate" type="date" {...register('purchaseDate')} />
            </div>
            <div>
              <Label htmlFor="quantity">Quantity ({baseUnit?.symbol ?? 'base unit'})</Label>
              <Input id="quantity" type="number" min={1} step={1} {...register('quantity')} />
              {formState.errors.quantity && (
                <p className="mt-1 text-xs font-medium text-berry">
                  {formState.errors.quantity.message}
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="costPerBase">Cost per {baseUnit?.symbol ?? 'base unit'}</Label>
              <Input id="costPerBase" type="number" min={1} step={1} {...register('costPerBase')} />
              {formState.errors.costPerBase && (
                <p className="mt-1 text-xs font-medium text-berry">
                  {formState.errors.costPerBase.message}
                </p>
              )}
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-[#f0cdd5] bg-[#fbecef] px-3 py-2 text-xs font-medium text-berry">
            {error}
          </div>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={formState.isSubmitting}>
            {formState.isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackagePlus size={15} />}
            Add product
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

const stockInSchema = z.object({
  unitId: z.string().min(1, 'Choose a unit'),
  qty: z.coerce.number().positive('Quantity must be greater than zero'),
  costPerUnit: z.coerce.number().int().min(0),
  supplierId: z.string().optional(),
  reference: z.string().optional(),
  notes: z.string().optional()
});

type StockInForm = z.infer<typeof stockInSchema>;

export function StockInDialog({
  product,
  open,
  onOpenChange
}: {
  product: CatalogProduct | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const user = useAuthStore((state) => state.user);
  const device = useAuthStore((state) => state.device);
  const suppliers = useLiveQuery(() => db.suppliers.filter((s) => !s.deletedAt).toArray(), []);
  const [error, setError] = useState<string | null>(null);
  const primary = product ? defaultChoice(product.choices) : null;

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting }
  } = useForm<StockInForm>({
    resolver: zodResolver(stockInSchema),
    defaultValues: { unitId: primary?.unitId ?? '', qty: 1, costPerUnit: 0 }
  });

  const unitId = watch('unitId');
  const qty = watch('qty');
  const cost = watch('costPerUnit');
  const choice = product?.choices.find((entry) => entry.unitId === unitId) ?? primary;

  useEffect(() => {
    if (!open || !product || !primary) return;
    reset({
      unitId: primary.unitId,
      qty: 1,
      costPerUnit: Math.round(Number(product.costPerBase) * primary.factor),
      supplierId: '',
      reference: '',
      notes: ''
    });
    setError(null);
  }, [open, product, primary, reset]);

  useEffect(() => {
    if (!choice || !product) return;
    setValue(
      'costPerUnit',
      Math.round(Number(product.costPerBase) * choice.factor)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitId]);

  if (!product || !choice) return null;

  const onSubmit = async (values: StockInForm) => {
    if (!user) return;
    setError(null);
    try {
      await recordPurchase({
        supplierId: values.supplierId || null,
        reference: values.reference || null,
        notes: values.notes || null,
        items: [
          {
            productId: product.id,
            unitId: values.unitId,
            qty: values.qty,
            costPerUnit: values.costPerUnit
          }
        ],
        user,
        device
      });
      toast.success('Stock received', `${formatQty(values.qty)} ${choice.unitSymbol} of ${product.name}`);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof LocalRuleError ? err.message : 'Could not receive stock');
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`${t.stock.stockIn} · ${product.name}`}
      description={`Currently ${formatQty(stockDisplay(product.stockBase, choice))} ${choice.unitSymbol} on hand.`}
      size="md"
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="stock-unit">Unit</Label>
            <Select id="stock-unit" {...register('unitId')}>
              {product.choices.map((entry) => (
                <option key={entry.unitId} value={entry.unitId}>
                  {entry.unitName} ({entry.unitSymbol})
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="stock-qty">Quantity</Label>
            <Input id="stock-qty" type="number" min={0.001} step="any" {...register('qty')} />
            {errors.qty && <p className="mt-1 text-xs text-berry">{errors.qty.message}</p>}
          </div>
        </div>
        <div>
          <Label htmlFor="cost-unit">Cost per {choice.unitSymbol}</Label>
          <Input id="cost-unit" type="number" min={0} step={1} {...register('costPerUnit')} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="supplier">Supplier</Label>
            <Select id="supplier" {...register('supplierId')}>
              <option value="">None</option>
              {(suppliers ?? []).map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="ref">Reference</Label>
            <Input id="ref" placeholder="Invoice / note" {...register('reference')} />
          </div>
        </div>
        <div className="rounded-2xl bg-cream px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted">Total cost</span>
            <span className="numeric font-display text-xl font-semibold text-ink">
              {formatTZS(roundTZS((Number(qty) || 0) * (Number(cost) || 0)))}
            </span>
          </div>
        </div>
        {error && (
          <div className="rounded-xl border border-[#f0cdd5] bg-[#fbecef] px-3 py-2 text-xs font-medium text-berry">
            {error}
          </div>
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Receive stock
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

const adjustSchema = z.object({
  reason: z.enum(['damaged', 'expired', 'count_correction', 'other']),
  unitId: z.string().min(1),
  qty: z.coerce.number().min(0, 'Enter a quantity'),
  note: z.string().optional()
});

type AdjustForm = z.infer<typeof adjustSchema>;

export function AdjustStockDialog({
  product,
  open,
  onOpenChange
}: {
  product: CatalogProduct | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const user = useAuthStore((state) => state.user);
  const device = useAuthStore((state) => state.device);
  const [error, setError] = useState<string | null>(null);
  const primary = product ? defaultChoice(product.choices) : null;

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting }
  } = useForm<AdjustForm>({
    resolver: zodResolver(adjustSchema),
    defaultValues: { reason: 'damaged', unitId: primary?.unitId ?? '', qty: 0 }
  });

  const unitId = watch('unitId');
  const qty = watch('qty');
  const reason = watch('reason');
  const choice = product?.choices.find((entry) => entry.unitId === unitId) ?? primary;

  useEffect(() => {
    if (!open || !primary) return;
    reset({ reason: 'damaged', unitId: primary.unitId, qty: 0, note: '' });
    setError(null);
  }, [open, primary, reset]);

  if (!product || !choice) return null;

  const baseDelta =
    reason === 'count_correction'
      ? Math.round((Number(qty) || 0) * choice.factor) - product.stockBase
      : -Math.round((Number(qty) || 0) * choice.factor);
  const blockedIncrease = baseDelta > 0;
  const newStock = product.stockBase + baseDelta;

  const onSubmit = async (values: AdjustForm) => {
    if (!user) return;
    if (baseDelta > 0) {
      setError("To add new stock, use 'Record Stock Purchase' on the Purchases page.");
      return;
    }
    if (baseDelta === 0) {
      setError('Enter a quantity that changes the stock.');
      return;
    }
    setError(null);
    try {
      await recordAdjustment({
        productId: product.id,
        qtyBase: baseDelta,
        reason: values.reason,
        note: values.note || null,
        user,
        device
      });
      toast.success('Stock adjusted', `${product.name} is now ${formatQty(stockDisplay(newStock, choice))} ${choice.unitSymbol}`);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof LocalRuleError ? err.message : 'Could not adjust stock');
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Adjust · ${product.name}`}
      description="Use this only to correct stock (damaged, expired or count). To add stock, use Record Stock Purchase."
      size="md"
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
        <div>
          <Label htmlFor="reason">Reason</Label>
          <Select id="reason" {...register('reason')}>
            <option value="damaged">Damaged</option>
            <option value="expired">Expired</option>
            <option value="count_correction">Count correction</option>
            <option value="other">Other</option>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="adjust-unit">Unit</Label>
            <Select id="adjust-unit" {...register('unitId')}>
              {product.choices.map((entry) => (
                <option key={entry.unitId} value={entry.unitId}>
                  {entry.unitName} ({entry.unitSymbol})
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="adjust-qty">
              {reason === 'count_correction' ? 'New counted quantity' : 'Quantity'}
            </Label>
            <Input id="adjust-qty" type="number" min={0} step="any" {...register('qty')} />
            {errors.qty && <p className="mt-1 text-xs text-berry">{errors.qty.message}</p>}
          </div>
        </div>
        {blockedIncrease && (
          <div className="rounded-xl border border-[#f2dfb5] bg-[#fdf3dd] px-3 py-2 text-xs font-medium text-[#8b681f]">
            To add new stock, use 'Record Stock Purchase' on the Purchases page.
          </div>
        )}
        <div>
          <Label htmlFor="adjust-note">Note (optional)</Label>
          <Input id="adjust-note" placeholder="What happened?" {...register('note')} />
        </div>
        <div className="grid grid-cols-2 gap-2 rounded-2xl bg-cream p-3">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted">Current</p>
            <p className="numeric text-sm font-semibold text-ink">
              {formatQty(stockDisplay(product.stockBase, choice))} {choice.unitSymbol}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted">After adjustment</p>
            <p className={`numeric text-sm font-semibold ${newStock < 0 ? 'text-berry' : 'text-moss'}`}>
              {formatQty(stockDisplay(newStock, choice))} {choice.unitSymbol}
            </p>
          </div>
        </div>
        {error && (
          <div className="rounded-xl border border-[#f0cdd5] bg-[#fbecef] px-3 py-2 text-xs font-medium text-berry">
            {error}
          </div>
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting || baseDelta >= 0}>
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save adjustment
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
