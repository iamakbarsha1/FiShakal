import { DEFAULT_DENSITY_G_PER_ML, type VesselName } from './constants';
import { FiShakalError } from '@/lib/errors';

export type PortionKind = 'metric' | 'vessel' | 'hand' | 'photo' | 'relative';

export interface PortionDef {
  id: string;
  dishId: string;
  kind: PortionKind;
  label: string;
  /**
   * Which household vessel this portion represents, when `kind` is 'vessel'.
   * Without it, recalibrating a vessel in settings cannot find the portions
   * that used it, and spec line 129's promise that recalibration corrects
   * history cannot be kept.
   */
  vesselKey?: VesselName;
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
  /**
   * The user's current calibrated volume for this portion's vessel, in ml.
   * When supplied together with the portion's `vesselKey`, the mass is
   * recomputed from it rather than read from the stored `grams`. This is
   * what makes recalibration correct history: nothing is rewritten, every
   * past entry simply resolves against the current value.
   */
  vesselMl?: number;
  /** The dish's density. Defaults to DEFAULT_DENSITY_G_PER_ML. */
  densityGPerMl?: number;
}

export class PortionResolutionError extends FiShakalError {
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

  const validKinds: PortionKind[] = ['metric', 'vessel', 'hand', 'photo', 'relative'];
  if (!validKinds.includes(portion.kind)) {
    throw new PortionResolutionError(
      `Portion kind "${portion.kind}" is not recognized. Expected one of: ${validKinds.join(', ')}.`,
    );
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

  if (portion.kind === 'vessel' && portion.vesselKey !== undefined && ctx.vesselMl !== undefined) {
    if (!Number.isFinite(ctx.vesselMl) || ctx.vesselMl <= 0) {
      throw new PortionResolutionError(
        `Calibrated volume for vessel "${portion.vesselKey}" is invalid: ${ctx.vesselMl}.`,
      );
    }
    const density = ctx.densityGPerMl ?? DEFAULT_DENSITY_G_PER_ML;
    if (!Number.isFinite(density) || density <= 0) {
      throw new PortionResolutionError(
        `Density for portion "${portion.label}" is invalid: ${density}.`,
      );
    }
    return ctx.vesselMl * density * count;
  }

  if (!Number.isFinite(portion.grams) || portion.grams < 0) {
    throw new PortionResolutionError(
      `Portion "${portion.label}" has invalid mass: ${portion.grams}.`,
    );
  }
  return portion.grams * count;
}
