'use client';

import { useEffect, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { formatTZS, formatNumber } from '@/lib/format';
import type { CategoryTrend } from './types';
import type { Period } from '@/lib/types';

const COLORS = ['#f97316', '#7d9b70', '#5c86a8', '#d9a441', '#b4556b', '#c98b62', '#8c7ae6'];

export function Sparkline({
  values,
  tone = '#f97316'
}: {
  values: number[];
  tone?: string;
}) {
  if (values.length === 0) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const points = values
    .map((value, index) => {
      const x = (index / Math.max(1, values.length - 1)) * 100;
      const y = 30 - ((value - min) / Math.max(1, max - min)) * 26;
      return `${x},${y}`;
    })
    .join(' ');
  return (
    <svg viewBox="0 0 100 32" className="h-8 w-20" preserveAspectRatio="none">
      <polyline
        points={points}
        fill="none"
        stroke={tone}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function RevenueTrend({
  data,
  period
}: {
  data: Array<{ label: string; revenue: number; orders: number }>;
  period: Period;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="h-[240px] animate-pulse rounded-2xl bg-cream" />;

  return (
    <div className="h-[240px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 12, right: 6, left: -18, bottom: 0 }}>
          <defs>
            <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f97316" stopOpacity={0.28} />
              <stop offset="100%" stopColor="#f97316" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="ordersFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#7d9b70" stopOpacity={0.18} />
              <stop offset="100%" stopColor="#7d9b70" stopOpacity={0.01} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#f0e6d9" strokeDasharray="4 6" vertical={false} />
          <XAxis
            dataKey="label"
            tickFormatter={(value: string) =>
              period === 'today' ? value : value.slice(5)
            }
            tick={{ fontSize: 10, fill: '#9b8d7e' }}
            axisLine={false}
            tickLine={false}
            dy={6}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 10, fill: '#9b8d7e' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(value: number) => (value >= 1000 ? `${Math.round(value / 1000)}k` : String(value))}
          />
          <Tooltip
            contentStyle={{
              borderRadius: 14,
              border: '1px solid #efe5d8',
              fontSize: 12,
              boxShadow: '0 12px 30px -18px rgba(48,32,18,.3)'
            }}
            formatter={(value: number, name: string) =>
              name === 'revenue' ? [formatTZS(value), 'Revenue'] : [formatNumber(value), 'Orders']
            }
            labelFormatter={(label: string) => (period === 'today' ? `At ${label}` : label)}
          />
          <Area
            type="monotone"
            dataKey="revenue"
            stroke="#f97316"
            strokeWidth={2.4}
            fill="url(#salesFill)"
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }}
          />
          <Area
            type="monotone"
            dataKey="orders"
            stroke="#7d9b70"
            strokeWidth={1.8}
            strokeDasharray="5 4"
            fill="url(#ordersFill)"
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CategoryDonut({ data }: { data: CategoryTrend[] }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const total = data.reduce((sum, entry) => sum + entry.revenue, 0);
  if (!mounted) return <div className="h-[180px] animate-pulse rounded-2xl bg-cream" />;
  if (total === 0) {
    return (
      <div className="flex h-[180px] flex-col items-center justify-center text-center">
        <p className="text-sm font-medium text-muted">No category sales yet today</p>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="h-[180px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="revenue"
              nameKey="name"
              innerRadius={56}
              outerRadius={82}
              paddingAngle={2}
              strokeWidth={0}
            >
              {data.map((entry, index) => (
                <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: number) => [formatTZS(value), 'Revenue']}
              contentStyle={{
                borderRadius: 12,
                border: '1px solid #efe5d8',
                fontSize: 12
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Total</p>
        <p className="numeric font-display text-xl font-semibold text-ink">{formatTZS(total)}</p>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
        {data.slice(0, 6).map((entry, index) => (
          <div key={entry.name} className="flex items-center gap-2">
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: COLORS[index % COLORS.length] }}
            />
            <span className="min-w-0 flex-1 truncate text-[11px] text-muted">{entry.name}</span>
            <span className="text-[11px] font-semibold text-ink">
              {total > 0 ? Math.round((entry.revenue / total) * 100) : 0}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function StatusRing({
  completed,
  voided,
  credit
}: {
  completed: number;
  voided: number;
  credit: number;
}) {
  const total = completed + voided + credit;
  const completedPct = total ? Math.round((completed / total) * 100) : 0;
  return (
    <div className="flex items-center gap-4">
      <div
        className="relative flex h-28 w-28 items-center justify-center rounded-full"
        style={{
          background: `conic-gradient(#5f7d58 0 ${completedPct}%, #e0a64d ${completedPct}% ${completedPct + (total ? Math.round((credit / total) * 100) : 0)}%, #e8d7d0 0 100%)`
        }}
      >
        <div className="flex h-[86px] w-[86px] flex-col items-center justify-center rounded-full bg-paper">
          <p className="font-display text-2xl font-semibold text-ink">{completed}</p>
          <p className="text-[9px] uppercase tracking-wide text-muted">Completed</p>
        </div>
      </div>
      <div className="space-y-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-moss" />
          <span className="text-muted">Completed</span>
          <span className="ml-auto font-semibold text-ink">{completed}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-gold" />
          <span className="text-muted">On credit</span>
          <span className="ml-auto font-semibold text-ink">{credit}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-[#e8d7d0]" />
          <span className="text-muted">Voided</span>
          <span className="ml-auto font-semibold text-ink">{voided}</span>
        </div>
      </div>
    </div>
  );
}
