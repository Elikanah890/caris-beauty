import { describe, expect, it } from 'vitest';
import { computeLine, roundTZS, toQtyBase, unitChoices } from './pricing';
import type { Product, ProductUnit, Unit } from './types';

const units: Unit[] = [
  { id: 'gram', name: 'gram', symbol: 'g', isBase: true },
  { id: 'kilogram', name: 'kilogram', symbol: 'kg', isBase: false }
];

const product: Product = {
  id: 'p1',
  name: 'Sugar',
  baseUnitId: 'gram',
  costPerBase: 2,
  pricePerBase: 3,
  reorderLevelBase: 0,
  isActive: true
};

const conversions: ProductUnit[] = [
  {
    id: 'pu1',
    productId: 'p1',
    unitId: 'kilogram',
    factor: 1000,
    priceOverride: 2500
  }
];

describe('pricing parity', () => {
  it('uses override price for a selling unit', () => {
    const choices = unitChoices(product, conversions, units);
    const kg = choices.find((choice) => choice.unitId === 'kilogram');
    expect(kg?.pricePerUnit).toBe(2500);
    expect(kg?.factor).toBe(1000);
  });

  it('computes qty base, line total and profit exactly like the server', () => {
    const choices = unitChoices(product, conversions, units);
    const kg = choices.find((choice) => choice.unitId === 'kilogram');
    const line = computeLine(product, kg!, 2.5);
    expect(line.qtyBase).toBe(2500);
    expect(line.lineTotal).toBe(6250);
    expect(line.profit).toBe(1250);
  });

  it('rounds half up at the line only', () => {
    expect(roundTZS(1249.5)).toBe(1250);
    expect(roundTZS(1249.4)).toBe(1249);
    expect(toQtyBase(0.333, 1000)).toBe(333);
  });
});
