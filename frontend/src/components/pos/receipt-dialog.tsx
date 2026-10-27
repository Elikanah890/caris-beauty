'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, MessageCircle, Printer } from 'lucide-react';
import { Dialog } from '../ui/dialog';
import { Button } from '../ui/button';
import { formatDateTime, formatQty, formatTZS } from '@/lib/format';
import type { Business, Sale, Tender } from '@/lib/types';
import { t } from '@/lib/strings';
import { cn } from '@/lib/utils';
import { normalizeWhatsAppPhone } from '@/lib/phone';

const TENDER_LABELS: Record<Tender, string> = {
  cash: 'Cash',
  mpesa: 'M-Pesa',
  tigopesa: 'Tigo Pesa',
  airtel: 'Airtel Money',
  bank: 'Bank',
  credit: 'Credit'
};

function buildReceiptText(sale: Sale, business: Business | null): string {
  const lines: string[] = [];
  lines.push(business?.name ?? 'Caris Beauty and Cosmetics');
  if (business?.phone) lines.push(`Tel: ${business.phone}`);
  if (business?.address) lines.push(business.address);
  lines.push('');
  lines.push(`Receipt: ${sale.receiptNo}`);
  lines.push(`Date: ${formatDateTime(sale.soldAt)}`);
  if (sale.userName) lines.push(`Cashier: ${sale.userName}`);
  if (sale.customerName) lines.push(`Customer: ${sale.customerName}`);
  lines.push('--------------------------------');
  for (const item of sale.items) {
    lines.push(item.productName);
    lines.push(
      `  ${formatQty(item.qty)} ${item.unitSymbol} x ${formatTZS(item.pricePerUnit)} = ${formatTZS(item.lineTotal)}`
    );
  }
  lines.push('--------------------------------');
  lines.push(`Subtotal: ${formatTZS(sale.subtotal)}`);
  if (sale.discount > 0) lines.push(`Discount: -${formatTZS(sale.discount)}`);
  lines.push(`TOTAL: ${formatTZS(sale.total)}`);
  lines.push('');
  for (const payment of sale.payments) {
    lines.push(`${TENDER_LABELS[payment.tender] ?? payment.tender}: ${formatTZS(payment.amount)}`);
  }
  const paid = sale.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
  const change = Math.max(0, paid - sale.total);
  if (change > 0) lines.push(`Change: ${formatTZS(change)}`);
  lines.push('');
  lines.push('Asante kwa kununua! / Thank you for your purchase!');
  return lines.join('\n');
}

