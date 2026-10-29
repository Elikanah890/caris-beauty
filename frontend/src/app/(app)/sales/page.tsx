'use client';

import { useMemo, useState } from 'react';
import { CalendarDays, ReceiptText, Search } from 'lucide-react';
import { EmptyState, PageHeader } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog } from '@/components/ui/dialog';
import { PermissionGate } from '@/components/permission-gate';
import { toast } from '@/components/ui/toast';
import { useSales } from '@/lib/hooks';
import { useAuthStore } from '@/store/auth-store';
import { can } from '@/lib/permissions';
import { voidSaleLocal } from '@/lib/repo';
import { requestSync } from '@/lib/sync';
import { inRange, periodRange } from '@/lib/reports';
import { formatDateTime, formatQty, formatTZS } from '@/lib/format';
import { t } from '@/lib/strings';
import type { Period, Tender } from '@/lib/types';

const PERIODS: Array<{ id: Period; label: string }> = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This week' },
  { id: 'month', label: 'This month' }
];

const TENDER_LABELS: Record<Tender, string> = {
  cash: 'Cash',
  mpesa: 'M-Pesa',
  tigopesa: 'Tigo Pesa',
  airtel: 'Airtel Money',
  bank: 'Bank',
  credit: 'Credit'
};

function dayKey(value = new Date()): string {
  return new Date(value.getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function SalesContent() {
  const sales = useSales(1000);
  const user = useAuthStore((state) => state.user);
  const [period, setPeriod] = useState<Period>('today');
  const [customFrom, setCustomFrom] = useState(dayKey());
  const [customTo, setCustomTo] = useState(dayKey());
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [voiding, setVoiding] = useState(false);

  const range = useMemo(() => {
    if (period === 'custom') {
      return {
        from: new Date(`${customFrom}T00:00:00+03:00`),
        to: new Date(`${customTo}T23:59:59.999+03:00`)
      };
    }
    return periodRange(period);
  }, [period, customFrom, customTo]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (sales ?? []).filter((sale) => {
      if (!inRange(sale.soldAt, range)) return false;
      if (!term) return true;
      return `${sale.receiptNo} ${sale.customerName ?? ''}`.toLowerCase().includes(term);
    });
  }, [sales, range, search]);

  const selected = sales?.find((sale) => sale.id === selectedId) ?? null;
  const canVoid = can(user, 'sales.void');

  const handleVoid = async () => {
    if (!selected || !user) return;
    setVoiding(true);
    try {
      await voidSaleLocal(selected.id, user);
      requestSync(0);
      toast.success('Sale voided — stock restored');
      setConfirmOpen(false);
    } catch (err) {
      toast.error('Could not void sale', err instanceof Error ? err.message : undefined);
    } finally {
      setVoiding(false);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Sales"
        title={t.nav.sales}
        subtitle="Every receipt, with a clear path to reverse a mistake."
      />

      <div className="surface overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-line p-3.5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {PERIODS.map((entry) => (
              <Button
                key={entry.id}
                type="button"
                size="sm"
                variant={period === entry.id ? 'primary' : 'outline'}
                onClick={() => setPeriod(entry.id)}
              >
                {entry.label}
              </Button>
            ))}
            <Button
              type="button"
              size="sm"
              variant={period === 'custom' ? 'primary' : 'outline'}
              onClick={() => setPeriod('custom')}
            >
              <CalendarDays size={14} /> Custom
            </Button>
          </div>
          <div className="relative w-full max-w-sm">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search receipt or customer…"
              className="pl-10"
            />
          </div>
        </div>

        {period === 'custom' && (
          <div className="grid gap-3 border-b border-line p-3.5 sm:grid-cols-2">
            <div>
              <Label htmlFor="sales-from">From</Label>
              <Input
                id="sales-from"
                type="date"
                value={customFrom}
                onChange={(event) => setCustomFrom(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="sales-to">To</Label>
              <Input
                id="sales-to"
                type="date"
                value={customTo}
                onChange={(event) => setCustomTo(event.target.value)}
              />
            </div>
          </div>
        )}

        {!sales ? (
          <div className="space-y-2 p-4">
            {[0, 1, 2, 3].map((index) => (
              <div key={index} className="h-12 animate-pulse rounded-xl bg-cream" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            title={search ? 'No matching sales' : 'No sales in this period'}
            description={
              search
                ? 'Try a different receipt number or customer name.'
                : 'Completed sales will appear here as you use the till.'
            }
            icon={<ReceiptText size={22} />}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-sm">
              <thead>
                <tr className="border-b border-line bg-cream/50 text-left text-[10px] uppercase tracking-wide text-muted">
                  <th className="px-4 py-3 font-semibold">Receipt</th>
                  <th className="px-4 py-3 font-semibold">Date</th>
                  <th className="px-4 py-3 font-semibold">Cashier</th>
                  <th className="px-4 py-3 text-right font-semibold">Total</th>
                  <th className="px-4 py-3 text-right font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((sale) => (
                  <tr
                    key={sale.id}
                    onClick={() => setSelectedId(sale.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setSelectedId(sale.id);
                      }
                    }}
                    tabIndex={0}
                    className="cursor-pointer border-b border-line/70 transition last:border-0 hover:bg-cream/40 focus:bg-cream/40 focus:outline-none"
                  >
                    <td className="px-4 py-3 font-semibold text-ink">{sale.receiptNo}</td>
                    <td className="px-4 py-3 text-muted">{formatDateTime(sale.soldAt)}</td>
                    <td className="px-4 py-3 text-muted">{sale.userName ?? '—'}</td>
                    <td className="numeric px-4 py-3 text-right font-semibold text-ink">
                      {formatTZS(sale.total)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {sale.status === 'voided' ? (
                        <Badge variant="danger">Voided</Badge>
                      ) : (
                        <Badge variant="success">Completed</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog
        open={Boolean(selected)}
        onOpenChange={(open) => !open && setSelectedId(null)}
        title={selected ? `Sale ${selected.receiptNo}` : 'Sale'}
        description={selected ? formatDateTime(selected.soldAt) : undefined}
        size="lg"
      >
        {selected && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-cream/60 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Cashier</p>
                <p className="mt-0.5 text-sm font-semibold text-ink">{selected.userName ?? '—'}</p>
              </div>
              <div className="rounded-xl bg-cream/60 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Customer</p>
                <p className="mt-0.5 text-sm font-semibold text-ink">
                  {selected.customerName ?? 'Walk-in'}
                </p>
              </div>
            </div>

            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted">Items</p>
              <div className="divide-y divide-line/70 rounded-xl border border-line">
                {selected.items.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-ink">{item.productName}</p>
                      <p className="text-[11px] text-muted">
                        {formatQty(item.qty)} {item.unitSymbol} @ {formatTZS(item.pricePerUnit)}
                      </p>
                    </div>
                    <p className="numeric shrink-0 font-semibold text-ink">{formatTZS(item.lineTotal)}</p>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted">Payments</p>
              <div className="divide-y divide-line/70 rounded-xl border border-line">
                {selected.payments.map((payment) => (
                  <div key={payment.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                    <span className="text-muted">
                      {TENDER_LABELS[payment.tender] ?? payment.tender}
                      {payment.isReversed && (
                        <span className="ml-2 text-[10px] font-semibold uppercase text-berry">Reversed</span>
                      )}
                    </span>
                    <span className="numeric font-semibold text-ink">{formatTZS(payment.amount)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between rounded-xl bg-ink px-4 py-3 text-white">
              <span className="text-xs font-semibold uppercase tracking-wide">Total</span>
              <span className="numeric font-display text-xl font-semibold">{formatTZS(selected.total)}</span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {selected.status === 'voided' ? (
                <>
                  <Badge variant="danger">VOIDED</Badge>
                  <span className="text-xs text-muted">
                    Voided {formatDateTime(selected.updatedAt)}
                  </span>
                </>
              ) : (
                <Badge variant="success">Completed</Badge>
              )}
            </div>

            {canVoid && selected.status === 'completed' && (
              <div className="pt-1">
                <Button variant="danger" className="w-full" onClick={() => setConfirmOpen(true)}>
                  Void this sale
                </Button>
              </div>
            )}
          </div>
        )}
      </Dialog>

      <Dialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={selected ? `Void sale ${selected.receiptNo}?` : 'Void sale?'}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={voiding}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => void handleVoid()} disabled={voiding}>
              {voiding ? 'Voiding…' : 'Yes, void it'}
            </Button>
          </>
        }
      >
        <div className="space-y-2 text-sm text-muted">
          <p>This will:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Restore stock for all items</li>
            <li>Mark the sale as reversed</li>
          </ul>
          <p className="font-semibold text-berry">This cannot be undone.</p>
        </div>
      </Dialog>
    </div>
  );
}

export default function SalesPage() {
  return (
    <PermissionGate anyOf={['reports.view', 'sales.void']}>
      <SalesContent />
    </PermissionGate>
  );
}
