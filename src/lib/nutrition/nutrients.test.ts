import { describe, it, expect } from 'vitest';
import { addVectors, scaleVector, nutrientsForMass, ZERO_VECTOR } from './nutrients';

describe('addVectors', () => {
  it('sums shared keys', () => {
    expect(addVectors({ protein: 10 }, { protein: 5 })).toEqual({ protein: 15 });
  });

  it('keeps keys present in only one operand', () => {
    expect(addVectors({ protein: 10 }, { iron: 2 })).toEqual({ protein: 10, iron: 2 });
  });

  it('does not mutate its operands', () => {
    const a = { protein: 10 };
    addVectors(a, { protein: 5 });
    expect(a).toEqual({ protein: 10 });
  });

  it('treats the zero vector as an identity', () => {
    expect(addVectors({ protein: 10 }, ZERO_VECTOR)).toEqual({ protein: 10 });
  });
});

describe('scaleVector', () => {
  it('multiplies every value', () => {
    expect(scaleVector({ protein: 10, iron: 2 }, 0.5)).toEqual({ protein: 5, iron: 1 });
  });

  it('rejects a non-finite factor', () => {
    expect(() => scaleVector({ protein: 10 }, Number.NaN)).toThrow();
  });
});

describe('nutrientsForMass', () => {
  it('scales per-100g values to the given mass', () => {
    const result = nutrientsForMass({ protein: 20, energy: 150 }, 250);
    expect(result.protein).toBeCloseTo(50, 10);
    expect(result.energy).toBeCloseTo(375, 10);
  });

  it('returns zeros for zero mass', () => {
    expect(nutrientsForMass({ protein: 20 }, 0)).toEqual({ protein: 0 });
  });

  it('rejects negative mass', () => {
    expect(() => nutrientsForMass({ protein: 20 }, -1)).toThrow();
  });
});
