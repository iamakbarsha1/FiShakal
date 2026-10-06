import { describe, it, expect } from 'vitest';
import { dishNutrientsPer100g, computeRecipeNutrients, RecipeComputationError } from './dish';
import type { Dish, Recipe, Ingredient } from '@/lib/db/types';

const DAL: Ingredient = {
  id: 'i-dal', name: 'Toor dal, dry', source: 'usda-fdc',
  per100g: { energy: 343, protein: 22, fat: 1.5, carbs: 63, iron: 5.1 },
};
const OIL: Ingredient = {
  id: 'i-oil', name: 'Sunflower oil', source: 'usda-fdc',
  per100g: { energy: 884, protein: 0, fat: 100, carbs: 0 },
};
const INGREDIENTS = new Map([[DAL.id, DAL], [OIL.id, OIL]]);

function dish(over: Partial<Dish> = {}): Dish {
  return {
    id: 'd1', name: 'Sambar', ownerScope: 'seed', derivation: 'authored',
    per100g: { energy: 60, protein: 3 }, createdAt: 0, ...over,
  };
}

describe('dishNutrientsPer100g', () => {
  it('returns the authored vector unchanged for an authored dish', () => {
    expect(dishNutrientsPer100g(dish(), undefined, INGREDIENTS)).toEqual({ energy: 60, protein: 3 });
  });

  it('ignores a recipe when the dish is authored', () => {
    const r: Recipe = { id: 'r1', dishId: 'd1', items: [{ ingredientId: 'i-dal', grams: 100 }], yieldGrams: 500, retentionFactor: 1 };
    expect(dishNutrientsPer100g(dish(), r, INGREDIENTS)).toEqual({ energy: 60, protein: 3 });
  });

  it('computes from the recipe when the dish is recipe-derived', () => {
    // 100 g dal (22 g protein) yielding 500 g cooked = 4.4 g protein per 100 g.
    const r: Recipe = { id: 'r1', dishId: 'd1', items: [{ ingredientId: 'i-dal', grams: 100 }], yieldGrams: 500, retentionFactor: 1 };
    const result = dishNutrientsPer100g(dish({ derivation: 'recipe' }), r, INGREDIENTS);
    expect(result.protein).toBeCloseTo(4.4, 6);
    expect(result.energy).toBeCloseTo(68.6, 6);
  });

  it('sums multiple ingredients', () => {
    const r: Recipe = {
      id: 'r1', dishId: 'd1',
      items: [{ ingredientId: 'i-dal', grams: 100 }, { ingredientId: 'i-oil', grams: 10 }],
      yieldGrams: 500, retentionFactor: 1,
    };
    const result = dishNutrientsPer100g(dish({ derivation: 'recipe' }), r, INGREDIENTS);
    expect(result.fat).toBeCloseTo((1.5 + 10) / 5, 6);
  });

  it('applies the retention factor', () => {
    const r: Recipe = { id: 'r1', dishId: 'd1', items: [{ ingredientId: 'i-dal', grams: 100 }], yieldGrams: 500, retentionFactor: 0.9 };
    const result = dishNutrientsPer100g(dish({ derivation: 'recipe' }), r, INGREDIENTS);
    expect(result.protein).toBeCloseTo(4.4 * 0.9, 6);
  });

  it('throws when a recipe-derived dish has no recipe', () => {
    expect(() => dishNutrientsPer100g(dish({ derivation: 'recipe' }), undefined, INGREDIENTS))
      .toThrow(RecipeComputationError);
  });

  it('throws when the supplied recipe belongs to another dish', () => {
    const r: Recipe = { id: 'r1', dishId: 'other-dish', items: [{ ingredientId: 'i-dal', grams: 100 }], yieldGrams: 500, retentionFactor: 1 };
    expect(() => dishNutrientsPer100g(dish({ derivation: 'recipe' }), r, INGREDIENTS)).toThrow(RecipeComputationError);
  });
});

describe('computeRecipeNutrients', () => {
  it('throws on zero yield rather than dividing by zero', () => {
    const r: Recipe = { id: 'r1', dishId: 'd1', items: [{ ingredientId: 'i-dal', grams: 100 }], yieldGrams: 0, retentionFactor: 1 };
    expect(() => computeRecipeNutrients(r, INGREDIENTS)).toThrow(RecipeComputationError);
  });

  it('throws on an unknown ingredient rather than silently skipping it', () => {
    const r: Recipe = { id: 'r1', dishId: 'd1', items: [{ ingredientId: 'i-ghost', grams: 100 }], yieldGrams: 500, retentionFactor: 1 };
    expect(() => computeRecipeNutrients(r, INGREDIENTS)).toThrow(RecipeComputationError);
  });

  it('throws on an out-of-range retention factor', () => {
    const r: Recipe = { id: 'r1', dishId: 'd1', items: [{ ingredientId: 'i-dal', grams: 100 }], yieldGrams: 500, retentionFactor: 1.5 };
    expect(() => computeRecipeNutrients(r, INGREDIENTS)).toThrow(RecipeComputationError);
  });

  it('throws on an empty ingredient list', () => {
    const r: Recipe = { id: 'r1', dishId: 'd1', items: [], yieldGrams: 500, retentionFactor: 1 };
    expect(() => computeRecipeNutrients(r, INGREDIENTS)).toThrow(RecipeComputationError);
  });

  it('throws on an ingredient with a NaN nutrient value', () => {
    const bad: Ingredient = { id: 'i-bad', name: 'Corrupt', source: 'authored', per100g: { protein: Number.NaN } };
    const r: Recipe = { id: 'r1', dishId: 'd1', items: [{ ingredientId: 'i-bad', grams: 100 }], yieldGrams: 500, retentionFactor: 1 };
    expect(() => computeRecipeNutrients(r, new Map([[bad.id, bad]]))).toThrow(RecipeComputationError);
  });

  it('throws on an ingredient with an infinite nutrient value', () => {
    const bad: Ingredient = { id: 'i-bad', name: 'Corrupt', source: 'authored', per100g: { energy: Number.POSITIVE_INFINITY } };
    const r: Recipe = { id: 'r1', dishId: 'd1', items: [{ ingredientId: 'i-bad', grams: 100 }], yieldGrams: 500, retentionFactor: 1 };
    expect(() => computeRecipeNutrients(r, new Map([[bad.id, bad]]))).toThrow(RecipeComputationError);
  });
});
