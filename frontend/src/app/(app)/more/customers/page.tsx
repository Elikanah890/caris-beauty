'use client';

import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, Phone, Plus, Search, UserRound, Wallet, WifiOff } from 'lucide-react';
import { PageHeader, EmptyState } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { PermissionGate } from '@/components/permission-gate';
import { toast } from '@/components/ui/toast';
import { useCustomers, useSnapshot } from '@/lib/hooks';
import { db } from '@/lib/db';
import { apiRequest } from '@/lib/api';
import { formatTZS } from '@/lib/format';
import { t } from '@/lib/strings';
import type { Customer } from '@/lib/types';

const schema = z.object({
  name: z.string().min(2, 'Enter the customer name'),
  phone: z
    .string()
    .optional()
    .refine(
      (value) =>
        !value ||
        /^\+?255\d{9}$/.test(value.replace(/\s/g, '')) ||
        /^0\d{9}$/.test(value.replace(/\s/g, '')),
      'Use 07xx xxx xxx or +2557xx xxx xxx'
    ),
  email: z.string().email('Enter a valid email').or(z.literal('')).optional(),
  creditLimit: z.coerce.number().int().min(0).default(0),
  notes: z.string().optional()
});

type FormValues = z.infer<typeof schema>;

function CustomersContent() {
  const customers = useCustomers();
  const snapshot = useSnapshot();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const online = typeof navigator === 'undefined' ? true : navigator.onLine;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting }
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', phone: '', email: '', creditLimit: 0, notes: '' }
  });

  const owedByCustomer = useMemo(() => {
    const map = new Map<string, number>();
    if (!snapshot) return map;
    const completed = new Map(
      snapshot.sales
        .filter((sale) => sale.status === 'completed')
        .map((sale) => [sale.id, sale])
    );
    for (const payment of snapshot.payments) {
      if (payment.tender !== 'credit' || payment.isReversed) continue;
      const sale = completed.get(payment.saleId);
      if (!sale?.customerId) continue;
      map.set(sale.customerId, (map.get(sale.customerId) ?? 0) + Number(payment.amount));
    }
    return map;
  }, [snapshot]);

  const filtered = (customers ?? []).filter((customer) =>
    `${customer.name} ${customer.phone ?? ''}`.toLowerCase().includes(search.toLowerCase())
  );

  const totalOwed = [...owedByCustomer.values()].reduce((sum, value) => sum + value, 0);

  const onSubmit = async (values: FormValues) => {
    if (!navigator.onLine) {
      toast.error('Adding customers needs internet');
      return;
    }
    try {
      const res = await apiRequest<{ customer: Customer }>('/customers', {
        method: 'POST',
        body: {
          name: values.name,
          phone: values.phone || null,
          email: values.email || null,
          creditLimit: values.creditLimit,
          notes: values.notes || null
        }
      });
      await db.customers.put(res.customer);
      toast.success('Customer added', res.customer.name);
      reset({ name: '', phone: '', email: '', creditLimit: 0, notes: '' });
      setOpen(false);
    } catch (err) {
      toast.error('Could not add customer', err instanceof Error ? err.message : undefined);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Madeni"
        title={t.customers.title}
        subtitle={t.customers.subtitle}
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus size={15} /> {t.customers.add}
          </Button>
        }
      />

      {!online && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-[#f2dfb5] bg-[#fdf3dd] px-3 py-2.5 text-xs text-[#8b681f]">
          <WifiOff size={15} /> New customers need internet. Existing credit records still work offline.
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <span className="inline-flex rounded-xl bg-brand-50 p-2.5 text-brand-600">
              <UserRound size={17} />
            </span>
            <p className="mt-3 text-[10px] font-medium uppercase tracking-wide text-muted">
              Customers
            </p>
            <p className="numeric mt-0.5 font-display text-xl font-semibold text-ink">
              {customers?.length ?? 0}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <span className="inline-flex rounded-xl bg-[#fbecef] p-2.5 text-berry">
              <Wallet size={17} />
            </span>
            <p className="mt-3 text-[10px] font-medium uppercase tracking-wide text-muted">
              Total madeni
            </p>
            <p className="numeric mt-0.5 font-display text-xl font-semibold text-ink">
              {formatTZS(totalOwed)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <span className="inline-flex rounded-xl bg-[#fdf3dd] p-2.5 text-[#9a7020]">
              <Wallet size={17} />
            </span>
            <p className="mt-3 text-[10px] font-medium uppercase tracking-wide text-muted">
              With balance
            </p>
            <p className="numeric mt-0.5 font-display text-xl font-semibold text-ink">
              {[...owedByCustomer.values()].filter((value) => value > 0).length}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="surface mt-4 overflow-hidden">
        <div className="border-b border-line p-3.5">
          <div className="relative max-w-md">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search customers…"
              className="pl-10"
            />
          </div>
        </div>
        {!customers ? (
          <div className="h-40 animate-pulse bg-cream/50" />
        ) : filtered.length === 0 ? (
          <EmptyState
            title={search ? 'No customers match' : t.customers.empty}
            description={search ? 'Try another name or phone.' : 'Add regulars to sell on credit and track madeni.'}
            icon={<UserRound size={22} />}
            action={!search ? <Button onClick={() => setOpen(true)}>Add customer</Button> : undefined}
          />
        ) : (
          <div className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((customer) => {
              const owed = owedByCustomer.get(customer.id) ?? 0;
              const overLimit = customer.creditLimit > 0 && owed > customer.creditLimit;
              return (
                <div key={customer.id} className="rounded-2xl border border-line bg-white p-3.5">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-sm font-bold text-brand-700">
                      {customer.name.slice(0, 1).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">{customer.name}</p>
                      <p className="flex items-center gap-1 text-[10px] text-muted">
                        <Phone size={10} /> {customer.phone ?? 'No phone'}
                      </p>
                    </div>
                    {owed > 0 && (
                      <Badge variant={overLimit ? 'danger' : 'warning'}>
                        {formatTZS(owed)}
                      </Badge>
                    )}
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-line/70 pt-2 text-[10px] text-muted">
                    <span>
                      Limit{' '}
                      <span className="font-semibold text-ink">
                        {customer.creditLimit ? formatTZS(customer.creditLimit) : 'None'}
                      </span>
                    </span>
                    <span>{customer.notes ?? ''}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <p className="mt-3 px-1 text-[10px] leading-relaxed text-muted">
        Credit taken at the till is recorded against the selected customer. Loan repayment
        tracking arrives in a later release; the owed amount is the total credit sales.
      </p>

      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={t.customers.add}
        description="Add a regular customer or someone buying on credit."
        size="md"
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div>
            <Label htmlFor="customer-name">{t.customers.name}</Label>
            <Input id="customer-name" autoFocus {...register('name')} />
            {errors.name && <p className="mt-1 text-xs text-berry">{errors.name.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="customer-phone">{t.customers.phone}</Label>
              <Input id="customer-phone" placeholder="0712 345 678" {...register('phone')} />
              {errors.phone && <p className="mt-1 text-xs text-berry">{errors.phone.message}</p>}
            </div>
            <div>
              <Label htmlFor="customer-limit">{t.customers.creditLimit}</Label>
              <Input id="customer-limit" type="number" min={0} step={1} {...register('creditLimit')} />
            </div>
          </div>
          <div>
            <Label htmlFor="customer-email">Email (optional)</Label>
            <Input id="customer-email" type="email" {...register('email')} />
            {errors.email && <p className="mt-1 text-xs text-berry">{errors.email.message}</p>}
          </div>
          <div>
            <Label htmlFor="customer-notes">Notes (optional)</Label>
            <Input id="customer-notes" placeholder="e.g. Shop next door" {...register('notes')} />
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus size={15} />}
              Add customer
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}

export default function CustomersPage() {
  return (
    <PermissionGate ownerOnly>
      <CustomersContent />
    </PermissionGate>
  );
}
