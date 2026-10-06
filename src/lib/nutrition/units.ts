export type NutrientUnit = 'kcal' | 'g' | 'mg' | 'ug';

export class UnitMismatchError extends Error {
  constructor(from: NutrientUnit, to: NutrientUnit) {
    super(`Cannot convert ${from} to ${to}: incompatible dimensions.`);
    this.name = 'UnitMismatchError';
  }
}

/** Grams per unit. Energy is dimensionless here and handled separately. */
const GRAMS_PER: Record<Exclude<NutrientUnit, 'kcal'>, number> = {
  g: 1,
  mg: 1e-3,
  ug: 1e-6,
};

function isMass(u: NutrientUnit): u is Exclude<NutrientUnit, 'kcal'> {
  return u !== 'kcal';
}

export function convert(value: number, from: NutrientUnit, to: NutrientUnit): number {
  if (from === to) return value;
  if (!isMass(from) || !isMass(to)) throw new UnitMismatchError(from, to);
  return (value * GRAMS_PER[from]) / GRAMS_PER[to];
}

/**
 * The canonical unit for each tracked nutrient. Every value entering the
 * system passes through toCanonical() before storage. Extend only on demand.
 */
export const NUTRIENTS = {
  energy: { unit: 'kcal', label: 'Energy' },
  protein: { unit: 'g', label: 'Protein' },
  fat: { unit: 'g', label: 'Fat' },
  carbs: { unit: 'g', label: 'Carbs' },
  fiber: { unit: 'g', label: 'Fibre' },
  sodium: { unit: 'mg', label: 'Sodium' },
  calcium: { unit: 'mg', label: 'Calcium' },
  iron: { unit: 'mg', label: 'Iron' },
  vitaminD: { unit: 'ug', label: 'Vitamin D' },
  vitaminB12: { unit: 'ug', label: 'Vitamin B12' },
} as const satisfies Record<string, { unit: NutrientUnit; label: string }>;

export type NutrientKey = keyof typeof NUTRIENTS;

export function toCanonical(
  key: NutrientKey,
  value: number,
  sourceUnit: NutrientUnit,
): number {
  return convert(value, sourceUnit, NUTRIENTS[key].unit);
}
