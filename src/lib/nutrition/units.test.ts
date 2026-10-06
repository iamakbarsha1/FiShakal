import { describe, it, expect } from 'vitest';
import { convert, toCanonical, NUTRIENTS, UnitMismatchError } from './units';

describe('convert', () => {
  it('converts milligrams to grams', () => {
    expect(convert(2500, 'mg', 'g')).toBeCloseTo(2.5, 10);
  });

  it('converts micrograms to milligrams', () => {
    expect(convert(1500, 'ug', 'mg')).toBeCloseTo(1.5, 10);
  });

  it('is identity for the same unit', () => {
    expect(convert(7.25, 'g', 'g')).toBe(7.25);
  });

  it('refuses to convert energy to mass', () => {
    expect(() => convert(100, 'kcal', 'g')).toThrow(UnitMismatchError);
  });

  it('refuses to convert mass to energy', () => {
    expect(() => convert(100, 'g', 'kcal')).toThrow(UnitMismatchError);
  });
});

describe('toCanonical', () => {
  it('keeps a value already in the canonical unit unchanged', () => {
    expect(toCanonical('iron', 2.5, 'mg')).toBeCloseTo(2.5, 10);
  });

  it('scales grams up into the canonical milligram unit', () => {
    expect(toCanonical('iron', 0.0025, 'g')).toBeCloseTo(2.5, 10);
  });

  // Review Focus 1: the OpenNutriTracker bug.
  // A vitamin D value supplied in milligrams must not pass through as if
  // it were already micrograms, which would under-report it 1000-fold.
  it('scales milligrams into the canonical microgram unit', () => {
    expect(toCanonical('vitaminD', 0.015, 'mg')).toBeCloseTo(15, 10);
  });

  it('does not silently pass a mismatched unit through', () => {
    const raw = 0.015;
    const canonical = toCanonical('vitaminD', raw, 'mg');
    expect(canonical).not.toBe(raw);
  });

  it('refuses a mass unit for an energy nutrient', () => {
    expect(() => toCanonical('energy', 100, 'g')).toThrow(UnitMismatchError);
  });

  it('declares a canonical unit for every nutrient', () => {
    for (const [key, def] of Object.entries(NUTRIENTS)) {
      expect(def.unit, `${key} has no unit`).toBeDefined();
    }
  });
});
