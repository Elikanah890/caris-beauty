'use client';

import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Building2,
  Download,
  FileDown,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  ShieldAlert,
  Store,
  Tag,
  Trash2,
  Upload,
  WifiOff
} from 'lucide-react';
import { PageHeader } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { Input, Label, Textarea } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { PermissionGate } from '@/components/permission-gate';
import { toast } from '@/components/ui/toast';
import { useAuthStore } from '@/store/auth-store';
import { db } from '@/lib/db';
import { apiRequest } from '@/lib/api';
import { downloadJson, readJsonFile } from '@/lib/export';
import { formatDateTime } from '@/lib/format';
import { forceFullSync } from '@/lib/reset';
import { t } from '@/lib/strings';
import type { Business, Category } from '@/lib/types';

const schema = z.object({
  name: z.string().min(2, 'Enter the business name'),
  tin: z.string().optional(),
  vrn: z.string().optional(),
  efdDeviceId: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  receiptFooter: z.string().optional()
});

type FormValues = z.infer<typeof schema>;

const BACKUP_TABLES = [
  'business',
  'units',
  'categories',
  'users',
  'devices',
  'products',
  'product_units',
  'customers',
  'suppliers',
  'purchases',
  'purchase_items',
  'sales',
  'sale_items',
  'payments',
  'stock_movements',
  'expenses',
  'audit_log'
] as const;

