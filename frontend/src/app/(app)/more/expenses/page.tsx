'use client';

import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Loader2,
  Plus,
  Receipt,
  Trash2,
  Wallet,
  WifiOff
} from 'lucide-react';
import { PageHeader, EmptyState } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { Input, Label, Select } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { PermissionGate } from '@/components/permission-gate';
import { toast } from '@/components/ui/toast';
import { useExpenses } from '@/lib/hooks';
import { useAuthStore } from '@/store/auth-store';
import { deleteExpense, recordExpense, LocalRuleError } from '@/lib/repo';
import { eatDateKey, formatDate, formatTZS } from '@/lib/format';
import { t } from '@/lib/strings';
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_VALUES,
  expenseCategoryLabel
} from '@/lib/expense-categories';
import type { Expense, Tender } from '@/lib/types';

const TENDERS: Array<{ id: Tender; label: string }> = [
  { id: 'cash', label: 'Cash' },
  { id: 'mpesa', label: 'M-Pesa' },
  { id: 'tigopesa', label: 'Tigo Pesa' },
  { id: 'airtel', label: 'Airtel Money' },
  { id: 'bank', label: 'Bank' }
];

const schema = z.object({
  category: z.enum(EXPENSE_CATEGORY_VALUES),
  description: z.string().min(2, 'Describe the expense'),
  amount: z.coerce.number().int().positive('Enter an amount'),
  paidVia: z.enum(['cash', 'mpesa', 'tigopesa', 'airtel', 'bank', 'credit']),
  spentAt: z.string().min(1)
});

type FormValues = z.infer<typeof schema>;

