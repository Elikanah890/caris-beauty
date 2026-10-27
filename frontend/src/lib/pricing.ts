import type { Product, ProductUnit, Unit, UnitChoice } from './types';

export function roundTZS(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.sign(value) * Math.round(Math.abs(value));
}

export function toQtyBase(qty: number, factor: number): number {
  if (!Number.isFinite(qty) || !Number.isFinite(factor) || factor <= 0) return 0;
  return Math.sign(qty) * Math.round(Math.abs(qty) * factor);
}

export function unitChoices(
  product: Product,
  conversions: ProductUnit[],
  units: Unit[]
): UnitChoice[] {
  const byId = new Map(units.map((u) => [u.id, u]));
  const base = byId.get(product.baseUnitId);
  const list: UnitChoice[] = [
    {
      unitId: product.baseUnitId,
      unitName: base?.name ?? product.baseUnitName ?? 'piece',
      unitSymbol: base?.symbol ?? product.baseUnitSymbol ?? 'pc',
      factor: 1,
      pricePerUnit: Math.round(product.pricePerBase),
      isBase: true
    }
  ];

  for (const conversion of conversions) {
    if (conversion.unitId === product.baseUnitId) continue;
    const unit = byId.get(conversion.unitId);
    if (!unit) continue;
    list.push({
      unitId: conversion.unitId,
      unitName: unit.name,
      unitSymbol: unit.symbol,
      factor: Number(conversion.factor),
      pricePerUnit:
        conversion.priceOverride !== null && conversion.priceOverride !== undefined
          ? Math.round(Number(conversion.priceOverride))
          : Math.round(product.pricePerBase * Number(conversion.factor)),
      isBase: false
    });
  }
  return list;
}

export function defaultChoice(choices: UnitChoice[]): UnitChoice {
  const base = choices.find((choice) => choice.isBase) ?? choices[0];
  if (!base) throw new Error('A product needs at least one unit');
  if (base.unitName === 'piece' || !base.isBase) return base;
  if (base.unitName === 'gram') {
    const kilogram = choices.find((choice) => choice.unitName === 'kilogram');
    if (kilogram) return kilogram;
  }
  if (base.unitName === 'millilitre') {
    const litre = choices.find((choice) => choice.unitName === 'litre');
    if (litre) return litre;
  }
  const conversions = choices.filter((choice) => !choice.isBase);
  if (conversions.length > 0) {
    return conversions.reduce((best, choice) =>
      choice.factor > best.factor ? choice : best
    );
  }
  return base;
}

export function stockDisplay(stockBase: number, choice: UnitChoice): number {
  return choice.factor > 0 ? stockBase / choice.factor : stockBase;
}

export function computeLine(
  product: Product,
  choice: UnitChoice,
  qty: number
): {
  qtyBase: number;
  factor: number;
  pricePerUnit: number;
  lineTotal: number;
  costPerBase: number;
  profit: number;
} {
  const qtyBase = toQtyBase(qty, choice.factor);
  const lineTotal = roundTZS(qty * choice.pricePerUnit);
  const costPerBase = Number(product.costPerBase);
  return {
    qtyBase,
    factor: choice.factor,
    pricePerUnit: choice.pricePerUnit,
    lineTotal,
    costPerBase,
    profit: lineTotal - qtyBase * costPerBase
  };
}

export function stockBaseFor(
  movements: Array<{ productId: string; qtyBase: number }>,
  productId: string
): number {
  return movements.reduce(
    (sum, movement) => (movement.productId === productId ? sum + Number(movement.qtyBase) : sum),
    0
  );
}

export function stockByUnit(stockBase: number, choice: UnitChoice): number {
  if (choice.factor <= 0) return 0;
  return stockBase / choice.factor;
}