function SettingsContent() {
  const business = useAuthStore((state) => state.business);
  const setBusiness = useAuthStore((state) => state.setBusiness);
  const categories = useLiveQuery(() => db.categories.orderBy('name').toArray(), []);
  const products = useLiveQuery(() => db.products.filter((product) => !product.deletedAt).toArray(), []);
  const [categoryName, setCategoryName] = useState('');
  const [categoryColor, setCategoryColor] = useState('#e7a6a2');
  const [addingCategory, setAddingCategory] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('#e7a6a2');
  const [savingCategory, setSavingCategory] = useState(false);
  const [deletingCategory, setDeletingCategory] = useState<Category | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const online = typeof navigator === 'undefined' ? true : navigator.onLine;

  const productsInDeletingCategory = deletingCategory
    ? (products ?? []).filter((product) => product.categoryId === deletingCategory.id).length
    : 0;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting }
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      tin: '',
      vrn: '',
      efdDeviceId: '',
      phone: '',
      address: '',
      receiptFooter: 'Asante kwa kununua!'
    }
  });

  useEffect(() => {
    if (!business) return;
    reset({
      name: business.name,
      tin: business.tin ?? '',
      vrn: business.vrn ?? '',
      efdDeviceId: business.efdDeviceId ?? '',
      phone: business.phone ?? '',
      address: business.address ?? '',
      receiptFooter: business.receiptFooter ?? 'Asante kwa kununua!'
    });
  }, [business, reset]);

  const save = async (values: FormValues) => {
    if (!navigator.onLine) {
      setError('Shop settings need internet to sync. Try again when online.');
      return;
    }
    setError(null);
    try {
      const res = await apiRequest<{ business: Business }>('/business', {
        method: 'PATCH',
        body: {
          name: values.name,
          tin: values.tin || null,
          vrn: values.vrn || null,
          efdDeviceId: values.efdDeviceId || null,
          phone: values.phone || null,
          address: values.address || null,
          receiptFooter: values.receiptFooter || null
        }
      });
      await db.business.put(res.business);
      setBusiness(res.business);
      toast.success(t.settings.saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save settings');
    }
  };

  const addCategory = async () => {
    if (!categoryName.trim()) return;
    if (!navigator.onLine) {
      toast.error('Adding categories needs internet');
      return;
    }
    setAddingCategory(true);
    try {
      const res = await apiRequest<{ category: Category }>('/categories', {
        method: 'POST',
        body: { name: categoryName.trim(), color: categoryColor }
      });
      await db.categories.put({
        ...res.category,
        updatedAt: new Date().toISOString()
      });
      setCategoryName('');
      toast.success('Category added');
    } catch (err) {
      toast.error('Could not add category', err instanceof Error ? err.message : undefined);
    } finally {
      setAddingCategory(false);
    }
  };

  const openEditCategory = (category: Category) => {
    setEditingCategory(category);
    setEditName(category.name);
    setEditColor(category.color ?? '#e7a6a2');
  };

  const saveCategory = async () => {
    if (!editingCategory) return;
    const name = editName.trim();
    if (!name) {
      toast.error('Enter a category name');
      return;
    }
    if (!navigator.onLine) {
      toast.error('Editing categories needs internet');
      return;
    }
    setSavingCategory(true);
    try {
      const res = await apiRequest<{ category: Category }>(
        `/categories/${editingCategory.id}`,
        { method: 'PATCH', body: { name, color: editColor } }
      );
      await db.categories.put({
        ...editingCategory,
        ...res.category,
        updatedAt: new Date().toISOString()
      });
      toast.success('Category updated');
      setEditingCategory(null);
    } catch (err) {
      toast.error('Could not update category', err instanceof Error ? err.message : undefined);
    } finally {
      setSavingCategory(false);
    }
  };

  const removeCategory = async () => {
    if (!deletingCategory) return;
    if (!navigator.onLine) {
      toast.error('Deleting categories needs internet');
      return;
    }
    setDeleting(true);
    try {
      await apiRequest(`/categories/${deletingCategory.id}`, { method: 'DELETE' });
      await db.transaction('rw', db.categories, db.products, async () => {
        await db.categories.delete(deletingCategory.id);
        await db.products
          .where('categoryId')
          .equals(deletingCategory.id)
          .modify({ categoryId: null, categoryName: null });
      });
      toast.success('Category deleted');
      setDeletingCategory(null);
    } catch (err) {
      toast.error('Could not delete category', err instanceof Error ? err.message : undefined);
    } finally {
      setDeleting(false);
    }
  };

  const exportBackup = async () => {
    const data: Record<string, unknown> = {
      exportedAt: new Date().toISOString(),
      schemaVersion: 1,
      app: 'duka'
    };
    for (const table of BACKUP_TABLES) {
      data[table] = await db.table(table).toArray();
    }
    downloadJson(`caris-backup-${new Date().toISOString().slice(0, 10)}.json`, data);
    toast.success('Backup exported', 'Keep the JSON file somewhere safe.');
  };

  const importBackup = async (file: File) => {
    setImporting(true);
    try {
      const raw = (await readJsonFile(file)) as Record<string, unknown>;
      if (raw.app !== 'duka') throw new Error('This is not a Caris Beauty backup file');
      await db.transaction('rw', BACKUP_TABLES.map((table) => db.table(table)), async () => {
        for (const table of BACKUP_TABLES) {
          const rows = raw[table];
          if (!Array.isArray(rows) || rows.length === 0) continue;
          await db.table(table).bulkPut(rows);
        }
      });
      toast.success('Backup imported', 'Reloading local data…');
      setTimeout(() => window.location.reload(), 900);
    } catch (err) {
      toast.error('Could not import backup', err instanceof Error ? err.message : undefined);
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const refreshAllData = async () => {
    if (!navigator.onLine) {
      toast.error('Connect to the internet to refresh data');
      return;
    }

    setResetting(true);
    try {
      await forceFullSync();
    } catch (err) {
      setResetting(false);
      setResetOpen(false);
      toast.error(
        'Could not refresh data',
        err instanceof Error ? err.message : 'Please try again.'
      );
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Configuration"
        title={t.settings.title}
        subtitle={t.settings.subtitle}
      />

      {!online && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-[#f2dfb5] bg-[#fdf3dd] px-3 py-2.5 text-xs text-[#8b681f]">
          <WifiOff size={15} /> Settings changes need internet. Data and reports still work offline.
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center gap-2">
              <span className="rounded-xl bg-brand-50 p-2 text-brand-600">
                <Store size={16} />
              </span>
              <CardTitle>Business details</CardTitle>
            </div>
            <Badge variant="default">{formatDateTime(business?.updatedAt)}</Badge>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(save)} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label htmlFor="biz-name">{t.settings.businessName}</Label>
                  <Input id="biz-name" {...register('name')} />
                  {errors.name && <p className="mt-1 text-xs text-berry">{errors.name.message}</p>}
                </div>
                <div>
                  <Label htmlFor="biz-tin">{t.settings.tin}</Label>
                  <Input id="biz-tin" placeholder="123-456-789" {...register('tin')} />
                </div>
                <div>
                  <Label htmlFor="biz-vrn">{t.settings.vrn}</Label>
                  <Input id="biz-vrn" placeholder="Optional" {...register('vrn')} />
                </div>
                <div>
                  <Label htmlFor="biz-efd">{t.settings.efdDevice}</Label>
                  <Input id="biz-efd" placeholder="EFD serial" {...register('efdDeviceId')} />
                </div>
                <div>
                  <Label htmlFor="biz-phone">{t.settings.phone}</Label>
                  <Input id="biz-phone" placeholder="+255..." {...register('phone')} />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="biz-address">{t.settings.address}</Label>
                  <Input id="biz-address" {...register('address')} />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="biz-footer">{t.settings.receiptFooter}</Label>
                  <Textarea id="biz-footer" rows={2} {...register('receiptFooter')} />
                </div>
              </div>
              {error && (
                <div className="rounded-xl border border-[#f0cdd5] bg-[#fbecef] px-3 py-2 text-xs font-medium text-berry">
                  {error}
                </div>
              )}
              <div className="flex justify-end">
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Building2 size={15} />}
                  {t.common.save}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <span className="rounded-xl bg-[#eef4ec] p-2 text-moss">
                  <Tag size={16} />
                </span>
                <CardTitle>Categories</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                {(categories ?? []).map((category) => (
                  <div
                    key={category.id}
                    className="flex items-center justify-between gap-2 rounded-xl px-2 py-1.5 transition hover:bg-cream/60"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className="h-3 w-3 shrink-0 rounded-full border border-line"
                        style={{ background: category.color ?? '#e7a6a2' }}
                      />
                      <span className="truncate text-xs font-medium text-ink">{category.name}</span>
                      <span className="shrink-0 text-[10px] text-muted">
                        {(products ?? []).filter((product) => product.categoryId === category.id).length}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => openEditCategory(category)}
                        className="rounded-md p-1.5 text-muted transition hover:bg-white hover:text-ink"
                        aria-label={`Edit ${category.name}`}
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeletingCategory(category)}
                        className="rounded-md p-1.5 text-muted transition hover:bg-[#fbecef] hover:text-berry"
                        aria-label={`Delete ${category.name}`}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
                {categories?.length === 0 && (
                  <p className="px-2 py-1 text-[11px] text-muted">No categories yet.</p>
                )}
              </div>

              <div className="mt-3 space-y-2 border-t border-line/70 pt-3">
                <div className="flex gap-1.5">
                  <Input
                    value={categoryName}
                    onChange={(event) => setCategoryName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        void addCategory();
                      }
                    }}
                    placeholder="New category"
                    className="h-9 text-xs"
                  />
                  <label
                    className="relative flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-line bg-white"
                    title="Category colour"
                  >
                    <span
                      className="h-4 w-4 rounded-full border border-black/10"
                      style={{ background: categoryColor }}
                    />
                    <input
                      type="color"
                      value={categoryColor}
                      onChange={(event) => setCategoryColor(event.target.value)}
                      className="absolute inset-0 cursor-pointer opacity-0"
                      aria-label="Category colour"
                    />
                  </label>
                  <Button
                    size="sm"
                    disabled={addingCategory || !categoryName}
                    onClick={() => void addCategory()}
                  >
                    {addingCategory ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus size={14} />}
                  </Button>
                </div>
                <p className="text-[10px] leading-relaxed text-muted">
                  Add, rename, recolour or delete categories. Deleting a category leaves its
                  products uncategorised.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <span className="rounded-xl bg-[#edf3f7] p-2 text-sky">
                  <Download size={16} />
                </span>
                <CardTitle>Backup & EFD</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button variant="outline" className="w-full justify-start" onClick={() => void exportBackup()}>
                <Download size={14} /> Export JSON backup
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => fileRef.current?.click()}
                disabled={importing}
              >
                {importing ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                Import JSON backup
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void importBackup(file);
                }}
              />
              <p className="text-[10px] leading-relaxed text-muted">
                Backup includes catalog, staff, sales and stock history. PIN and sync queue are
                not exported. Import merges rows on this device.
              </p>
              <a
                href="/reports"
                className="flex items-center justify-center gap-1.5 rounded-xl bg-brand-50 px-3 py-2 text-[11px] font-semibold text-brand-700"
              >
                <FileDown size={13} /> EFD CSV export in Reports
              </a>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <span className="rounded-xl bg-[#fbecef] p-2 text-berry">
                  <RefreshCw size={16} />
                </span>
                <CardTitle>Refresh from server</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-[11px] leading-relaxed text-muted">
                Use this if product counts, stock, or sales on this device look out of
                date.
              </p>
              <Button
                variant="outline"
                className="w-full justify-start border-[#f0cdd5] text-berry hover:border-berry/40 hover:bg-[#fbecef]"
                onClick={() => setResetOpen(true)}
              >
                <RefreshCw size={14} /> Refresh All Data from Server
              </Button>
              <p className="text-[10px] leading-relaxed text-muted">
                This clears local products, sales and pending changes, signs you out,
                and downloads a fresh copy. Sign in online as the owner if prompted.
                Export a backup first if you need the unsynced data.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog
        open={Boolean(editingCategory)}
        onOpenChange={(open) => {
          if (!open && !savingCategory) setEditingCategory(null);
        }}
        title="Edit category"
        description="Rename or recolour this category."
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => setEditingCategory(null)}
              disabled={savingCategory}
            >
              Cancel
            </Button>
            <Button onClick={() => void saveCategory()} disabled={savingCategory}>
              {savingCategory ? <Loader2 size={15} className="animate-spin" /> : null}
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <Label htmlFor="edit-category-name">Name</Label>
            <Input
              id="edit-category-name"
              value={editName}
              onChange={(event) => setEditName(event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="edit-category-color">Colour</Label>
            <div className="flex items-center gap-2">
              <input
                id="edit-category-color"
                type="color"
                value={editColor}
                onChange={(event) => setEditColor(event.target.value)}
                className="h-9 w-12 cursor-pointer rounded-lg border border-line bg-white p-0.5"
              />
              <Input
                value={editColor}
                onChange={(event) => setEditColor(event.target.value)}
                className="h-9 w-28 font-mono text-xs"
              />
            </div>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={Boolean(deletingCategory)}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeletingCategory(null);
        }}
        title="Delete category?"
        description={
          deletingCategory
            ? `Delete “${deletingCategory.name}”? ${productsInDeletingCategory} product${
                productsInDeletingCategory === 1 ? '' : 's'
              } will become uncategorised.`
            : undefined
        }
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => setDeletingCategory(null)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button variant="danger" onClick={() => void removeCategory()} disabled={deleting}>
              {deleting ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
              Delete
            </Button>
          </>
        }
      >
        <div className="flex items-start gap-3 rounded-2xl border border-[#f0cdd5] bg-[#fbecef] p-3 text-berry">
          <ShieldAlert size={18} className="mt-0.5 shrink-0" />
          <p className="text-xs leading-relaxed">
            This cannot be undone. Product history is kept, but those products will no longer
            belong to a category.
          </p>
        </div>
      </Dialog>

      <Dialog
        open={resetOpen}
        onOpenChange={(open) => {
          if (!resetting) setResetOpen(open);
        }}
        title="Refresh all data?"
        description="This will clear all local data (products, sales, pending changes) on this device and download fresh data from the server. Do you want to continue?"
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => setResetOpen(false)}
              disabled={resetting}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => void refreshAllData()}
              disabled={resetting}
            >
              {resetting ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <RefreshCw size={15} />
              )}
              {resetting ? 'Refreshing…' : 'Yes, refresh all data'}
            </Button>
          </>
        }
      >
        <div className="flex items-start gap-3 rounded-2xl border border-[#f2dfb5] bg-[#fdf3dd] p-3 text-[#8b681f]">
          <ShieldAlert size={18} className="mt-0.5 shrink-0" />
          <p className="text-xs leading-relaxed">
            You will be signed out and the offline PIN on this device will be removed.
            Sign back in with your owner email and password. Any offline sales or changes
            that have not reached the server will be removed. This cannot be undone.
          </p>
        </div>
      </Dialog>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <PermissionGate ownerOnly>
      <SettingsContent />
    </PermissionGate>
  );
}