function ReceiptBody({
  sale,
  business,
  businessName,
  className
}: {
  sale: Sale;
  business: Business | null;
  businessName: string;
  className?: string;
}) {
  const paid = sale.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
  const change = Math.max(0, paid - sale.total);

  return (
    <div className={cn('receipt-print font-mono text-[11px] leading-relaxed text-black', className)}>
      <div className="text-center">
        <p className="text-sm font-bold uppercase tracking-wide">{businessName}</p>
        {business?.phone && <p>{business.phone}</p>}
        {business?.address && <p>{business.address}</p>}
      </div>

      <div className="my-3 border-t border-dotted border-black/50" />

      <div className="flex justify-between gap-2">
        <span className="text-black/60">Receipt</span>
        <span className="font-bold">{sale.receiptNo}</span>
      </div>
      <div className="flex justify-between gap-2">
        <span className="text-black/60">Date</span>
        <span>{formatDateTime(sale.soldAt)}</span>
      </div>
      <div className="flex justify-between gap-2">
        <span className="text-black/60">Cashier</span>
        <span>{sale.userName ?? '—'}</span>
      </div>
      {sale.customerName && (
        <div className="flex justify-between gap-2">
          <span className="text-black/60">Customer</span>
          <span className="text-right">{sale.customerName}</span>
        </div>
      )}

      <div className="my-3 border-t border-dotted border-black/50" />

      <div className="space-y-2">
        {sale.items.map((item) => (
          <div key={item.id}>
            <div className="flex items-baseline gap-1">
              <span className="min-w-0 truncate font-semibold">{item.productName}</span>
              <span className="flex-1 border-b border-dotted border-black/40" />
              <span className="shrink-0 font-semibold">{formatTZS(item.lineTotal)}</span>
            </div>
            <div className="text-[9px] text-black/60">
              {formatQty(item.qty)} {item.unitSymbol} × {formatTZS(item.pricePerUnit)}
            </div>
          </div>
        ))}
      </div>

      <div className="my-3 border-t border-dotted border-black/50" />

      <div className="space-y-1">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span>{formatTZS(sale.subtotal)}</span>
        </div>
        {sale.discount > 0 && (
          <div className="flex justify-between">
            <span>Discount</span>
            <span>−{formatTZS(sale.discount)}</span>
          </div>
        )}
        <div className="mt-1 flex items-baseline justify-between text-base font-bold">
          <span>TOTAL</span>
          <span>{formatTZS(sale.total)}</span>
        </div>
      </div>

      <div className="my-3 border-t border-dotted border-black/50" />

      <div className="space-y-1">
        {sale.payments.map((payment) => (
          <div key={payment.id} className="flex justify-between">
            <span>
              {TENDER_LABELS[payment.tender] ?? payment.tender}
              {payment.reference ? ` (${payment.reference})` : ''}
            </span>
            <span>{formatTZS(payment.amount)}</span>
          </div>
        ))}
        {change > 0 && (
          <div className="flex justify-between font-semibold">
            <span>Change</span>
            <span>{formatTZS(change)}</span>
          </div>
        )}
      </div>

      <div className="my-3 border-t border-dotted border-black/50" />

      <p className="text-center font-semibold">
        {business?.receiptFooter ?? 'Asante kwa kununua! / Thank you for your purchase!'}
      </p>
    </div>
  );
}

export function ReceiptDialog({
  sale,
  business,
  onDone
}: {
  sale: Sale | null;
  business: Business | null;
  onDone: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!sale) return null;

  const whatsappPhone = normalizeWhatsAppPhone(sale.customerPhone);
  const businessName = business?.name ?? 'Caris Beauty and Cosmetics';

  const sendWhatsApp = () => {
    if (!whatsappPhone) return;
    const text = buildReceiptText(sale, business);
    const url = `https://wa.me/${whatsappPhone}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const printReceipt =
    mounted && typeof document !== 'undefined'
      ? createPortal(
          <div className="receipt-print-root hidden">
            <ReceiptBody sale={sale} business={business} businessName={businessName} />
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <Dialog
        open={Boolean(sale)}
        onOpenChange={(open) => {
          if (!open) onDone();
        }}
        title={t.pos.receipt}
        description="Share it, print it, or start the next sale."
        size="sm"
      >
        <div className="no-print mb-4 flex items-center gap-3 rounded-2xl bg-[#eef4ec] px-3 py-3 text-moss">
          <CheckCircle2 size={20} />
          <div>
            <p className="text-sm font-semibold">Sale completed</p>
            <p className="text-[11px] opacity-80">Saved locally and queued for sync.</p>
          </div>
        </div>

        <ReceiptBody
          sale={sale}
          business={business}
          businessName={businessName}
          className="max-h-[52vh] overflow-y-auto rounded-2xl border border-dashed border-line bg-white p-4"
        />

        <div className="no-print mt-4 grid gap-2 sm:grid-cols-3">
          <Button variant="outline" onClick={() => window.print()}>
            <Printer size={15} />
            Print
          </Button>
          <Button variant="outline" disabled={!whatsappPhone} onClick={sendWhatsApp}>
            <MessageCircle size={15} />
            WhatsApp
          </Button>
          <Button onClick={onDone}>{t.pos.newSale}</Button>
        </div>
        {!whatsappPhone && (
          <p className="no-print mt-2 text-center text-[10px] text-muted">
            Add a customer with a WhatsApp number to send this receipt.
          </p>
        )}
      </Dialog>

      {printReceipt}
    </>
  );
}
