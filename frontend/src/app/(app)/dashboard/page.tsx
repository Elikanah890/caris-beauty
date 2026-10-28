'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  AlertTriangle,
  BarChart3,
  Boxes,
  ClipboardList,
  Download,
  Package,
  PackageX,
  Plus,
  Receipt,
  ReceiptText,
  Sparkles,
  TrendingUp,
  Users,
  Wallet
} from 'lucide-react';
import { useAuthStore } from '@/store/auth-store';
import { db } from '@/lib/db';
import { useSnapshot } from '@/lib/hooks';
import { activityFeed, dashboardOverview, profitMargin } from '@/lib/dashboard';
import { periodRange, profitLoss } from '@/lib/reports';
import { computeInsights } from '@/lib/insights';
import { formatDate, formatQty, formatTZS, greeting } from '@/lib/format';
import { can } from '@/lib/permissions';
import { t } from '@/lib/strings';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
const RevenueTrend = dynamic(
  () => import('@/components/dashboard/charts').then((mod) => mod.RevenueTrend),
  {
    ssr: false,
    loading: () => <div className="h-[240px] animate-pulse rounded-2xl bg-cream" />
  }
);
import { ActivityFeed } from '@/components/dashboard/activity-feed';
import { PermissionGate } from '@/components/permission-gate';
import type { Insight } from '@/lib/types';

type TrendPeriod = 'today' | 'week' | 'month';

const RANK_COLORS = ['#f97316', '#7d9b70', '#5c86a8', '#d9a441', '#b4556b'];

function StatCard({
  label,
  value,
  icon: Icon,
  subtitle,
  tone,
  href,
  valueClassName,
  large = false
}: {
  label: string;
  value: string;
  icon: typeof Wallet;
  subtitle: string;
  tone: string;
  href?: string;
  valueClassName?: string;
  large?: boolean;
}) {
  const card = (
    <Card className="surface-hover h-full overflow-hidden transition group-hover:border-brand-200">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-2">
          <span className={cn('rounded-xl p-2.5', tone)}>
            <Icon size={18} strokeWidth={2.2} />
          </span>
        </div>
        <p className="mt-4 text-[11px] font-medium uppercase tracking-wide text-muted">{label}</p>
        <p
          className={cn(
            'numeric mt-1 font-display font-semibold leading-tight tracking-tight',
            large ? 'text-[30px]' : 'text-[26px]',
            valueClassName ?? 'text-ink'
          )}
        >
          {value}
        </p>
        <p
          className={cn(
            'mt-2 text-[11px]',
            href
              ? 'font-semibold text-brand-600 transition group-hover:text-brand-700'
              : 'text-muted'
          )}
        >
          {subtitle}
        </p>
      </CardContent>
    </Card>
  );

  if (!href) return card;

  return (
    <Link
      href={href}
      className="group block h-full rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
    >
      {card}
    </Link>
  );
}

function AlertTile({
  href,
  label,
  value,
  icon: Icon,
  tone
}: {
  href: string;
  label: string;
  value: number;
  icon: typeof Boxes;
  tone: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-2xl border border-line/70 bg-white p-3 transition hover:border-brand-200 hover:bg-brand-50/30"
    >
      <span className={cn('inline-flex rounded-xl p-2', tone)}>
        <Icon size={16} />
      </span>
      <p className="numeric mt-2 font-display text-2xl font-semibold text-ink">{formatQty(value)}</p>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted group-hover:text-brand-700">
        {label}
      </p>
    </Link>
  );
}

function InsightRow({ insight }: { insight: Insight }) {
  const tone =
    insight.severity === 'danger'
      ? 'bg-[#fbecef] text-berry'
      : insight.severity === 'warn'
        ? 'bg-[#fdf3dd] text-[#9a7020]'
        : 'bg-[#edf3f7] text-sky';
  const Icon =
    insight.severity === 'danger' ? TrendingUp : insight.severity === 'warn' ? Boxes : Sparkles;
  return (
    <div className="flex gap-3 rounded-2xl border border-line/70 bg-white p-3 transition hover:border-brand-200 hover:bg-brand-50/20">
      <span className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl', tone)}>
        <Icon size={15} />
      </span>
      <div className="min-w-0">
        <p className="text-[12px] leading-relaxed text-ink">{insight.message}</p>
        {insight.cta && (
          <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-brand-600">
            {insight.cta}
          </p>
        )}
      </div>
    </div>
  );
}

