import type { NutrientKey } from '@/lib/nutrition/units';
import type { PortionDef } from '@/lib/portions/resolve';

export type { PortionDef };

/** Nutrient amounts, each already in its canonical unit. */
export type NutrientVector = Partial<Record<NutrientKey, number>>;

export type MealSlot = 'early' | 'breakfast' | 'midMorning' | 'lunch' | 'evening' | 'dinner';

export const MEAL_SLOTS: readonly MealSlot[] = [
  'early',
  'breakfast',
  'midMorning',
  'lunch',
  'evening',
  'dinner',
] as const;

export const MEAL_SLOT_LABELS: Record<MealSlot, string> = {
  early: 'Early',
  breakfast: 'Breakfast',
  midMorning: 'Mid-morning',
  lunch: 'Lunch',
  evening: 'Evening',
  dinner: 'Dinner',
};

export interface Ingredient {
  id: string;
  name: string;
  /** Per 100 g, canonical units. */
  per100g: NutrientVector;
  densityGPerMl?: number;
  /** Provenance, required by spec §13 so licensing stays auditable. */
  source: 'usda-fdc' | 'authored';
  sourceRef?: string;
}

export type DishDerivation = 'authored' | 'recipe';

export interface Dish {
  id: string;
  name: string;
  ownerScope: 'seed' | 'user';
  derivation: DishDerivation;
  /**
   * Canonical nutrients per 100 g. When `derivation` is 'recipe' this is a
   * cache recomputed by recomputeDishNutrients(); when 'authored' it is the
   * source of truth.
   */
  per100g: NutrientVector;
  densityGPerMl?: number;
  /** PortionDef id used as the baseline for relative sizing. */
  defaultPortionId?: string;
  createdAt: number;
}

export interface RecipeItem {
  ingredientId: string;
  grams: number;
}

export interface Recipe {
  id: string;
  dishId: string;
  items: RecipeItem[];
  /** Total cooked mass the recipe yields, in grams. */
  yieldGrams: number;
  /** USDA-style nutrient retention for cooking losses. 1 = no loss. */
  retentionFactor: number;
}

export interface LogEntry {
  id: string;
  dishId: string;
  portionId: string;
  count: number;
  slot: MealSlot;
  /** Local calendar day, 'YYYY-MM-DD'. See src/lib/time/day.ts. */
  dayKey: string;
  loggedAt: number;
}

export interface BodyLog {
  id: string;
  dayKey: string;
  loggedAt: number;
  weightKg?: number;
  waistCm?: number;
  photo?: Blob;
}

export interface SettingRow {
  key: string;
  value: unknown;
}
