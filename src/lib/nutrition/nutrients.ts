import type { NutrientKey } from './units';
import type { NutrientVector } from '@/lib/db/types';
import { FiShakalError } from '@/lib/errors';

/** Guards the two quantities every vector operation scales by: a scale factor, a mass. */
export class InvalidQuantityError extends FiShakalError {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidQuantityError';
  }
}

export const ZERO_VECTOR: NutrientVector = Object.freeze({});

export function addVectors(a: NutrientVector, b: NutrientVector): NutrientVector {
  const out: NutrientVector = { ...a };
  for (const [key, value] of Object.entries(b) as [NutrientKey, number][]) {
    out[key] = (out[key] ?? 0) + value;
  }
  return out;
}

export function scaleVector(v: NutrientVector, factor: number): NutrientVector {
  if (!Number.isFinite(factor)) {
    throw new InvalidQuantityError(`Scale factor must be finite, got ${factor}.`);
  }
  const out: NutrientVector = {};
  for (const [key, value] of Object.entries(v) as [NutrientKey, number][]) {
    out[key] = value * factor;
  }
  return out;
}

/** Scale a per-100g vector to an arbitrary mass in grams. */
export function nutrientsForMass(per100g: NutrientVector, grams: number): NutrientVector {
  if (!Number.isFinite(grams) || grams < 0) {
    throw new InvalidQuantityError(`Mass must be a non-negative finite number, got ${grams}.`);
  }
  return scaleVector(per100g, grams / 100);
}
