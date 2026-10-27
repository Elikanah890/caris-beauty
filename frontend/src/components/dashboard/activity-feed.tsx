'use client';

import Link from 'next/link';
import { Boxes, CreditCard, ReceiptText, ShoppingBag, Wallet } from 'lucide-react';
import { formatTZS, relativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { ActivityItem } from '@/lib/dashboard';

const ICONS = {
  sale: ReceiptText,
  purchase: ShoppingBag,
  cost: Wallet,
  payment: CreditCard,
  stock: Boxes
} as const;

const TONES: Record<ActivityItem['kind'], string> = {
  sale: 'bg-brand-50 text-brand-600',
  purchase: 'bg-[#edf3f7] text-sky',
  cost: 'bg-[#fdf3dd] text-[#9a7020]',
  payment: 'bg-[#eef4ec] text-moss',
  stock: 'bg-cream text-muted'
};

function statusTone(status: string): string {
  if (status === 'Cancelled') return 'bg-[#fbecef] text-berry';
  if (status === 'Credit') return 'bg-[#fdf3dd] text-[#9a7020]';
  if (status === 'Paid' || status === 'Received') return 'bg-[#eef4ec] text-moss';
  return 'bg-cream text-muted';
}

export function ActivityFeed({ items }: { items: ActivityItem[] }) {
  if (items.length === 0) return null;

  return (
    <div className="divide-y divide-line/60">
      {items.map((item) => {
        const Icon = ICONS[item.kind];
        return (
          <Link
            key={item.id}
            href={item.href}
            className="flex items-center gap-3 py-2.5 transition hover:bg-cream/50"
          >
            <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', TONES[item.kind])}>
              <Icon size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate text-xs font-semibold text-ink">{item.title}</p>
                <span className={cn('shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold', statusTone(item.status))}>
                  {item.status}
                </span>
              </div>
              <p className="truncate text-[10px] text-muted">
                {item.detail} · {relativeTime(item.at)}
              </p>
            </div>
            {item.amount !== null && (
              <p className="numeric shrink-0 text-xs font-bold text-ink">{formatTZS(item.amount)}</p>
            )}
          </Link>
        );
      })}
    </div>
  );
}
