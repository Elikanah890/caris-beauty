'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  Download,
  FileDown,
  ReceiptText,
  Sparkles,
  Wallet
} from 'lucide-react';
import { PageHeader, EmptyState } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PermissionGate } from '@/components/permission-gate';
import { RevenueTrend } from '@/components/dashboard/charts';
import { useSnapshot } from '@/lib/hooks';
import { useAuthStore } from '@/store/auth-store';
import {
  categoryBreakdown,
  closeDay,
  includedSaleIds,
  periodRange,
  profitLoss,
  shrinkage,
  slowMovers,
  staffPerformance,
  summary,
  topProducts,
  trendSeries
} from '@/lib/reports';
import { computeInsights } from '@/lib/insights';
import { expenseCategoryLabel } from '@/lib/expense-categories';
import { downloadEfdCsv } from '@/lib/export';
import {
  eatDateKey,
  formatDate,
  formatDateTime,
  formatQty,
  formatTZS
} from '@/lib/format';
import { t } from '@/lib/strings';
import { cn } from '@/lib/utils';
import type { Period } from '@/lib/types';
import type { Insight } from '@/lib/types';

const PERIODS: Array<{ id: Period; label: string }> = [
  { id: 'today', label: t.reports.today },
  { id: 'week', label: t.reports.week },
  { id: 'month', label: t.reports.month },
  { id: 'year', label: t.reports.year },
  { id: 'custom', label: 'Custom' }
];

function Stat({
  label,
  value,
  hint,
  tone,
  icon: Icon
}: {
  label: string;
  value: string;
  hint?: string;
  tone: string;
  icon: typeof Wallet;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className={cn('rounded-xl p-2', tone)}>
            <Icon size={16} />
          </span>
          {hint && <span className="text-[10px] font-medium text-muted">{hint}</span>}
        </div>
        <p className="mt-3 text-[10px] font-medium uppercase tracking-wide text-muted">{label}</p>
        <p className="numeric mt-0.5 font-display text-lg font-semibold text-ink">{value}</p>
      </CardContent>
    </Card>
  );
}

function signedTZS(value: number): string {
  return value < 0 ? `−${formatTZS(Math.abs(value))}` : formatTZS(value);
}

function PnLRow({
  label,
  value,
  strong = false,
  className
}: {
  label: string;
  value: string;
  strong?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 py-0.5',
        strong && 'font-semibold',
        className
      )}
    >
      <span className="min-w-0 truncate">{label}</span>
      <span className="numeric shrink-0">{value}</span>
    </div>
  );
}

function InsightPill({ insight }: { insight: Insight }) {
  return (
    <div
      className={cn(
        'flex items-start gap-2 rounded-xl border px-3 py-2 text-[11px] leading-relaxed',
        insight.severity === 'danger' && 'border-[#f0cdd5] bg-[#fbecef] text-berry',
        insight.severity === 'warn' && 'border-[#f2dfb5] bg-[#fdf3dd] text-[#8b681f]',
        insight.severity === 'info' && 'border-line bg-cream text-muted'
      )}
    >
      <Sparkles size={13} className="mt-0.5 shrink-0" />
      {insight.message}
    </div>
  );
}

