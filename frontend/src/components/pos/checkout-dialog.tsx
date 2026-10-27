'use client';

import { useEffect, useMemo, useState } from 'react';
import { Banknote, CreditCard, Landmark, Loader2, Smartphone, Trash2, Wallet } from 'lucide-react';
import { Dialog } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input, Label } from '../ui/input';
import { Badge } from '../ui/badge';
import { useCartStore, cartTotals } from '@/store/cart-store';
import { useAuthStore } from '@/store/auth-store';
import { formatTZS } from '@/lib/format';
import { t } from '@/lib/strings';
import { cn } from '@/lib/utils';
import { recordSale, LocalRuleError } from '@/lib/repo';
import type { Sale, Tender } from '@/lib/types';
import { toast } from '../ui/toast';

const TENDERS: Array<{
  id: Tender;
  label: string;
  icon: typeof Banknote;
  tone: string;
}> = [
  { id: 'cash', label: 'Cash', icon: Banknote, tone: 'bg-[#eef4ec] text-moss' },
  { id: 'mpesa', label: 'M-Pesa', icon: Smartphone, tone: 'bg-[#fbecef] text-berry' },
  { id: 'tigopesa', label: 'Tigo Pesa', icon: Smartphone, tone: 'bg-[#edf3f7] text-sky' },
  { id: 'airtel', label: 'Airtel', icon: Smartphone, tone: 'bg-[#fdf3dd] text-[#9a7020]' },
  { id: 'bank', label: 'Bank', icon: Landmark, tone: 'bg-cream text-muted' },
  { id: 'credit', label: 'Credit', icon: CreditCard, tone: 'bg-[#f4eefb] text-[#7b5ca8]' }
];

interface Paid {
  tender: Tender;
  amount: number;
  reference?: string;
}

