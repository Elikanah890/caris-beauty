'use client';

import { create } from 'zustand';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { uuid } from '@/lib/utils';

type ToastKind = 'success' | 'error' | 'info';

interface ToastItem {
  id: string;
  kind: ToastKind;
  title: string;
  description?: string;
}

interface ToastState {
  items: ToastItem[];
  push: (item: Omit<ToastItem, 'id'>) => void;
  dismiss: (id: string) => void;
}

const useToastStore = create<ToastState>((set) => ({
  items: [],
  push: (item) => {
    const id = uuid();
    set((state) => ({ items: [...state.items, { ...item, id }] }));
    setTimeout(() => {
      set((state) => ({ items: state.items.filter((toast) => toast.id !== id) }));
    }, 4200);
  },
  dismiss: (id) =>
    set((state) => ({ items: state.items.filter((toast) => toast.id !== id) }))
}));

export const toast = {
  success: (title: string, description?: string) =>
    useToastStore.getState().push({ kind: 'success', title, description }),
  error: (title: string, description?: string) =>
    useToastStore.getState().push({ kind: 'error', title, description }),
  info: (title: string, description?: string) =>
    useToastStore.getState().push({ kind: 'info', title, description })
};

export function Toaster() {
  const items = useToastStore((state) => state.items);
  const dismiss = useToastStore((state) => state.dismiss);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[70] flex flex-col items-center gap-2 px-3 sm:inset-x-auto sm:right-4 sm:top-4 sm:items-end">
      {items.map((item) => (
        <div
          key={item.id}
          className={cn(
            'pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border bg-paper p-3.5 shadow-soft animate-fade-up',
            item.kind === 'success' && 'border-[#d9e6d4]',
            item.kind === 'error' && 'border-[#f0cdd5]',
            item.kind === 'info' && 'border-line'
          )}
        >
          <span
            className={cn(
              'mt-0.5 rounded-full p-1.5',
              item.kind === 'success' && 'bg-[#eef4ec] text-moss',
              item.kind === 'error' && 'bg-[#fbecef] text-berry',
              item.kind === 'info' && 'bg-cream text-muted'
            )}
          >
            {item.kind === 'success' ? (
              <CheckCircle2 size={16} />
            ) : item.kind === 'error' ? (
              <AlertTriangle size={16} />
            ) : (
              <Info size={16} />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink">{item.title}</p>
            {item.description && <p className="mt-0.5 text-xs text-muted">{item.description}</p>}
          </div>
          <button
            type="button"
            onClick={() => dismiss(item.id)}
            className="rounded-full p-1 text-muted transition hover:bg-cream hover:text-ink"
            aria-label="Dismiss"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