function ReportsContent() {
  const snapshot = useSnapshot();
  const business = useAuthStore((state) => state.business);
  const [period, setPeriod] = useState<Period>('today');
  const [customFrom, setCustomFrom] = useState(eatDateKey());
  const [customTo, setCustomTo] = useState(eatDateKey());
  const [topBy, setTopBy] = useState<'qty' | 'revenue'>('revenue');
  const [closeDate, setCloseDate] = useState(eatDateKey());
  const [cashCounted, setCashCounted] = useState('');
  const [showAllInsights, setShowAllInsights] = useState(false);

  const data = useMemo(() => {
    if (!snapshot) return null;
    const range =
      period === 'custom'
        ? {
            from: new Date(`${customFrom}T00:00:00+03:00`),
            to: new Date(`${customTo}T23:59:59.999+03:00`)
          }
        : periodRange(period);
    const totals = summary(snapshot, range);
    const pnl = profitLoss(snapshot, range);
    const top = topProducts(snapshot, range, 8, topBy);
    const slow = slowMovers(snapshot, range, 0).slice(0, 8);
    const staff = staffPerformance(snapshot, range);
    const shrink = shrinkage(snapshot, range);
    const categories = categoryBreakdown(snapshot, range);
    const trend = trendSeries(snapshot, period === 'custom' ? 'month' : period);
    const day = closeDay(snapshot, closeDate);
    const insights = computeInsights(snapshot);
    const ids = includedSaleIds(snapshot.sales, snapshot.payments, range);
    return { range, totals, pnl, top, slow, staff, shrink, categories, trend, day, insights, ids };
  }, [snapshot, period, customFrom, customTo, topBy, closeDate]);

  if (!data) {
    return (
      <div className="space-y-4">
        <div className="h-16 animate-pulse rounded-2xl bg-white/60" />
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <div key={index} className="h-28 animate-pulse rounded-2xl bg-white/60" />
          ))}
        </div>
        <div className="h-72 animate-pulse rounded-2xl bg-white/60" />
      </div>
    );
  }

  const { totals, pnl, top, slow, staff, shrink, categories, trend, day, insights } = data;
  const periodLabel =
    period === 'custom'
      ? `${formatDate(new Date(`${customFrom}T00:00:00+03:00`), { day: 'numeric', month: 'short' })} – ${formatDate(new Date(`${customTo}T00:00:00+03:00`), { day: 'numeric', month: 'short' })}`
      : period === 'today'
        ? 'Today'
        : period === 'week'
          ? 'This week'
          : period === 'month'
            ? 'This month'
            : 'This year';
  const cashDifference = cashCounted
    ? Math.round(Number(cashCounted)) - (totals.tenderBreakdown.cash ?? 0)
    : 0;

  return (
    <div>
      <PageHeader
        eyebrow="Numbers"
        title={t.reports.title}
        subtitle={t.reports.subtitle}
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => downloadEfdCsv(snapshot!, data.range, business)}
            >
              <FileDown size={15} />
              {t.reports.exportEfd}
            </Button>
            <Button
              variant="soft"
              onClick={() => {
                const rows = [
                  ['Metric', 'Value'],
                  ['Revenue', String(totals.sales)],
                  ['COGS', String(totals.cogs)],
                  ['Gross profit', String(totals.grossProfit)],
                  ['Expenses', String(totals.expenses)],
                  ['Net profit', String(totals.netProfit)],
                  ['Sales count', String(totals.saleCount)]
                ];
                const blob = new Blob([rows.map((row) => row.join(',')).join('\n')], {
                  type: 'text/csv'
                });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = `caris-summary-${eatDateKey()}.csv`;
                link.click();
                URL.revokeObjectURL(url);
              }}
            >
              <Download size={15} />
              {t.reports.export}
            </Button>
          </>
        }
      />

      <div className="surface flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-1 rounded-xl bg-cream p-1">
          {PERIODS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setPeriod(item.id)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-[11px] font-semibold transition',
                period === item.id ? 'bg-white text-ink shadow-sm' : 'text-muted hover:text-ink'
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
        {period === 'custom' ? (
          <div className="flex items-end gap-2">
            <div>
              <Label className="mb-1 text-[9px]">From</Label>
              <Input
                type="date"
                value={customFrom}
                onChange={(event) => setCustomFrom(event.target.value)}
                className="h-9 w-36 text-xs"
              />
            </div>
            <div>
              <Label className="mb-1 text-[9px]">To</Label>
              <Input
                type="date"
                value={customTo}
                onChange={(event) => setCustomTo(event.target.value)}
                className="h-9 w-36 text-xs"
              />
            </div>
          </div>
        ) : (
          <Badge variant="brand">{periodLabel}</Badge>
        )}
      </div>

      <Card className="mt-4">
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>Profit &amp; Loss</CardTitle>
            <Badge variant={pnl.netProfit >= 0 ? 'success' : 'danger'}>
              {pnl.netProfit >= 0 ? 'Profit' : 'Loss'}
            </Badge>
          </div>
          <Badge variant="brand">{periodLabel}</Badge>
        </CardHeader>
        <CardContent className="text-xs">
          <div className="grid gap-x-8 lg:grid-cols-2">
            <div>
              <PnLRow label="Sales Revenue" value={formatTZS(pnl.revenue)} />
              <PnLRow
                label="Cost of Goods Sold"
                value={`−${formatTZS(pnl.cogs)}`}
                className="text-muted"
              />
              <div className="my-2 border-t border-dashed border-line" />
              <PnLRow label="Gross Profit" value={formatTZS(pnl.grossProfit)} strong />
            </div>

            <div className="mt-4 lg:mt-0">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                Operating Expenses
              </p>
              <div className="mt-1">
                {Object.entries(pnl.expensesByCategory)
                  .filter(([, amount]) => amount > 0)
                  .sort((a, b) => b[1] - a[1])
                  .map(([category, amount]) => (
                    <PnLRow
                      key={category}
                      label={expenseCategoryLabel(category)}
                      value={`−${formatTZS(amount)}`}
                      className="text-muted"
                    />
                  ))}
                {Object.values(pnl.expensesByCategory).every((amount) => amount <= 0) && (
                  <p className="py-1 text-[11px] text-muted">No expenses in this period.</p>
                )}
              </div>
              <div className="my-2 border-t border-dashed border-line" />
              <PnLRow
                label="Total Expenses"
                value={`−${formatTZS(pnl.expensesTotal)}`}
                strong
              />
            </div>
          </div>

          <div className="my-3 border-t border-line" />
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                Net Profit
              </p>
              <p
                className={cn(
                  'numeric font-display text-2xl font-bold',
                  pnl.netProfit >= 0 ? 'text-moss' : 'text-berry'
                )}
              >
                {signedTZS(pnl.netProfit)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                Profit Margin
              </p>
              <p
                className={cn(
                  'numeric text-lg font-semibold',
                  pnl.profitMargin >= 0 ? 'text-moss' : 'text-berry'
                )}
              >
                {pnl.profitMargin}%
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <Stat label={t.reports.revenue} value={formatTZS(totals.sales)} tone="bg-brand-50 text-brand-600" icon={Wallet} hint={`${totals.saleCount} sales`} />
        <Stat label={t.reports.cogs} value={formatTZS(totals.cogs)} tone="bg-[#fdf3dd] text-[#9a7020]" icon={ReceiptText} />
        <Stat label={t.reports.gross} value={formatTZS(totals.grossProfit)} tone="bg-[#eef4ec] text-moss" icon={ArrowUpRight} />
        <Stat label={t.reports.expenses} value={formatTZS(totals.expenses)} tone="bg-[#fbecef] text-berry" icon={ArrowDownRight} />
        <Stat label={t.reports.net} value={formatTZS(totals.netProfit)} tone="bg-[#edf3f7] text-sky" icon={Wallet} />
        <Stat label={t.reports.average} value={formatTZS(totals.averageSale)} tone="bg-cream text-muted" icon={CalendarDays} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>{t.dashboard.revenueTrend}</CardTitle>
              <p className="mt-0.5 text-[11px] text-muted">{periodLabel}</p>
            </div>
            <Badge variant="success">
              <span className="h-1.5 w-1.5 rounded-full bg-moss" /> Offline data
            </Badge>
          </CardHeader>
          <CardContent>
            <RevenueTrend data={trend} period={period} />
            <div className="mt-3 grid grid-cols-2 gap-2">
              {[
                { label: 'Subtotal', value: formatTZS(totals.subtotal) },
                { label: 'Discounts', value: formatTZS(totals.discount) },
                { label: 'Gross profit', value: formatTZS(totals.grossProfit) },
                { label: 'Net profit', value: formatTZS(totals.netProfit) }
              ].map((item) => (
                <div key={item.label} className="flex justify-between rounded-xl bg-cream/70 px-3 py-2 text-[11px]">
                  <span className="text-muted">{item.label}</span>
                  <span className="numeric font-semibold text-ink">{item.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t.reports.top}</CardTitle>
            <div className="flex rounded-lg bg-cream p-0.5">
              {(['revenue', 'qty'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setTopBy(mode)}
                  className={cn(
                    'rounded-md px-2 py-1 text-[10px] font-semibold capitalize',
                    topBy === mode ? 'bg-white text-ink shadow-sm' : 'text-muted'
                  )}
                >
                  {mode === 'revenue' ? 'Revenue' : 'Qty'}
                </button>
              ))}
            </div>
          </CardHeader>
          <CardContent>
            {top.length === 0 ? (
              <EmptyState title={t.reports.noData} description="Make a sale to see your best products." />
            ) : (
              <div className="space-y-1">
                {top.map((product, index) => (
                  <div key={product.productId} className="flex items-center gap-2.5 rounded-xl px-1 py-2 transition hover:bg-cream/60">
                    <span
                      className="flex h-6 w-6 items-center justify-center rounded-lg text-[10px] font-bold text-white"
                      style={{ background: ['#f97316', '#7d9b70', '#5c86a8', '#d9a441', '#b4556b'][index % 5] }}
                    >
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11px] font-semibold text-ink">{product.productName}</p>
                      <p className="text-[9px] text-muted">{formatQty(product.qtyBase)} base units</p>
                    </div>
                    <p className="numeric text-[11px] font-bold text-ink">{formatTZS(product.revenue)}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>{t.reports.slow}</CardTitle>
            <Badge variant="warning">{slow.length}</Badge>
          </CardHeader>
          <CardContent>
            {slow.length === 0 ? (
              <EmptyState title="No slow movers" description="Every product sold in this period." />
            ) : (
              <div className="space-y-1">
                {slow.map((product) => (
                  <Link
                    key={product.productId}
                    href={`/stock/${product.productId}`}
                    className="flex items-center justify-between gap-2 rounded-xl px-1 py-2 transition hover:bg-cream/60"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[11px] font-semibold text-ink">{product.name}</p>
                      <p className="text-[9px] text-muted">
                        {product.lastSoldAt ? `Last sold ${formatDate(product.lastSoldAt)}` : 'Never sold'}
                      </p>
                    </div>
                    <span className="numeric text-[10px] font-semibold text-muted">
                      {formatQty(product.stockBase)} left
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t.reports.shrinkage}</CardTitle>
            <Badge variant={shrink.length ? 'danger' : 'success'}>{shrink.length ? 'Review' : 'Clean'}</Badge>
          </CardHeader>
          <CardContent>
            {shrink.length === 0 ? (
              <EmptyState title="No shrinkage" description="No adjustments recorded this period." />
            ) : (
              <div className="space-y-1">
                {shrink.map((row) => (
                  <div key={row.reason} className="flex items-center justify-between rounded-xl border border-line px-3 py-2">
                    <div>
                      <p className="text-[11px] font-semibold capitalize text-ink">
                        {row.reason.replace('_', ' ')}
                      </p>
                      <p className="text-[9px] text-muted">{row.count} adjustments</p>
                    </div>
                    <div className="text-right">
                      <p className="numeric text-[11px] font-bold text-berry">{formatQty(row.qtyBase)} base</p>
                      <p className="text-[9px] text-muted">{formatTZS(Math.abs(row.value))}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sales by category</CardTitle>
          </CardHeader>
          <CardContent>
            {categories.length === 0 ? (
              <EmptyState title="No category data" />
            ) : (
              <div className="space-y-2">
                {categories.slice(0, 6).map((category, index) => {
                  const max = categories[0]?.revenue ?? 1;
                  return (
                    <div key={category.name}>
                      <div className="flex justify-between text-[11px]">
                        <span className="text-muted">{category.name}</span>
                        <span className="numeric font-semibold text-ink">{formatTZS(category.revenue)}</span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-cream">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.max(4, Math.round((category.revenue / max) * 100))}%`,
                            background: ['#f97316', '#7d9b70', '#5c86a8', '#d9a441', '#b4556b'][index % 5]
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t.reports.staff}</CardTitle>
            <Badge variant="default">{staff.length} people</Badge>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Name</th>
                  <th className="text-right">{t.reports.count}</th>
                  <th className="text-right">{t.reports.revenueCol}</th>
                  <th className="text-right">Avg sale</th>
                  <th className="text-right">{t.reports.discounts}</th>
                  <th className="text-right">{t.reports.voids}</th>
                </tr>
              </thead>
              <tbody>
                {staff.map((person) => (
                  <tr key={person.id}>
                    <td>
                      <p className="text-xs font-semibold text-ink">{person.name}</p>
                      <p className="text-[9px] capitalize text-muted">{person.role}</p>
                    </td>
                    <td className="numeric text-right text-xs">{person.saleCount}</td>
                    <td className="numeric text-right text-xs font-semibold">{formatTZS(person.revenue)}</td>
                    <td className="numeric text-right text-xs">
                      {formatTZS(person.saleCount ? Math.round(person.revenue / person.saleCount) : 0)}
                    </td>
                    <td className="numeric text-right text-xs text-muted">{formatTZS(person.discount)}</td>
                    <td className="numeric text-right text-xs">
                      {person.voidCount > 0 ? (
                        <span className="font-semibold text-berry">{person.voidCount}</span>
                      ) : (
                        '0'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>{t.reports.closeDay}</CardTitle>
              <p className="mt-0.5 text-[11px] text-muted">Reconcile cash and tenders for a day.</p>
            </div>
            <Input
              type="date"
              value={closeDate}
              onChange={(event) => setCloseDate(event.target.value)}
              className="h-9 w-36 text-xs"
            />
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Sales', value: formatTZS(day.sales) },
                { label: 'Sales count', value: String(day.saleCount) },
                { label: 'Cash expected', value: formatTZS(day.cashExpected) },
                { label: 'Credit given', value: formatTZS(day.creditGiven) },
                { label: 'Expenses', value: formatTZS(day.expenses) },
                { label: 'Net profit', value: formatTZS(day.netProfit) }
              ].map((item) => (
                <div key={item.label} className="rounded-xl bg-cream/70 px-3 py-2">
                  <p className="text-[9px] uppercase tracking-wide text-muted">{item.label}</p>
                  <p className="numeric mt-0.5 text-xs font-bold text-ink">{item.value}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 rounded-2xl border border-line p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                    Cash counted
                  </p>
                  <p className="text-[9px] text-muted">Enter the cash you counted in the drawer.</p>
                </div>
                <Input
                  inputMode="numeric"
                  value={cashCounted}
                  onChange={(event) => setCashCounted(event.target.value.replace(/[^\d]/g, ''))}
                  placeholder="0"
                  className="h-9 w-28 text-right text-xs"
                />
              </div>
              {cashCounted && (
                <div
                  className={cn(
                    'mt-2 flex items-center justify-between rounded-xl px-3 py-2 text-xs font-semibold',
                    cashDifference === 0
                      ? 'bg-[#eef4ec] text-moss'
                      : cashDifference > 0
                        ? 'bg-[#fdf3dd] text-[#8b681f]'
                        : 'bg-[#fbecef] text-berry'
                  )}
                >
                  <span>{cashDifference === 0 ? 'Balanced' : cashDifference > 0 ? 'Over' : 'Short'}</span>
                  <span className="numeric">{formatTZS(Math.abs(cashDifference))}</span>
                </div>
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {Object.entries(day.tenderBreakdown).map(([tender, amount]) => (
                <Badge key={tender} variant="default" className="capitalize">
                  {tender} · {formatTZS(amount)}
                </Badge>
              ))}
              {Object.keys(day.tenderBreakdown).length === 0 && (
                <Badge variant="default">No payments</Badge>
              )}
            </div>
            <p className="mt-2 text-[10px] text-muted">
              {day.voidCount} voided sale{day.voidCount === 1 ? '' : 's'} · closed for{' '}
              {formatDate(new Date(`${closeDate}T12:00:00+03:00`))}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>{t.dashboard.insights}</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => setShowAllInsights((value) => !value)}>
            {showAllInsights ? 'Show top 3' : 'Show all'}
          </Button>
        </CardHeader>
        <CardContent>
          {insights.length === 0 ? (
            <EmptyState title="No insights yet" description="Insights appear as your shop builds history." />
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {(showAllInsights ? insights : insights.slice(0, 3)).map((insight) => (
                <InsightPill key={insight.id} insight={insight} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function ReportsPage() {
  return (
    <PermissionGate flag="reports.view">
      <ReportsContent />
    </PermissionGate>
  );
}