export function CheckoutDialog({
  open,
  onOpenChange,
  onCompleted
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompleted: (sale: Sale) => void;
}) {
  const user = useAuthStore((state) => state.user);
  const device = useAuthStore((state) => state.device);
  const lines = useCartStore((state) => state.lines);
  const discount = useCartStore((state) => state.discount);
  const customerId = useCartStore((state) => state.customerId);
  const clear = useCartStore((state) => state.clear);
  const totals = cartTotals(lines, discount);
  const [tender, setTender] = useState<Tender>('cash');
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [payments, setPayments] = useState<Paid[]>([]);
  const [change, setChange] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);

  const paid = useMemo(
    () => payments.reduce((sum, payment) => sum + payment.amount, 0),
    [payments]
  );
  const remaining = Math.max(0, totals.total - paid);

  useEffect(() => {
    if (!open) return;
    setPayments([]);
    setChange(0);
    setError(null);
    setTender('cash');
    setAmount(totals.total > 0 ? String(totals.total) : '');
    setReference('');
    setIdempotencyKey(crypto.randomUUID());
  }, [open, totals.total]);

  const addPayment = () => {
    setError(null);
    const value = Math.round(Number(amount));
    if (!Number.isFinite(value) || value <= 0) {
      setError('Enter a payment amount');
      return;
    }
    if (tender === 'credit' && !customerId) {
      setError(t.pos.creditNeedsCustomer);
      return;
    }
    let applied = value;
    if (tender === 'cash' && value >= remaining) {
      applied = remaining;
      setChange((current) => current + Math.max(0, value - remaining));
    } else if (value > remaining) {
      setError('Payment cannot exceed the remaining balance');
      return;
    }
    if (applied <= 0) {
      setError('Nothing left to pay');
      return;
    }
    setPayments((current) => [
      ...current,
      { tender, amount: applied, reference: reference || undefined }
    ]);
    const nextRemaining = remaining - applied;
    setAmount(nextRemaining > 0 ? String(nextRemaining) : '');
    setReference('');
  };

  const complete = async () => {
    if (!user || !device) {
      setError('This device is not registered. Sign in online again.');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const sale = await recordSale({
        items: lines.map((line) => ({
          productId: line.product.id,
          unitId: line.choice.unitId,
          qty: line.qty
        })),
        discount,
        payments: payments.map((payment) => ({
          tender: payment.tender,
          amount: payment.amount,
          reference: payment.reference
        })),
        customerId,
        user,
        device,
        idempotencyKey
      });
      clear();
      onOpenChange(false);
      onCompleted(sale);
    } catch (err) {
      const message = err instanceof LocalRuleError ? err.message : 'Could not complete the sale';
      setError(message);
      toast.error('Sale not completed', message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t.pos.payment}
      description="All tender types are stored separately for clean reports."
      size="md"
    >
      <div className="flex items-center justify-between rounded-2xl bg-gradient-to-r from-ink to-[#3a2e23] px-4 py-3 text-white">
        <div>
          <p className="text-[10px] uppercase tracking-[0.16em] text-white/50">Amount due</p>
          <p className="numeric font-display text-2xl font-semibold">{formatTZS(totals.total)}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-[0.16em] text-white/50">Paid</p>
          <p className="numeric text-sm font-semibold text-brand-300">{formatTZS(paid)}</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        {TENDERS.map((option) => {
          const Icon = option.icon;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => setTender(option.id)}
              className={cn(
                'flex flex-col items-center gap-1.5 rounded-2xl border px-2 py-3 text-[11px] font-semibold transition',
                tender === option.id
                  ? 'border-brand-400 bg-brand-50 text-brand-700 ring-2 ring-brand-100'
                  : 'border-line bg-white text-muted hover:border-brand-200 hover:text-ink'
              )}
            >
              <span className={cn('rounded-xl p-1.5', option.tone)}>
                <Icon size={16} />
              </span>
              {option.label}
            </button>
          );
        })}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
        <div>
          <Label htmlFor="amount">{t.pos.amount}</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted">
              TZS
            </span>
            <Input
              id="amount"
              inputMode="numeric"
              value={amount}
              onChange={(event) => setAmount(event.target.value.replace(/[^\d]/g, ''))}
              className="pl-12 text-right text-base font-semibold"
              placeholder="0"
            />
          </div>
        </div>
        <div className="flex items-end">
          <Button variant="soft" onClick={() => setAmount(String(remaining))} className="w-full sm:w-auto">
            Exact
          </Button>
        </div>
      </div>

      {(tender === 'mpesa' || tender === 'tigopesa' || tender === 'airtel' || tender === 'bank') && (
        <div className="mt-3">
          <Label htmlFor="reference">{t.pos.reference} ({t.common.optional})</Label>
          <Input
            id="reference"
            value={reference}
            onChange={(event) => setReference(event.target.value)}
            placeholder="Transaction reference"
          />
        </div>
      )}

      {tender === 'credit' && (
        <div className="mt-3 rounded-xl bg-[#f4eefb] px-3 py-2 text-[11px] text-[#7b5ca8]">
          Credit is recorded as madeni against the selected customer. Choose a customer in the
          cart before taking credit.
        </div>
      )}

      <Button variant="outline" className="mt-3 w-full" onClick={addPayment} disabled={remaining <= 0}>
        <Wallet size={15} />
        Add payment
        {remaining > 0 && <span className="ml-auto text-xs text-muted">{formatTZS(remaining)} left</span>}
      </Button>

      {payments.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {payments.map((payment, index) => (
            <div
              key={`${payment.tender}-${index}`}
              className="flex items-center gap-2 rounded-xl border border-line bg-white px-3 py-2 text-xs"
            >
              <Badge variant="brand" className="capitalize">
                {payment.tender}
              </Badge>
              <span className="truncate text-muted">
                {payment.reference ? `Ref ${payment.reference}` : ''}
              </span>
              <span className="numeric ml-auto font-semibold text-ink">
                {formatTZS(payment.amount)}
              </span>
              <button
                type="button"
                onClick={() => {
                  setPayments((current) => current.filter((_, i) => i !== index));
                  setChange(0);
                }}
                className="rounded-md p-1 text-muted transition hover:bg-[#fbecef] hover:text-berry"
                aria-label="Remove payment"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      {change > 0 && (
        <div className="mt-3 flex items-center justify-between rounded-xl bg-[#eef4ec] px-3 py-2.5">
          <span className="text-xs font-semibold text-moss">{t.pos.change}</span>
          <span className="numeric text-sm font-bold text-moss">{formatTZS(change)}</span>
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-xl border border-[#f0cdd5] bg-[#fbecef] px-3 py-2 text-xs font-medium text-berry animate-fade-in">
          {error}
        </div>
      )}

      <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row">
        <Button variant="outline" className="sm:flex-1" onClick={() => onOpenChange(false)}>
          Back to cart
        </Button>
<Button
          className="sm-flex-[1.4]"
          disabled={saving || remaining > 0 || totals.total <= 0}
          onClick={() => void complete()}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {t.pos.receive}
          <span className="ml-auto text-xs">{formatTZS(totals.total)}</span>
        </Button>
      </div>
      <p className="mt-2 text-center text-[10px] text-muted">
        Saved on this device first. Syncs automatically when online.
      </p>
    </Dialog>
  );
}
