'use client';

import { useState } from 'react';
import { Loader2, Minus, Pencil, Plus, ShoppingCart, Trash2, UserRound, X } from 'lucide-react';
import { useCartStore, cartTotals } from '@/store/cart-store';
import { useAuthStore } from '@/store/auth-store';
import { useCustomers } from '@/lib/hooks';
import { can } from '@/lib/permissions';
import { formatQty, formatTZS } from '@/lib/format';
import { t } from '@/lib/strings';
import { Button } from '../ui/button';
import { Input, Label } from '../ui/input';
import { Badge } from '../ui/badge';
import { Dialog } from '../ui/dialog';
import { EmptyState } from '../ui/misc';
import { toast } from '../ui/toast';
import { apiRequest } from '@/lib/api';
import { db } from '@/lib/db';
import { normalizeWhatsAppPhone } from '@/lib/phone';
import type { Customer } from '@/lib/types';
import { cn } from '@/lib/utils';

export function CartPanel({
  onCheckout,
  compact = false
}: {
  onCheckout: () => void;
  compact?: boolean;
}) {
  const user = useAuthStore((state) => state.user);
  const customers = useCustomers();
  const lines = useCartStore((state) => state.lines);
  const discount = useCartStore((state) => state.discount);
  const customerId = useCartStore((state) => state.customerId);
  const updateQty = useCartStore((state) => state.updateQty);
  const removeLine = useCartStore((state) => state.removeLine);
  const setCustomer = useCartStore((state) => state.setCustomer);
  const setDiscount = useCartStore((state) => state.setDiscount);
  const clear = useCartStore((state) => state.clear);
  const totals = cartTotals(lines, discount);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerError, setCustomerError] = useState<string | null>(null);
  const [savingCustomer, setSavingCustomer] = useState(false);

  const selectedCustomer = (customers ?? []).find((customer) => customer.id === customerId) ?? null;

  const openCustomerModal = () => {
    setCustomerName(selectedCustomer?.name ?? '');
    setCustomerPhone(selectedCustomer?.phone ?? '');
    setCustomerError(null);
    setCustomerOpen(true);
  };

  const saveCustomer = async () => {
    const name = customerName.trim();
    const phone = customerPhone.trim();
    if (!name || !phone) {
      setCustomerError('Enter both a name and a WhatsApp number.');
      return;
    }
    const cleaned = phone.replace(/\s+/g, '');
    if (!/^(?:\+?255|0)\d{9}$/.test(cleaned)) {
      setCustomerError('Use 07xx xxx xxx or +2557xx xxx xxx.');
      return;
    }
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setCustomerError('Adding a customer needs internet.');
      return;
    }

    setSavingCustomer(true);
    setCustomerError(null);
    try {
      const normalized = normalizeWhatsAppPhone(cleaned);
      const existing = (customers ?? []).find(
        (customer) => normalizeWhatsAppPhone(customer.phone) === normalized
      );
      if (existing) {
        setCustomer(existing.id);
        setCustomerOpen(false);
        return;
      }
      const res = await apiRequest<{ customer: Customer }>('/customers', {
        method: 'POST',
        body: { name, phone: cleaned }
      });
      await db.customers.put(res.customer);
      setCustomer(res.customer.id);
      toast.success('Customer added', res.customer.name);
      setCustomerOpen(false);
    } catch (err) {
      setCustomerError(err instanceof Error ? err.message : 'Could not save customer.');
    } finally {
      setSavingCustomer(false);
    }
  };

  return (
    <div className={cn('flex h-full min-h-0 flex-col', compact ? '' : 'surface overflow-hidden')}>
      <div className="flex items-center justify-between border-b border-line px-4 py-3.5">
        <div className="flex items-center gap-2">
          <span className="rounded-xl bg-brand-50 p-2 text-brand-600">
            <ShoppingCart size={16} />
          </span>
          <div>
            <p className="text-sm font-semibold text-ink">{t.pos.cart}</p>
            <p className="text-[10px] text-muted">
              {formatQty(totals.itemCount)} item{totals.itemCount === 1 ? '' : 's'}
            </p>
          </div>
        </div>
        {lines.length > 0 && (
          <button
            type="button"
            onClick={clear}
            className="text-[11px] font-semibold text-muted transition hover:text-berry"
            aria-label={t.pos.clear}
          >
            {t.pos.clear}
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {lines.length === 0 ? (
          <EmptyState
            title={t.pos.emptyCart}
            description={t.pos.emptyCartHint}
            icon={<ShoppingCart size={22} />}
          />
        ) : (
          <div className="divide-y divide-line/70">
            {lines.map((line) => (
              <div key={line.key} className="group flex gap-3 p-3.5 transition hover:bg-cream/40">
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[11px] font-bold text-white"
                  style={{ background: '#f97316' }}
                >
                  {line.product.name.slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-ink">{line.product.name}</p>
                      <p className="text-[10px] text-muted">
                        {formatTZS(line.choice.pricePerUnit)} / {line.choice.unitSymbol}
                      </p>
                    </div>
                    <p className="numeric shrink-0 text-xs font-bold text-ink">
                      {formatTZS(line.lineTotal)}
                    </p>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <div className="flex items-center rounded-lg border border-line bg-white">
                      <button
                        type="button"
                        onClick={() => updateQty(line.key, Number((line.qty - 1).toFixed(3)))}
                        className="flex h-7 w-7 items-center justify-center text-muted transition hover:text-ink"
                        aria-label="Decrease"
                      >
                        <Minus size={12} />
                      </button>
                      <input
                        value={line.qty}
                        onChange={(event) =>
                          updateQty(line.key, Math.max(0, Number(event.target.value) || 0))
                        }
                        className="w-10 border-x border-line py-1 text-center text-[11px] font-semibold text-ink outline-none"
                        inputMode="decimal"
                      />
                      <button
                        type="button"
                        onClick={() => updateQty(line.key, Number((line.qty + 1).toFixed(3)))}
                        className="flex h-7 w-7 items-center justify-center text-muted transition hover:text-ink"
                        aria-label="Increase"
                      >
                        <Plus size={12} />
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeLine(line.key)}
                      className="rounded-md p-1.5 text-muted transition hover:bg-[#fbecef] hover:text-berry"
                      aria-label={t.pos.remove}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-line bg-[#fffdf9] p-4">
        <div className="mb-3 flex items-center justify-between gap-2 rounded-xl border border-line bg-white px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <UserRound size={14} className="shrink-0 text-muted" />
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-ink">
                {selectedCustomer?.name ?? t.pos.walkIn}
              </p>
              {selectedCustomer?.phone && (
                <p className="truncate text-[10px] text-muted">{selectedCustomer.phone}</p>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={openCustomerModal}
              className="rounded-md p-1.5 text-muted transition hover:bg-cream hover:text-ink"
              aria-label={selectedCustomer ? 'Edit customer' : 'Add customer'}
            >
              {selectedCustomer ? (
                <Pencil size={13} />
              ) : (
                <span className="px-1 text-[10px] font-semibold">Add</span>
              )}
            </button>
            {selectedCustomer && (
              <button
                type="button"
                onClick={() => setCustomer(null)}
                className="rounded-md p-1.5 text-muted transition hover:bg-cream hover:text-berry"
                aria-label="Remove customer"
              >
                <X size={13} />
              </button>
            )}
          </div>
        </div>

        {can(user, 'sales.discount') && (
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="text-[11px] font-medium text-muted">{t.pos.discount}</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setDiscount(discount > 0 ? 0 : Math.round(totals.subtotal * 0.1))}
                className="cursor-pointer rounded-md bg-cream px-1.5 py-0.5 text-[10px] font-semibold text-brand-600 hover:bg-brand-50"
              >
                {discount > 0 ? 'Reset' : '10%'}
              </button>
              <Input
                value={discount === 0 ? '' : discount}
                onChange={(event) => setDiscount(Math.max(0, Number(event.target.value) || 0))}
                placeholder="0"
                inputMode="numeric"
                className="h-8 w-28 text-right text-xs"
              />
            </div>
          </div>
        )}

        <div className="space-y-1.5 text-xs">
          <div className="flex justify-between text-muted">
            <span>{t.pos.subtotal}</span>
            <span className="numeric">{formatTZS(totals.subtotal)}</span>
          </div>
          {totals.discount > 0 && (
            <div className="flex justify-between text-berry">
              <span>{t.pos.discount}</span>
              <span className="numeric">−{formatTZS(totals.discount)}</span>
            </div>
          )}
          <div className="flex items-end justify-between border-t border-dashed border-line pt-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">
              {t.pos.total}
            </span>
            <span className="numeric font-display text-2xl font-semibold text-ink">
              {formatTZS(totals.total)}
            </span>
          </div>
        </div>

        <Button
          size="lg"
          className="mt-3 w-full"
          disabled={lines.length === 0}
          onClick={onCheckout}
        >
          {t.pos.checkout}
          <span className="ml-auto rounded-lg bg-white/20 px-2 py-0.5 text-[11px]">
            {formatTZS(totals.total)}
          </span>
        </Button>
        {lines.length > 0 && (
          <p className="mt-2 text-center text-[10px] text-muted">
            Stock updates instantly on this device · syncs automatically
          </p>
        )}
      </div>

      <Dialog
        open={customerOpen}
        onOpenChange={setCustomerOpen}
        title="Customer"
        description="Add a name and WhatsApp number to send the receipt."
        size="sm"
      >
        <div className="space-y-3">
          <div>
            <Label htmlFor="customer-name">Name</Label>
            <Input
              id="customer-name"
              value={customerName}
              onChange={(event) => setCustomerName(event.target.value)}
              placeholder="Customer name"
            />
          </div>
          <div>
            <Label htmlFor="customer-phone">WhatsApp number</Label>
            <Input
              id="customer-phone"
              value={customerPhone}
              onChange={(event) => setCustomerPhone(event.target.value)}
              placeholder="+2557xx xxx xxx"
              inputMode="tel"
            />
          </div>
          {customerError && (
            <p className="rounded-xl bg-[#fbecef] px-3 py-2 text-[11px] font-medium text-berry">
              {customerError}
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => setCustomerOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void saveCustomer()} disabled={savingCustomer}>
              {savingCustomer ? <Loader2 size={15} className="animate-spin" /> : null}
              Save
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