function ExpensesContent() {
  const user = useAuthStore((state) => state.user);
  const expenses = useExpenses();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null);
  const online = typeof navigator === 'undefined' ? true : navigator.onLine;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting }
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      category: 'supplies',
      description: '',
      amount: 0,
      paidVia: 'cash',
      spentAt: eatDateKey()
    }
  });

  const active = (expenses ?? []).filter((expense) => !expense.deletedAt);
  const monthKey = eatDateKey().slice(0, 7);
  const monthExpenses = active.filter((expense) =>
    eatDateKey(expense.spentAt).startsWith(monthKey)
  );
  const monthTotal = monthExpenses.reduce(
    (sum, expense) => sum + Number(expense.amount),
    0
  );
  const monthEntries = monthExpenses.length;
  const categoryTotals = useMemo(() => {
    const totals = new Map<string, number>();
    for (const expense of monthExpenses) {
      totals.set(
        expense.category,
        (totals.get(expense.category) ?? 0) + Number(expense.amount)
      );
    }
    return [...totals.entries()].sort((a, b) => b[1] - a[1]);
  }, [monthExpenses]);
  const topCategory = categoryTotals[0]
    ? expenseCategoryLabel(categoryTotals[0][0])
    : '—';

  const grouped = useMemo(() => {
    const groups = new Map<string, typeof active>();
    for (const expense of active) {
      const key = eatDateKey(expense.spentAt);
      const list = groups.get(key) ?? [];
      list.push(expense);
      groups.set(key, list);
    }
    return [...groups.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [active]);

  const onSubmit = async (values: FormValues) => {
    if (!user) return;
    try {
      await recordExpense({
        category: values.category,
        description: values.description,
        amount: values.amount,
        paidVia: values.paidVia,
        spentAt: new Date(`${values.spentAt}T12:00:00+03:00`).toISOString(),
        user
      });
      toast.success(t.expenses.saved);
      reset({
        category: 'supplies',
        description: '',
        amount: 0,
        paidVia: 'cash',
        spentAt: eatDateKey()
      });
      setOpen(false);
    } catch (err) {
      toast.error('Could not record expense', err instanceof LocalRuleError ? err.message : undefined);
    }
  };

  const remove = async (id: string) => {
    if (!user) return;
    setDeleting(id);
    try {
      await deleteExpense(id, user);
      toast.success(t.expenses.deleted);
      setDeleteTarget(null);
    } catch (err) {
      toast.error('Could not delete expense', err instanceof Error ? err.message : undefined);
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Money out"
        title={t.expenses.title}
        subtitle={t.expenses.subtitle}
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus size={15} /> {t.expenses.add}
          </Button>
        }
      />

      {!online && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-[#f2dfb5] bg-[#fdf3dd] px-3 py-2.5 text-xs text-[#8b681f]">
          <WifiOff size={15} /> Offline expenses are queued and sync automatically.
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="animate-fade-up">
          <CardContent className="p-4">
            <span className="inline-flex rounded-xl bg-brand-50 p-2.5 text-brand-600">
              <Wallet size={17} />
            </span>
            <p className="mt-3 text-[10px] font-medium uppercase tracking-wide text-muted">
              This month
            </p>
            <p className="numeric mt-0.5 font-display text-xl font-semibold text-ink">
              {formatTZS(monthTotal)}
            </p>
          </CardContent>
        </Card>
        <Card className="animate-fade-up delay-1">
          <CardContent className="p-4">
            <span className="inline-flex rounded-xl bg-[#eef4ec] p-2.5 text-moss">
              <Receipt size={17} />
            </span>
            <p className="mt-3 text-[10px] font-medium uppercase tracking-wide text-muted">
              Entries
            </p>
            <p className="numeric mt-0.5 font-display text-xl font-semibold text-ink">
              {monthEntries}
            </p>
          </CardContent>
        </Card>
        <Card className="animate-fade-up delay-2">
          <CardContent className="p-4">
            <span className="inline-flex rounded-xl bg-[#fdf3dd] p-2.5 text-[#9a7020]">
              <Receipt size={17} />
            </span>
            <p className="mt-3 text-[10px] font-medium uppercase tracking-wide text-muted">
              Top category
            </p>
            <p className="mt-0.5 truncate text-sm font-semibold text-ink">{topCategory}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-ink">Breakdown by category</p>
            <span className="text-[10px] font-medium text-muted">
              {monthEntries} entr{monthEntries === 1 ? 'y' : 'ies'} this month
            </span>
          </div>
          {categoryTotals.length === 0 ? (
            <p className="mt-3 text-xs text-muted">No expenses recorded this month.</p>
          ) : (
            <div className="mt-3 space-y-3">
              {categoryTotals.map(([category, amount]) => {
                const percent = monthTotal
                  ? Math.round((amount / monthTotal) * 100)
                  : 0;
                return (
                  <div key={category}>
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="truncate font-medium text-ink">
                        {expenseCategoryLabel(category)}
                      </span>
                      <span className="shrink-0 text-muted">
                        <span className="numeric font-semibold text-ink">
                          {formatTZS(amount)}
                        </span>{' '}
                        · {percent}%
                      </span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-cream">
                      <div
                        className="h-full rounded-full bg-brand-500"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="mt-4 space-y-4">
        {!expenses ? (
          <div className="h-40 animate-pulse rounded-2xl bg-white/60" />
        ) : active.length === 0 ? (
          <div className="surface">
            <EmptyState
              title={t.expenses.empty}
              description="Record rent, transport or supplies — it feeds your profit reports."
              icon={<Wallet size={22} />}
              action={<Button onClick={() => setOpen(true)}>Record expense</Button>}
            />
          </div>
        ) : (
          grouped.map(([date, rows]) => (
            <div key={date}>
              <div className="mb-2 flex items-center justify-between px-1">
                <p className="text-[11px] font-semibold text-muted">{formatDate(`${date}T12:00:00+03:00`)}</p>
                <p className="numeric text-[11px] font-semibold text-ink">
                  {formatTZS(rows.reduce((sum, row) => sum + Number(row.amount), 0))}
                </p>
              </div>
              <div className="surface divide-y divide-line/70 overflow-hidden">
                {rows.map((expense) => (
                  <div key={expense.id} className="flex items-center gap-3 p-3.5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-cream text-muted">
                      <Wallet size={15} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-xs font-semibold text-ink">{expense.description}</p>
                        <Badge variant="default">
                          {expenseCategoryLabel(expense.category)}
                        </Badge>
                        <Badge variant="brand" className="capitalize">
                          {expense.paidVia}
                        </Badge>
                      </div>
                      <p className="text-[10px] text-muted">
                        {expense.userName ?? 'You'} · {formatDate(expense.spentAt, { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    <p className="numeric text-sm font-bold text-ink">{formatTZS(expense.amount)}</p>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={deleting === expense.id}
                      onClick={() => setDeleteTarget(expense)}
                      className="text-muted hover:text-berry"
                      aria-label="Delete expense"
                    >
                      {deleting === expense.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 size={14} />}
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={t.expenses.add}
        description="Every expense is logged and included in net profit."
        size="md"
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="expense-category">{t.expenses.category}</Label>
              <Select id="expense-category" {...register('category')}>
                {EXPENSE_CATEGORIES.map((category) => (
                  <option key={category.value} value={category.value}>
                    {category.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="expense-date">{t.expenses.date}</Label>
              <Input id="expense-date" type="date" {...register('spentAt')} />
            </div>
          </div>
          <div>
            <Label htmlFor="expense-description">{t.expenses.description}</Label>
            <Input id="expense-description" placeholder="e.g. Boda to supplier" {...register('description')} />
            {errors.description && (
              <p className="mt-1 text-xs text-berry">{errors.description.message}</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="expense-amount">{t.expenses.amount}</Label>
              <Input id="expense-amount" type="number" min={1} step={1} {...register('amount')} />
              {errors.amount && <p className="mt-1 text-xs text-berry">{errors.amount.message}</p>}
            </div>
            <div>
              <Label htmlFor="expense-paid">{t.expenses.paidVia}</Label>
              <Select id="expense-paid" {...register('paidVia')}>
                {TENDERS.map((tender) => (
                  <option key={tender.id} value={tender.id}>
                    {tender.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus size={15} />}
              {t.expenses.add}
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null);
        }}
        title="Delete expense?"
        description={
          deleteTarget
            ? `${deleteTarget.description} · ${formatTZS(deleteTarget.amount)}`
            : undefined
        }
        size="sm"
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={Boolean(deleting)}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => deleteTarget && void remove(deleteTarget.id)}
              disabled={Boolean(deleting)}
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 size={14} />}
              Delete expense
            </Button>
          </>
        }
      >
        <div className="rounded-xl border border-[#f0cdd5] bg-[#fbecef] px-3 py-2 text-xs leading-relaxed text-berry">
          This removes the expense and updates net profit. This cannot be undone.
        </div>
      </Dialog>
    </div>
  );
}

export default function ExpensesPage() {
  return (
    <PermissionGate flag="expenses.record">
      <ExpensesContent />
    </PermissionGate>
  );
}
