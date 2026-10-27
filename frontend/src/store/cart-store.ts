'use client';

import { create } from 'zustand';
import type { Product, UnitChoice } from '@/lib/types';
import { roundTZS } from '@/lib/pricing';

export interface CartLine {
  key: string;
  product: Product;
  choice: UnitChoice;
  qty: number;
  qtyBase: number;
  lineTotal: number;
  cost: number;
}

interface CartState {
  lines: CartLine[];
  customerId: string | null;
  discount: number;
  addLine: (product: Product, choice: UnitChoice, qty: number) => void;
  updateQty: (key: string, qty: number) => void;
  removeLine: (key: string) => void;
  setCustomer: (customerId: string | null) => void;
  setDiscount: (discount: number) => void;
  clear: () => void;
}

function buildLine(product: Product, choice: UnitChoice, qty: number): CartLine {
  const qtyBase = Math.round(qty * choice.factor);
  return {
    key: `${product.id}:${choice.unitId}`,
    product,
    choice,
    qty,
    qtyBase,
    lineTotal: roundTZS(qty * choice.pricePerUnit),
    cost: qtyBase * Number(product.costPerBase)
  };
}

function hasSessionStorage() {
  return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined';
}

function persistCart(lines: CartLine[]) {
  if (!hasSessionStorage()) return;
  try {
    const serialized = JSON.stringify(lines);
    sessionStorage.setItem('cart_lines', serialized);
  } catch (_) {}
}

function loadCartLines(): CartLine[] {
  if (!hasSessionStorage()) return [];
  try {
    const serialized = sessionStorage.getItem('cart_lines');
    if (!serialized) return [];
    const parsed = JSON.parse(serialized);
    return parsed.map((l: any) => ({
      ...l,
      lineTotal: roundTZS(l.qty * l.choice.pricePerUnit),
      cost: l.cost
    }) as CartLine);
  } catch (_) {
    return [];
  }
}

export const useCartStore = create<CartState>((set, get) => ({
  lines: loadCartLines(),
  customerId: hasSessionStorage() ? sessionStorage.getItem('cart_customer') ?? null : null,
  discount: hasSessionStorage() ? Number(sessionStorage.getItem('cart_discount')) || 0 : 0,
  addLine: (product, choice, qty) => {
    const existing = get().lines.find(
      (line) => line.product.id === product.id && line.choice.unitId === choice.unitId
    );
    if (existing) {
      const nextQty = existing.qty + qty;
      set((state) => ({
        lines: state.lines.map((line) =>
          line.key === existing.key ? buildLine(product, choice, nextQty) : line
        )
      }));
      persistCart(get().lines);
      return;
    }
    set((state) => ({ lines: [...state.lines, buildLine(product, choice, qty)] }));
    persistCart(get().lines);
  },
  updateQty: (key, qty) =>
    set((state) => ({
      lines:
        qty <= 0
          ? state.lines.filter((line) => line.key !== key)
          : state.lines.map((line) =>
              line.key === key ? buildLine(line.product, line.choice, qty) : line
            )
    })),
  removeLine: (key) =>
    set((state) => {
      const newLines = state.lines.filter((line) => line.key !== key);
      persistCart(newLines);
      return { lines: newLines };
    }),
  setCustomer: (customerId) => {
    set({ customerId });
    if (!hasSessionStorage()) return;
    try {
      if (customerId) sessionStorage.setItem('cart_customer', customerId);
      else sessionStorage.removeItem('cart_customer');
    } catch (_) {}
  },
  setDiscount: (discount) => {
    const rounded = Math.max(0, Math.round(discount));
    set({ discount: rounded });
    if (!hasSessionStorage()) return;
    try { sessionStorage.setItem('cart_discount', String(rounded)); } catch (_) {}
  },
  clear: () => {
    set({ lines: [], customerId: null, discount: 0 });
    if (!hasSessionStorage()) return;
    try { sessionStorage.removeItem('cart_lines'); sessionStorage.removeItem('cart_customer'); sessionStorage.removeItem('cart_discount'); } catch (_) {}
  }
}));

export function cartTotals(lines: CartLine[], discount: number) {
  const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
  const cappedDiscount = Math.min(Math.max(0, discount), subtotal);
  return {
    subtotal,
    discount: cappedDiscount,
    total: subtotal - cappedDiscount,
    itemCount: lines.reduce((sum, line) => sum + line.qty, 0)
  };
}
