import type { Dish, Recipe, Ingredient, NutrientVector } from '@/lib/db/types';
import { FiShakalError } from '@/lib/errors';
import { addVectors, nutrientsForMass, scaleVector, ZERO_VECTOR } from './nutrients';

export class RecipeComputationError extends FiShakalError {
  constructor(message: string) {
    super(message);
    this.name = 'RecipeComputationError';
  }
}

/**
 * Both the authored-dish path and the recipe path read nutrient values from
 * the same untrusted boundary: IndexedDB and user JSON imports. A NaN or
 * Infinity here must throw, not propagate — otherwise it silently becomes
 * NaN for that nutrient across an entire day's totals, unreported.
 */
function assertFiniteVector(vector: NutrientVector, label: string): void {
  for (const [key, value] of Object.entries(vector)) {
    if (!Number.isFinite(value)) {
      throw new RecipeComputationError(`${label} has a non-finite value for ${key}: ${value}.`);
    }
  }
}

/**
 * Nutrients per 100 g of the cooked dish a recipe yields.
 *
 * Unknown ingredients throw rather than being skipped: a silently dropped
 * ingredient under-reports the dish while leaving the result plausible.
 */
export function computeRecipeNutrients(
  recipe: Recipe,
  ingredientsById: Map<string, Ingredient>,
): NutrientVector {
  if (recipe.items.length === 0) {
    throw new RecipeComputationError(`Recipe ${recipe.id} has no ingredients.`);
  }
  if (!Number.isFinite(recipe.yieldGrams) || recipe.yieldGrams <= 0) {
    throw new RecipeComputationError(
      `Recipe ${recipe.id} has invalid yield: ${recipe.yieldGrams}. Yield must be positive.`,
    );
  }
  if (!Number.isFinite(recipe.retentionFactor) || recipe.retentionFactor <= 0 || recipe.retentionFactor > 1) {
    throw new RecipeComputationError(
      `Recipe ${recipe.id} has retention factor ${recipe.retentionFactor}; expected a value in (0, 1].`,
    );
  }

  let total: NutrientVector = ZERO_VECTOR;
  for (const item of recipe.items) {
    const ingredient = ingredientsById.get(item.ingredientId);
    if (!ingredient) {
      throw new RecipeComputationError(
        `Recipe ${recipe.id} references unknown ingredient ${item.ingredientId}.`,
      );
    }
    if (!Number.isFinite(item.grams) || item.grams < 0) {
      throw new RecipeComputationError(
        `Recipe ${recipe.id} has invalid mass for ${item.ingredientId}: ${item.grams}.`,
      );
    }
    assertFiniteVector(ingredient.per100g, `Ingredient ${ingredient.id}`);
    total = addVectors(total, nutrientsForMass(ingredient.per100g, item.grams));
  }

  const per100g = scaleVector(total, 100 / recipe.yieldGrams);
  return scaleVector(per100g, recipe.retentionFactor);
}

/**
 * The dish's canonical per-100g vector. Authored dishes are the source of
 * truth for their own numbers; recipe-derived dishes are computed.
 */
export function dishNutrientsPer100g(
  dish: Dish,
  recipe: Recipe | undefined,
  ingredientsById: Map<string, Ingredient>,
): NutrientVector {
  if (dish.derivation === 'authored') {
    assertFiniteVector(dish.per100g, `Dish ${dish.id}`);
    return { ...dish.per100g };
  }
  if (!recipe) {
    throw new RecipeComputationError(
      `Dish ${dish.id} is recipe-derived but no recipe was supplied.`,
    );
  }
  if (recipe.dishId !== dish.id) {
    throw new RecipeComputationError(
      `Recipe ${recipe.id} belongs to dish ${recipe.dishId}, not ${dish.id}.`,
    );
  }
  return computeRecipeNutrients(recipe, ingredientsById);
}