function DashboardContent() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const storedBusiness = useAuthStore((state) => state.business);
  const businessRow = useLiveQuery(() => db.business.toArray(), []);
  const snapshot = useSnapshot();
  const [period, setPeriod] = useState<TrendPeriod>('today');

  const data = useMemo(
    () => (snapshot ? dashboardOverview(snapshot, period) : null),
    [snapshot, period]
  );
  const todayPnl = useMemo(
    () => (snapshot ? profitLoss(snapshot, periodRange('today')) : null),
    [snapshot]
  );
  const activity = useMemo(() => (snapshot ? activityFeed(snapshot, 6) : []), [snapshot]);
  const insights = useMemo(
    () => (snapshot ? computeInsights(snapshot).slice(0, 3) : []),
    [snapshot]
  );

  if (!data || !todayPnl) {
    return (
      <div className="space-y-4">
        <div className="h-20 animate-pulse rounded-2xl bg-white/60" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="h-36 animate-pulse rounded-2xl bg-white/60" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="h-72 animate-pulse rounded-2xl bg-white/60 lg:col-span-2" />
          <div className="h-72 animate-pulse rounded-2xl bg-white/60" />
        </div>
      </div>
    );
  }

  const hour = greeting();
  const greetingText =
    hour === 'morning'
      ? t.dashboard.greeting
      : hour === 'afternoon'
        ? t.dashboard.greetingAfternoon
        : t.dashboard.greetingEvening;
  const shopName = businessRow?.[0]?.name ?? storedBusiness?.name ?? 'Your shop';
  const hasSales = data.today.saleCount > 0;
  const margin = profitMargin(todayPnl.grossProfit, todayPnl.revenue);
  const salesSubtitle =
    data.today.saleCount === 0
      ? t.dashboard.noSales
      : data.today.saleCount === 1
        ? '1 sale made today'
        : `${formatQty(data.today.saleCount)} sales made today`;
  const costsSubtitle =
    data.today.expenseCount === 0
      ? 'No costs recorded today'
      : `${formatQty(data.today.expenseCount)} cost${data.today.expenseCount === 1 ? '' : 's'} recorded today`;

  return (
    <div>
      <PageHeader
        eyebrow={shopName}
        title={`${greetingText}, ${user?.name.split(' ')[0] ?? 'there'}`}
        subtitle={t.dashboard.subtitle}
        actions={
          <>
            <Button variant="outline" size="md" onClick={() => router.push('/reports')}>
              <Download size={15} />
              {t.dashboard.downloadReport}
            </Button>
            {can(user, 'stock.receive') && (
              <Button size="md" onClick={() => router.push('/stock?add=1')}>
                <Plus size={15} />
                {t.dashboard.addItem}
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="animate-fade-up">
          <StatCard
            label={t.dashboard.salesToday}
            value={formatTZS(todayPnl.revenue)}
            icon={Wallet}
            subtitle={salesSubtitle}
            tone="bg-brand-50 text-brand-600"
          />
        </div>
        <div className="animate-fade-up delay-1">
          <StatCard
            label="Gross Profit"
            value={formatTZS(todayPnl.grossProfit)}
            icon={TrendingUp}
            subtitle={margin === null ? t.dashboard.noProfitData : `Gross margin: ${margin}%`}
            tone="bg-[#edf3f7] text-sky"
          />
        </div>
        <div className="animate-fade-up delay-2">
          <StatCard
            label="Expenses today"
            value={formatTZS(todayPnl.expensesTotal)}
            icon={Receipt}
            subtitle={costsSubtitle}
            tone="bg-[#fdf3dd] text-[#9a7020]"
          />
        </div>
        <div className="animate-fade-up delay-3">
          <StatCard
            label="Net Profit"
            value={formatTZS(todayPnl.netProfit)}
            icon={TrendingUp}
            subtitle="After expenses"
            tone={
              todayPnl.netProfit >= 0
                ? 'bg-[#eef4ec] text-moss'
                : 'bg-[#fbecef] text-berry'
            }
            valueClassName={todayPnl.netProfit >= 0 ? 'text-moss' : 'text-berry'}
            large
          />
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="animate-fade-up delay-2 lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>{t.dashboard.stockAlerts}</CardTitle>
              <p className="mt-0.5 text-[11px] text-muted">
                {formatQty(data.stock.reorder)} product{data.stock.reorder === 1 ? '' : 's'} need
                attention
              </p>
            </div>
            <Link href="/stock" className="text-[11px] font-semibold text-brand-600 hover:underline">
              {t.dashboard.checkStock}
            </Link>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-3">
              <AlertTile
                href="/stock?filter=low"
                label={t.dashboard.lowStock}
                value={data.stock.low}
                icon={AlertTriangle}
                tone="bg-[#fdf3dd] text-[#9a7020]"
              />
              <AlertTile
                href="/stock?filter=out"
                label={t.dashboard.outOfStock}
                value={data.stock.out}
                icon={PackageX}
                tone="bg-[#fbecef] text-berry"
              />
              <AlertTile
                href="/stock?filter=low"
                label={t.dashboard.needReorder}
                value={data.stock.reorder}
                icon={ClipboardList}
                tone="bg-[#edf3f7] text-sky"
              />
            </div>
          </CardContent>
        </Card>

        <Card className="animate-fade-up delay-3">
          <CardHeader>
            <CardTitle>{t.dashboard.customerDebts}</CardTitle>
            <Users size={15} className="text-muted" />
          </CardHeader>
          <CardContent>
            <p className="numeric font-display text-2xl font-semibold text-ink">
              {formatTZS(data.debts.total)}
            </p>
            <div className="mt-3 space-y-2 text-[11px]">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted">{t.dashboard.totalUnpaid}</span>
                <span className="numeric font-semibold text-ink">{formatTZS(data.debts.total)}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted">{t.dashboard.customersOwing}</span>
                <span className="font-semibold text-ink">{formatQty(data.debts.customers)}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted">{t.dashboard.latePayments}</span>
                <span className="font-semibold text-ink">{formatQty(data.debts.latePayments)}</span>
              </div>
            </div>
            {data.debts.customers === 0 && (
              <p className="mt-3 rounded-xl bg-cream/70 px-3 py-2 text-[11px] text-muted">
                {t.dashboard.noDebts}
              </p>
            )}
            <Link
              href="/more/customers"
              className="mt-3 flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-line px-3 py-2 text-[11px] font-semibold text-muted transition hover:border-brand-300 hover:text-brand-700"
            >
              <Users size={13} /> {t.dashboard.viewCustomers}
            </Link>
          </CardContent>
        </Card>
      </div>

      <div className="mt-4">
        {!hasSales ? (
          <div className="overflow-hidden rounded-2xl border border-brand-200 bg-gradient-to-r from-brand-50 via-[#fff8ee] to-white p-5 animate-fade-up delay-4">
            <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
              <div className="flex items-center gap-3">
                <span className="rounded-2xl bg-white p-3 text-brand-600">
                  <ReceiptText size={22} />
                </span>
                <div>
                  <p className="text-sm font-semibold text-ink">{t.dashboard.noSales}</p>
                  <p className="text-[11px] text-muted">{t.dashboard.noSalesHint}</p>
                </div>
              </div>
              <Button onClick={() => router.push('/pos')}>{t.dashboard.startSelling}</Button>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="animate-fade-up delay-2 lg:col-span-2">
              <CardHeader>
                <div>
                  <CardTitle>{t.dashboard.revenueTrend}</CardTitle>
                  <p className="mt-0.5 text-[11px] text-muted">
                    {formatDate(new Date(), { day: 'numeric', month: 'short' })}
                  </p>
                </div>
                <div className="flex rounded-xl bg-cream p-1">
                  {(['today', 'week', 'month'] as const).map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setPeriod(key)}
                      className={cn(
                        'rounded-lg px-2.5 py-1 text-[11px] font-semibold capitalize transition',
                        period === key
                          ? 'bg-white text-ink shadow-sm'
                          : 'text-muted hover:text-ink'
                      )}
                    >
                      {key === 'today' ? 'Today' : key === 'week' ? 'Week' : 'Month'}
                    </button>
                  ))}
                </div>
              </CardHeader>
              <CardContent>
                <RevenueTrend data={data.trend} period={period} />
                <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
                  <span className="font-semibold text-muted">{t.dashboard.orderStatus}</span>
                  <span className="rounded-full bg-[#eef4ec] px-2 py-1 font-semibold text-moss">
                    {t.dashboard.completed} {data.salesSummary.paid}
                  </span>
                  <span className="rounded-full bg-[#fdf3dd] px-2 py-1 font-semibold text-[#9a7020]">
                    {t.dashboard.credit} {data.salesSummary.credit}
                  </span>
                  <span className="rounded-full bg-[#fbecef] px-2 py-1 font-semibold text-berry">
                    {t.dashboard.voided} {data.salesSummary.cancelled}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card className="animate-fade-up delay-3">
              <CardHeader>
                <div>
                  <CardTitle>{t.dashboard.topProducts}</CardTitle>
                  <p className="mt-0.5 text-[11px] text-muted">{t.dashboard.topFive}</p>
                </div>
                <Link
                  href="/reports"
                  className="text-[11px] font-semibold text-brand-600 hover:underline"
                >
                  {t.dashboard.viewAll}
                </Link>
              </CardHeader>
              <CardContent>
                {data.top.length === 0 ? (
                  <p className="py-6 text-center text-xs text-muted">
                    {t.dashboard.noProductDetails}
                  </p>
                ) : (
                  <div>
                    <div className="mb-1 grid grid-cols-[1fr_auto_auto] gap-2 px-1 text-[9px] font-semibold uppercase tracking-wide text-muted">
                      <span>{t.stock.product}</span>
                      <span>{t.dashboard.soldQty}</span>
                      <span>{t.dashboard.earned}</span>
                    </div>
                    <div className="space-y-1">
                      {data.top.map((product, index) => (
                        <div
                          key={product.productId}
                          className="grid grid-cols-[1fr_auto_auto] items-center gap-2 rounded-xl px-1 py-2 transition hover:bg-cream/70"
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <span
                              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold text-white"
                              style={{ background: RANK_COLORS[index % RANK_COLORS.length] }}
                            >
                              {index + 1}
                            </span>
                            <p className="truncate text-xs font-semibold text-ink">
                              {product.productName}
                            </p>
                          </div>
                          <p className="numeric text-[11px] text-muted">
                            {formatQty(product.qtyBase)}
                          </p>
                          <p className="numeric text-right text-xs font-bold text-ink">
                            {formatTZS(product.revenue)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {(activity.length > 0 || insights.length > 0) && (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {activity.length > 0 && (
            <Card className="animate-fade-up delay-4">
              <CardHeader>
                <CardTitle>{t.dashboard.recentActivity}</CardTitle>
                <Link
                  href="/more/audit"
                  className="text-[11px] font-semibold text-brand-600 hover:underline"
                >
                  {t.dashboard.viewAll}
                </Link>
              </CardHeader>
              <CardContent>
                <ActivityFeed items={activity} />
              </CardContent>
            </Card>
          )}

          <Card
            className={cn('animate-fade-up delay-5', activity.length === 0 && 'lg:col-span-2')}
          >
            <CardHeader>
              <div className="flex items-center gap-2">
                <span className="rounded-xl bg-brand-50 p-1.5 text-brand-600">
                  <Sparkles size={15} />
                </span>
                <CardTitle>{t.dashboard.insights}</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {insights.length === 0 ? (
                <p className="rounded-2xl bg-cream/70 px-3 py-6 text-center text-xs text-muted">
                  {t.dashboard.allClear}
                </p>
              ) : (
                <div className="space-y-2">
                  {insights.map((insight) => (
                    <InsightRow key={insight.id} insight={insight} />
                  ))}
                </div>
              )}
              <Link
                href="/reports"
                className="mt-3 flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-line px-3 py-2 text-[11px] font-semibold text-muted transition hover:border-brand-300 hover:text-brand-700"
              >
                <BarChart3 size={13} /> {t.dashboard.openReports}
              </Link>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <PermissionGate ownerOnly>
      <DashboardContent />
    </PermissionGate>
  );
}
