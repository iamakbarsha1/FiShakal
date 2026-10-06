/**
 * Relative sizing anchors to the dish's own default portion rather than to
 * any absolute unit. These are estimates, not measurements. Tune here only.
 */
export const RELATIVE_MULTIPLIERS = {
  less: 0.7,
  usual: 1.0,
  more: 1.4,
} as const;

export type RelativeLabel = keyof typeof RELATIVE_MULTIPLIERS;

/**
 * Seeded household vessel volumes in millilitres. The user calibrates these
 * once in settings; grams are computed at portion-creation time using the
 * dish or ingredient density and then stored on the PortionDef.
 */
export const VESSEL_DEFAULT_ML = {
  katori: 150,
  ladle: 60,
  tumbler: 200,
  cup: 240,
  plate: 400,
} as const;

/**
 * Seeded hand-unit masses in grams. These scale with the user's own hand,
 * which is the point: no calibration step, no props.
 */
export const HAND_DEFAULT_GRAMS = {
  fist: 150,
  palm: 100,
  cuppedHand: 40,
  thumb: 12,
} as const;

/** Fallback density when an ingredient declares none. Water, near enough. */
export const DEFAULT_DENSITY_G_PER_ML = 1.0;
