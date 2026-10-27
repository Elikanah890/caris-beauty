'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, Cloud, CloudOff, Loader2, RefreshCw } from 'lucide-react';
import { useSyncStore } from '@/store/sync-store';
import { db } from '@/lib/db';
import { retryFailedRows, syncNow } from '@/lib/sync';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { relativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { t } from '@/lib/strings';

export function SyncStatus({ compact = false }: { compact?: boolean }) {
  const { online, syncing, pending, errorRows, error, lastSyncedAt } = useSyncStore();
  const [statusOpen, setStatusOpen] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const errorItems = useLiveQuery(
    () => db.sync_queue.where('status').equals('error').toArray(),
    [],
    []
  );

  const tone =
    errorRows > 0 || error
      ? 'danger'
      : !online
        ? 'muted'
        : syncing
          ? 'brand'
          : 'success';

  const label =
    errorRows > 0
      ? `${errorRows} sync issue${errorRows === 1 ? '' : 's'}`
      : error
        ? 'Sync paused'
        : !online
          ? t.app.offline
          : syncing
            ? t.app.syncing
            : pending > 0
              ? `${pending} ${t.app.pending}`
              : t.app.synced;

  const retryAll = async () => {
    setRetrying(true);
    try {
      await retryFailedRows();
    } finally {
      setRetrying(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setStatusOpen(true)}
        title={`${label}${lastSyncedAt ? ` · last sync ${relativeTime(lastSyncedAt)}` : ''}`}
        className={cn(
          'inline-flex items-center gap-2 rounded-full border px-2.5 py-1.5 text-[11px] font-semibold transition',
          tone === 'danger' && 'border-[#f0cdd5] bg-[#fbecef] text-berry',
          tone === 'muted' && 'border-line bg-cream text-muted',
          tone === 'brand' && 'border-brand-200 bg-brand-50 text-brand-700',
          tone === 'success' && 'border-[#d9e6d4] bg-[#eef4ec] text-moss',
          compact && 'px-2'
        )}
      >
        <span
          className={cn(
            'h-1.5 w-1.5 rounded-full',
            tone === 'danger' && 'bg-berry',
            tone === 'muted' && 'bg-muted',
            tone === 'brand' && 'bg-brand-500 animate-pulse',
            tone === 'success' && 'bg-moss'
          )}
        />
        {!compact &&
          (tone === 'danger' ? (
            <AlertTriangle size={13} />
          ) : online ? (
            <Cloud size={13} />
          ) : (
            <CloudOff size={13} />
          ))}
        {!compact && <span className="hidden sm:inline">{label}</span>}
        {syncing && <RefreshCw size={12} className="animate-spin" />}
      </button>

      <Dialog
        open={statusOpen}
        onOpenChange={setStatusOpen}
        title="Sync & offline status"
        description="Your work is saved on this device first, then sent to the server when a connection is available."
        footer={
          <>
            <Button variant="outline" onClick={() => setStatusOpen(false)}>
              Close
            </Button>
            {errorItems.length > 0 ? (
              <Button variant="danger" onClick={() => void retryAll()} disabled={retrying || !online}>
                {retrying ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                Retry failed changes
              </Button>
            ) : (
              <Button
                onClick={() => void syncNow()}
                disabled={!online || syncing}
              >
                {syncing ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <RefreshCw size={14} />
                )}
                Sync now
              </Button>
            )}
          </>
        }
      >
        <div
          className={cn(
            'flex items-start gap-3 rounded-2xl border p-4',
            online
              ? 'border-[#d9e6d4] bg-[#eef4ec] text-moss'
              : 'border-[#f2dfb5] bg-[#fdf3dd] text-[#8b681f]'
          )}
        >
          {online ? <Cloud size={20} /> : <CloudOff size={20} />}
          <div>
            <p className="text-sm font-semibold">
              {online ? (syncing ? 'Online — syncing…' : 'Online') : 'Offline'}
            </p>
            <p className="text-[11px] leading-relaxed opacity-80">
              {online
                ? 'Connected to the server. Changes sync automatically.'
                : 'You can keep selling and recording purchases. Changes are saved on this device and sync automatically when the connection returns.'}
            </p>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <div className="rounded-xl border border-line bg-white p-3">
            <p className="text-[9px] font-semibold uppercase tracking-wide text-muted">
              Pending
            </p>
            <p className="numeric mt-1 text-lg font-semibold text-ink">{pending}</p>
          </div>
          <div className="rounded-xl border border-line bg-white p-3">
            <p className="text-[9px] font-semibold uppercase tracking-wide text-muted">
              Failed
            </p>
            <p
              className={cn(
                'numeric mt-1 text-lg font-semibold',
                errorRows > 0 ? 'text-berry' : 'text-ink'
              )}
            >
              {errorRows}
            </p>
          </div>
          <div className="rounded-xl border border-line bg-white p-3">
            <p className="text-[9px] font-semibold uppercase tracking-wide text-muted">
              Last sync
            </p>
            <p className="mt-1 text-xs font-semibold text-ink">
              {lastSyncedAt ? relativeTime(lastSyncedAt) : 'Not yet'}
            </p>
          </div>
        </div>

        {error && (
          <div className="mt-3 rounded-xl border border-[#f0cdd5] bg-[#fbecef] p-3 text-xs text-berry">
            {error}
          </div>
        )}

        {errorItems.length > 0 && (
          <div className="mt-3 space-y-2">
            {errorItems.map((item) => {
              const label =
                item.entity === 'products'
                  ? 'Product'
                  : item.entity.replace(/_/g, ' ');
              const reference =
                (typeof item.payload.name === 'string' && item.payload.name) ||
                (typeof item.payload.id === 'string' && item.payload.id.slice(0, 8)) ||
                item.id.slice(0, 8);

              return (
                <div key={item.id} className="rounded-xl border border-line bg-cream/60 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-xs font-semibold capitalize text-ink">
                      {label} · {item.op}
                    </p>
                    <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted">
                      {reference}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-berry">
                    {item.error ?? 'Sync rejected'}
                  </p>
                </div>
              );
            })}
          </div>
        )}

        <p className="mt-3 rounded-xl border border-line bg-white px-3 py-2 text-[10px] leading-relaxed text-muted">
          If a change keeps failing, ask the owner to open{' '}
          <strong className="text-ink">Settings</strong> →{' '}
          <strong className="text-ink">Refresh All Data from Server</strong> to download a
          fresh copy.
        </p>
      </Dialog>
    </>
  );
}
