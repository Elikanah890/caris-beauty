'use client';

import { useEffect, useState } from 'react';
import { Minus, Plus, ShoppingBasket } from 'lucide-react';
import { Dialog } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input, Label, Select } from '../ui/input';
import { Badge } from '../ui/badge';
import { computeLine, defaultChoice, stockDisplay } from '@/lib/pricing';
import { formatQty, formatTZS } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useCartStore } from '@/store/cart-store';
import type { CatalogProduct } from '@/lib/hooks';

export function AddProductDialog({
  product,
  open,
  onOpenChange
}: {
  product: CatalogProduct | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const addLine = useCartStore((state) => state.addLine);
  const [choiceId, setChoiceId] = useState('');
  const [qty, setQty] = useState(1);
  const [stockError, setStockError] = useState<string | null>(null);

  useEffect(() => {
    if (!product) return;
    setChoiceId(defaultChoice(product.choices).unitId);
    setQty(1);
    setStockError(null);
  }, [product]);

  if (!product) return null;
  const choice =
    product.choices.find((entry) => entry.unitId === choiceId) ??
    defaultChoice(product.choices);
  const line = computeLine(product, choice, qty);
  const stockInUnit = stockDisplay(product.stockBase, choice);
  const maxQty = product.stockBase > 0 ? 1 : 0; // simplified: max 1 if any stock

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={product.name}
      description={product.categoryName ?? 'Add to current sale'}
      size="sm"
    >
      <div className="rounded-2xl bg-gradient-to-br from-brand-50 to-[#fff9f1] p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-brand-600 shadow-sm">
              <ShoppingBasket size={20} />
            </span>
            <div>
              <p className="text-xs text-muted">Price</p>
              <p className="numeric font-display text-2xl font-semibold text-ink">
                {formatTZS(choice.pricePerUnit)}
                <span className="ml-1 font-sans text-xs font-medium text-muted">/ {choice.unitSymbol}</span>
              </p>
            </div>
          </div>
          <Badge variant={product.stockBase > 0 ? 'success' : 'danger'}>
            {formatQty(stockInUnit)} {choice.unitSymbol} {product.stockBase > 0 ? 'left' : ''}
          </Badge>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="unit">Unit</Label>
          <Select id="unit" value={choice.unitId} onChange={(event) => setChoiceId(event.target.value)}>
            {product.choices.map((entry) => (
              <option key={entry.unitId} value={entry.unitId}>
                {entry.unitName} ({entry.unitSymbol})
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="qty">Quantity</Label>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setQty((value) => Math.max(0.001, Number((value - 1).toFixed(3))))}
              className="flex h-10 w-9 shrink-0 items-center justify-center rounded-xl border border-line bg-white text-muted transition hover:border-brand-300 hover:text-ink"
              aria-label="Decrease"
            >
              <Minus size={14} />
            </button>
            <Input
              id="qty"
              type="number"
              inputMode="decimal"
              min={0.001}
              step="any"
              value={qty}
              onChange={(event) => {
                const val = Math.max(0.001, Number(event.target.value) || 0.001);
                if (product.stockBase > 0 && val > product.stockBase) {
                  setStockError(`Only ${product.stockBase} available`);
                  setQty(val);
                } else {
                  setStockError(null);
                  setQty(val);
                }
              }}
              className="text-center"
            />
            <button
              type="button"
              onClick={() => setQty((value) => Number((value + 1).toFixed(3)))}
              className="flex h-10 w-9 shrink-0 items-center justify-center rounded-xl border border-line bg-white text-muted transition hover:border-brand-300 hover:text-ink"
              aria-label="Increase"
            >
              <Plus size={14} />
            </button>
          </div>
          {stockError && (
            <p className="mt-2 rounded-xl bg-[#fbecef] px-3 py-2 text-[11px] font-medium text-berry">
              {stockError}
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between rounded-2xl border border-line bg-white px-4 py-3">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted">Line total</p>
          <p className="numeric font-display text-xl font-semibold text-ink">{formatTZS(line.lineTotal)}</p>
        </div>
        <p className="text-[11px] text-muted">
          {formatQty(qty)} {choice.unitSymbol} · {line.qtyBase.toLocaleString('en-US')} base units
        </p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button
          className={cn(line.lineTotal <= 0 && 'opacity-50')}
          onClick={() => {
            addLine(product, choice, qty);
            onOpenChange(false);
          }}
        >
          <Plus size={15} />
          Add {formatTZS(line.lineTotal)}
        </Button>
      </div>
    </Dialog>
  );
}
