'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ClipboardList, Search, ShieldCheck } from 'lucide-react';
import { PageHeader, EmptyState } from '@/components/ui/misc';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { PermissionGate } from '@/components/permission-gate';
import { db } from '@/lib/db';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { t } from '@/lib/strings';

const TONE: Record<string, string> = {
  void: 'danger',
  discount: 'warning',
  adjust: 'warning',
  permission: 'info',
  password: 'info',
  delete: 'danger',
  created: 'success',
  price: 'warning',
  expense: 'brand'
};

function toneFor(action: string): string {
  const key = Object.keys(TONE).find((entry) => action.includes(entry));
  return key ? (TONE[key] as string) : 'default';
}

function AuditContent() {
  const [search, setSearch] = useState('');
  const rows = useLiveQuery(
    () => db.audit_log.orderBy('createdAt').reverse().limit(300).toArray(),
    []
  );
  const filtered = (rows ?? []).filter((row) => {
    const term = search.toLowerCase();
    if (!term) return true;
    return `${row.action} ${row.entity} ${row.userName ?? ''} ${JSON.stringify(row.details)}`
      .toLowerCase()
      .includes(term);
  });

  return (
    <div>
      <PageHeader
        eyebrow="Accountability"
        title={t.more.audit}
        subtitle="Every void, discount, adjustment, permission change and expense is recorded."
      />

      <div className="surface overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-line p-3.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative max-w-md flex-1">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search action, user or detail…"
              className="pl-10"
            />
          </div>
          <Badge variant="success">
            <ShieldCheck size={11} /> {rows?.length ?? 0} entries
          </Badge>
        </div>

        {!rows ? (
          <div className="space-y-2 p-4">
            {[0, 1, 2, 3].map((index) => (
              <div key={index} className="h-14 animate-pulse rounded-xl bg-cream" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            title={search ? 'No matching audit entries' : 'No audit entries yet'}
            description={
              search
                ? 'Try a different action or user name.'
                : 'Sensitive actions will appear here as your team works.'
            }
            icon={<ClipboardList size={22} />}
          />
        ) : (
          <div className="divide-y divide-line/70">
            {filtered.map((row) => {
              const tone = toneFor(row.action);
              return (
                <div key={row.id} className="flex gap-3 p-3.5 transition hover:bg-cream/40">
                  <span
                    className={cn(
                      'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl',
                      tone === 'danger' && 'bg-[#fbecef] text-berry',
                      tone === 'warning' && 'bg-[#fdf3dd] text-[#9a7020]',
                      tone === 'info' && 'bg-[#edf3f7] text-sky',
                      tone === 'success' && 'bg-[#eef4ec] text-moss',
                      tone === 'brand' && 'bg-brand-50 text-brand-600',
                      tone === 'default' && 'bg-cream text-muted'
                    )}
                  >
                    <ClipboardList size={14} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xs font-semibold text-ink">
                        {row.action.replace(/[._]/g, ' ')}
                      </p>
                      <Badge variant="default">{row.entity}</Badge>
                    </div>
                    <p className="mt-0.5 text-[10px] text-muted">
                      {row.userName ?? 'System'} · {formatDateTime(row.createdAt)}
                    </p>
                    {Object.keys(row.details ?? {}).length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {Object.entries(row.details).slice(0, 6).map(([key, value]) => (
                          <span
                            key={key}
                            className="rounded-md bg-cream px-1.5 py-0.5 font-mono text-[9px] text-muted"
                          >
                            {key}: {String(value).slice(0, 40)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <p className="mt-3 px-1 text-[10px] text-muted">
        Audit entries are pulled from the server. Offline actions appear after the next sync.
      </p>
    </div>
  );
}

export default function AuditPage() {
  return (
    <PermissionGate ownerOnly>
      <AuditContent />
    </PermissionGate>
  );
}
