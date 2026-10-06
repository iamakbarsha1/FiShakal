export type PortionKind = 'metric' | 'vessel' | 'hand' | 'photo' | 'relative';

export interface PortionDef {
  id: string;
  dishId: string;
  kind: PortionKind;
  label: string;
  /** Resolved mass for every kind except `relative`, which uses `multiplier`. */
  grams: number;
  /** Required when `kind` is `relative`. */
  multiplier?: number;
  /** The user's own photo, attached in Part 3 Task 11 when `kind` is `photo`. */
  photo?: Blob;
}

export interface ResolveContext {
  /** The dish's baseline portion mass. Required for `relative` portions. */
  defaultPortionGrams?: number;
}

export class PortionResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PortionResolutionError';
  }
}

/**
 * The single point at which any portion becomes a mass in grams. Nothing
 * downstream knows which kind of portion produced the number.
 *
 * Log entries deliberately store a portion reference rather than this result,
 * so recalibrating a vessel corrects every past entry that used it.
 */
export function resolveGrams(
  portion: PortionDef,
  count: number,
  ctx: ResolveContext = {},
): number {
  if (!Number.isFinite(count) || count <= 0) {
    throw new PortionResolutionError(`Count must be a positive number, got ${count}.`);
  }

  if (portion.kind === 'relative') {
    const base = ctx.defaultPortionGrams;
    if (base === undefined) {
      throw new PortionResolutionError(
        `Portion "${portion.label}" is relative but dish ${portion.dishId} has no default portion. ` +
          'Set a baseline portion for this dish before logging a relative amount.',
      );
    }
    if (!Number.isFinite(base) || base <= 0) {
      throw new PortionResolutionError(`Dish ${portion.dishId} has an invalid default portion: ${base}.`);
    }
    if (portion.multiplier === undefined || !Number.isFinite(portion.multiplier) || portion.multiplier <= 0) {
      throw new PortionResolutionError(
        `Relative portion "${portion.label}" has no usable multiplier.`,
      );
    }
    return base * portion.multiplier * count;
  }

  if (!Number.isFinite(portion.grams) || portion.grams < 0) {
    throw new PortionResolutionError(
      `Portion "${portion.label}" has invalid mass: ${portion.grams}.`,
    );
  }
  return portion.grams * count;
}
