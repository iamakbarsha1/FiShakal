# FiShakal v1 Log Surface Implementation Plan: Part 1 of 3

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Part 1 of 3.** Foundation: scaffold, nutrient units, portion resolution, database, dish nutrient computation.
Continues in `2026-10-06-fishakal-v1-log-PART2.md` (seed data, aggregation, log UI) and `2026-10-06-fishakal-v1-log-PART3.md` (photo portions, body log, export/import, PWA, settings).

**Goal:** Ship an offline, installable nutrition tracker where logging a meal takes three taps and under five seconds, with no account and no server.

**Architecture:** A Next.js 15 static export backed entirely by IndexedDB through Dexie. All nutrition logic is pure TypeScript with no React or Next imports, so it is unit-testable in isolation. Portion input of five different kinds (metric, vessel, hand, photo, relative) resolves to grams through a single function; nothing downstream knows which kind was used. Log entries store a portion reference rather than computed grams, so recalibrating a vessel retroactively corrects history.

**Tech Stack:** Next.js 16 (App Router, static export; 15 is the floor), React 19, TypeScript 5, Tailwind CSS v4, Dexie 4 (IndexedDB), Vitest 3 (unit tests), `@vitest/coverage-v8`.

**Spec:** `docs/superpowers/specs/2026-10-06-fishakal-design.md`

---

## Global Constraints

These apply to every task in all three parts.

- **Node 20+**, package manager `npm`. Lockfile is committed.
- **Next.js 15 or later, App Router, with `output: 'export'`.** Task 1 installed 16.3.8, which `create-next-app@latest` now ships; Turbopack is its default builder. `output: 'export'` is unaffected and the build writes `out/`. No server components doing data access, no route handlers, no server actions. Any code touching the database is client-side.
- **TypeScript `strict: true`.** No `any` in committed code. No non-null assertions (`!`) except in Dexie table declarations, which require them.
- **No new runtime dependency** may be added beyond those named in Tech Stack without the dependency being justified in the task that adds it.
- **All nutrition and portion logic lives under `src/lib/` and imports nothing from `react`, `next`, or `dexie`.** Database access is confined to `src/lib/db/`. This boundary is what makes the logic testable and is enforced by Task 1's lint rule.
- **Canonical nutrient units are fixed at the storage layer.** Every value entering the system passes through `toCanonical()`. Writing a raw number into a nutrient field is a defect.
- **No AI or assistant attribution in commit messages.** No `Co-Authored-By` trailers.
- **Commit after every task**, using the message given in that task's final step.
- **Licensing, from spec §13:** no code may be copied from `DuarteSantos8/openGym` (AGPL-3.0), `alexpcosta/opengym` (AGPL-3.0), `simonoppowa/OpenNutriTracker` (GPL-3.0), or `ifct2017/ifct2017` (AGPL-3.0). Open Food Facts data must not be ingested or stored. Permitted sources are USDA FoodData Central (CC0) and hand-authored data.
- **Performance budget, from spec §11:** three taps and under five seconds from cold start to a logged meal. Any change that regresses this is a defect.

---

## Review Focus

Five failure modes the spec implies that no task's happy path exercises. Each is pinned to a test in the task that owns the code.

1. **A nutrient quantity in milligrams or micrograms is read as grams.** Vitamin D stored as `0.015 mg` must become `15 µg`, not `0.015`. OpenNutriTracker shipped this bug and users' micronutrient totals silently read near zero while the app appeared to work. Pinned in Task 2.
2. **A relative portion resolves against a dish with no default portion set.** "One usual serving" of a dish that has never had a baseline must fail loudly, not silently produce zero or `NaN` and quietly under-count the day. Pinned in Task 3.
3. **A meal logged after midnight local time lands on the wrong day.** Totals are per calendar day in the user's timezone; a UTC-based day boundary puts a 00:30 dinner on tomorrow's sheet and makes both days wrong. Pinned in Task 7 (Part 2).
4. **A log entry references a dish or portion that was later deleted.** Reading history must skip or surface the dangling entry rather than throwing and taking down the whole day view. Pinned in Task 7 (Part 2).
5. **An import file comes from a different schema version.** Importing must refuse and leave existing data untouched rather than partially applying and corrupting the database. Pinned in Task 13 (Part 3).

---

## File Structure

```
src/
  lib/
    nutrition/
      units.ts          canonical units, conversion, toCanonical()
      units.test.ts
      nutrients.ts      NutrientVector type, add/scale/zero
      nutrients.test.ts
      dish.ts           dish nutrients per 100g, authored or recipe-derived
      dish.test.ts
      totals.ts         aggregate log entries into daily totals (Part 2)
      totals.test.ts
    portions/
      constants.ts      relative multipliers, vessel volumes, hand sizes
      resolve.ts        resolveGrams(): the single resolver
      resolve.test.ts
    db/
      types.ts          entity interfaces, shared with lib (no Dexie import)
      schema.ts         Dexie subclass and version(1) stores
      repo.ts           typed read/write helpers over the tables
      seed.ts           idempotent seeding (Part 2)
    time/
      day.ts            local calendar day helpers (Part 2)
      day.test.ts
  app/
    layout.tsx
    page.tsx            today screen (Part 2)
    globals.css
  components/           (Part 2 and Part 3)
```

Nutrition and portion logic are split from the database because they are pure and the database is not. `types.ts` is deliberately Dexie-free so pure modules can import entity shapes without pulling IndexedDB into the test environment.

---

## Task 1: Project scaffold and test harness

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`, `eslint.config.mjs`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`, `postcss.config.mjs`
- Create: `src/lib/smoke.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: a working `npm test`, `npm run build`, and `npm run lint`. Every later task depends on these three commands existing and passing.

- [ ] **Step 1: Scaffold the Next.js app**

Run from the repo root. The repo already contains `.gitignore`, `PLAN.md`, `FOOD.md`, `WEEK.md`, `NEXT_STEPS_APP.md` and `docs/`, so scaffold in place rather than into a subdirectory.

```bash
npx --yes create-next-app@latest . \
  --typescript --tailwind --eslint --app --src-dir \
  --import-alias "@/*" --no-turbopack --use-npm --yes
```

If the tool refuses because the directory is not empty, answer its prompt to proceed; it preserves unrelated files.

- [ ] **Step 2: Configure static export**

Replace `next.config.ts` with:

```typescript
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'export',
  images: { unoptimized: true },
  reactStrictMode: true,
};

export default nextConfig;
```

`images.unoptimized` is required: the Next image optimizer needs a server, and there is none.

- [ ] **Step 3: Install test and database dependencies**

```bash
npm install dexie@^4
npm install --save-dev vitest@^3 @vitest/coverage-v8@^3 fake-indexeddb@^6
```

`fake-indexeddb` is a dev dependency only; it provides an in-memory IndexedDB so database tests run in Node without a browser.

- [ ] **Step 4: Configure Vitest**

Create `vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: { provider: 'v8', include: ['src/lib/**'] },
  },
  resolve: {
    alias: { '@': resolve(__dirname, './src') },
  },
});
```

The `@` alias must match the `paths` entry in `tsconfig.json` that `create-next-app` generated. Open `tsconfig.json` and confirm it contains `"paths": { "@/*": ["./src/*"] }`. If it does not, add it.

- [ ] **Step 5: Add the test script**

In `package.json`, add to `"scripts"`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 6: Add the layer-boundary lint rule**

This enforces the Global Constraint that `src/lib/` stays free of React, Next and (outside `db/`) Dexie. Append to the config array in `eslint.config.mjs`:

```javascript
  {
    files: ['src/lib/**/*.ts'],
    ignores: ['src/lib/db/**'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [
          { name: 'react', message: 'src/lib must stay framework-free.' },
          { name: 'dexie', message: 'Database access belongs in src/lib/db.' },
        ],
        patterns: [
          { group: ['next', 'next/*'], message: 'src/lib must stay framework-free.' },
        ],
      }],
    },
  },
```

- [ ] **Step 7: Write the smoke test**

Create `src/lib/smoke.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';

describe('test harness', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 8: Verify all three commands pass**

```bash
npm test
npm run lint
npm run build
```

Expected: tests pass, lint reports no errors, and the build writes a static export to `out/`.

If `npm run build` fails on the default `src/app/page.tsx` generated by `create-next-app`, replace its body with a single `<main>Hello</main>` and rebuild. The real screen arrives in Part 2.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js static export with Vitest and layer lint rule"
```

---

## Task 2: Canonical nutrient units

This task owns Review Focus item 1.

**Files:**
- Create: `src/lib/nutrition/units.ts`
- Test: `src/lib/nutrition/units.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type NutrientUnit = 'kcal' | 'g' | 'mg' | 'ug'`
  - `type NutrientKey` (the keys of `NUTRIENTS`)
  - `const NUTRIENTS: Record<NutrientKey, { unit: NutrientUnit; label: string }>`
  - `function convert(value: number, from: NutrientUnit, to: NutrientUnit): number`
  - `function toCanonical(key: NutrientKey, value: number, sourceUnit: NutrientUnit): number`
  - `class UnitMismatchError extends Error`

- [ ] **Step 1: Write the failing test**

Create `src/lib/nutrition/units.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/lib/nutrition/units.test.ts
```

Expected: FAIL, cannot resolve `./units`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/nutrition/units.ts`:

```typescript
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
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/lib/nutrition/units.test.ts
```

Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/nutrition/units.ts src/lib/nutrition/units.test.ts
git commit -m "feat: canonical nutrient units with mismatch guard

Every nutrient value entering the system passes through toCanonical().
convert() throws rather than coercing between energy and mass.

Covers the failure mode where a milligram or microgram quantity is read
as grams, which silently under-reports micronutrients by three orders of
magnitude while the application continues to appear functional."
```

---

## Task 3: Portion resolution

This task owns Review Focus item 2.

**Files:**
- Create: `src/lib/portions/constants.ts`, `src/lib/portions/resolve.ts`
- Test: `src/lib/portions/resolve.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type PortionKind = 'metric' | 'vessel' | 'hand' | 'photo' | 'relative'`
  - `interface PortionDef { id: string; dishId: string; kind: PortionKind; label: string; grams: number; multiplier?: number; photo?: Blob }`
  - `interface ResolveContext { defaultPortionGrams?: number }`
  - `function resolveGrams(portion: PortionDef, count: number, ctx?: ResolveContext): number`
  - `class PortionResolutionError extends Error`
  - `const RELATIVE_MULTIPLIERS`, `VESSEL_DEFAULT_ML`, `HAND_DEFAULT_GRAMS`

- [ ] **Step 1: Write the failing test**

Create `src/lib/portions/resolve.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { resolveGrams, PortionResolutionError, type PortionDef } from './resolve';
import { RELATIVE_MULTIPLIERS } from './constants';

function portion(over: Partial<PortionDef>): PortionDef {
  return { id: 'p1', dishId: 'd1', kind: 'metric', label: '100 g', grams: 100, ...over };
}

describe('resolveGrams', () => {
  it('returns stored grams for a metric portion', () => {
    expect(resolveGrams(portion({ kind: 'metric', grams: 120 }), 1)).toBe(120);
  });

  it('multiplies by count', () => {
    expect(resolveGrams(portion({ kind: 'metric', grams: 120 }), 2)).toBe(240);
  });

  it('resolves a vessel portion from its stored grams', () => {
    const p = portion({ kind: 'vessel', label: '1 katori', grams: 150 });
    expect(resolveGrams(p, 1)).toBe(150);
  });

  it('resolves a hand portion from its stored grams', () => {
    const p = portion({ kind: 'hand', label: '1 palm', grams: 100 });
    expect(resolveGrams(p, 1)).toBe(100);
  });

  it('resolves a photo portion from its stored grams', () => {
    const p = portion({ kind: 'photo', label: 'my usual', grams: 180 });
    expect(resolveGrams(p, 1)).toBe(180);
  });

  it('resolves a relative portion against the dish default', () => {
    const p = portion({ kind: 'relative', label: 'more', grams: 0, multiplier: RELATIVE_MULTIPLIERS.more });
    expect(resolveGrams(p, 1, { defaultPortionGrams: 100 })).toBeCloseTo(140, 10);
  });

  it('treats a usual relative portion as the default itself', () => {
    const p = portion({ kind: 'relative', label: 'usual', grams: 0, multiplier: RELATIVE_MULTIPLIERS.usual });
    expect(resolveGrams(p, 1, { defaultPortionGrams: 175 })).toBeCloseTo(175, 10);
  });

  // Review Focus 2: a relative portion with no baseline must fail loudly.
  it('throws when a relative portion has no dish default', () => {
    const p = portion({ kind: 'relative', label: 'usual', grams: 0, multiplier: 1 });
    expect(() => resolveGrams(p, 1, {})).toThrow(PortionResolutionError);
  });

  it('throws rather than returning zero when the default is missing', () => {
    const p = portion({ kind: 'relative', label: 'less', grams: 0, multiplier: 0.7 });
    expect(() => resolveGrams(p, 1)).toThrow(PortionResolutionError);
  });

  it('throws when a relative portion has no multiplier', () => {
    const p = portion({ kind: 'relative', label: 'odd', grams: 0 });
    expect(() => resolveGrams(p, 1, { defaultPortionGrams: 100 })).toThrow(PortionResolutionError);
  });

  it('rejects a non-positive count', () => {
    expect(() => resolveGrams(portion({}), 0)).toThrow(PortionResolutionError);
    expect(() => resolveGrams(portion({}), -1)).toThrow(PortionResolutionError);
  });

  it('rejects a non-finite count', () => {
    expect(() => resolveGrams(portion({}), Number.NaN)).toThrow(PortionResolutionError);
  });

  it('rejects negative stored grams', () => {
    expect(() => resolveGrams(portion({ grams: -5 }), 1)).toThrow(PortionResolutionError);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/lib/portions/resolve.test.ts
```

Expected: FAIL, cannot resolve `./resolve`.

- [ ] **Step 3: Write the constants**

Create `src/lib/portions/constants.ts`:

```typescript
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
```

- [ ] **Step 4: Write the resolver**

Create `src/lib/portions/resolve.ts`:

```typescript
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
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
npx vitest run src/lib/portions/resolve.test.ts
```

Expected: PASS, 13 tests.

- [ ] **Step 6: Commit**

```bash
git add src/lib/portions/
git commit -m "feat: single portion resolver for all five input kinds

Metric, vessel, hand, photo and relative portions all resolve to grams
through one function. Callers downstream cannot tell which kind was used.

A relative portion with no dish baseline throws rather than resolving to
zero, which would silently under-count the day while appearing to work."
```

---

## Task 4: Entity types and Dexie schema

**Files:**
- Create: `src/lib/db/types.ts`, `src/lib/db/schema.ts`
- Test: `src/lib/db/schema.test.ts`

**Interfaces:**
- Consumes: `PortionDef`, `PortionKind` from Task 3; `NutrientKey` from Task 2.
- Produces:
  - `type NutrientVector = Partial<Record<NutrientKey, number>>`
  - `interface Ingredient`, `Dish`, `Recipe`, `LogEntry`, `BodyLog`, `SettingRow`
  - `type MealSlot = 'early' | 'breakfast' | 'midMorning' | 'lunch' | 'evening' | 'dinner'`
  - `const MEAL_SLOTS: readonly MealSlot[]`
  - `class FiShakalDB extends Dexie` with tables `ingredients`, `dishes`, `recipes`, `portions`, `logEntries`, `bodyLogs`, `settings`
  - `const db: FiShakalDB`
  - `const SCHEMA_VERSION = 1`

- [ ] **Step 1: Write the failing test**

Create `src/lib/db/schema.test.ts`:

```typescript
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { FiShakalDB, SCHEMA_VERSION } from './schema';
import { MEAL_SLOTS } from './types';

let db: FiShakalDB;

beforeEach(async () => {
  db = new FiShakalDB(`test-${Math.random()}`);
  await db.open();
});

describe('FiShakalDB', () => {
  it('declares every table', () => {
    const names = db.tables.map((t) => t.name).sort();
    expect(names).toEqual(
      ['bodyLogs', 'dishes', 'ingredients', 'logEntries', 'portions', 'recipes', 'settings'].sort(),
    );
  });

  it('round-trips a dish', async () => {
    await db.dishes.add({
      id: 'd1',
      name: 'Sambar',
      ownerScope: 'seed',
      derivation: 'authored',
      per100g: { energy: 60, protein: 3 },
      createdAt: 1,
    });
    const found = await db.dishes.get('d1');
    expect(found?.name).toBe('Sambar');
    expect(found?.per100g.protein).toBe(3);
  });

  it('indexes log entries by day key', async () => {
    await db.logEntries.bulkAdd([
      { id: 'l1', dishId: 'd1', portionId: 'p1', count: 1, slot: 'lunch', dayKey: '2026-10-06', loggedAt: 10 },
      { id: 'l2', dishId: 'd1', portionId: 'p1', count: 1, slot: 'dinner', dayKey: '2026-10-07', loggedAt: 20 },
    ]);
    const today = await db.logEntries.where('dayKey').equals('2026-10-06').toArray();
    expect(today).toHaveLength(1);
    expect(today[0].id).toBe('l1');
  });

  it('exposes a stable schema version', () => {
    expect(SCHEMA_VERSION).toBe(1);
  });

  it('defines six meal slots in order', () => {
    expect(MEAL_SLOTS).toHaveLength(6);
    expect(MEAL_SLOTS[0]).toBe('early');
    expect(MEAL_SLOTS[5]).toBe('dinner');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/lib/db/schema.test.ts
```

Expected: FAIL, cannot resolve `./schema`.

- [ ] **Step 3: Write the entity types**

Create `src/lib/db/types.ts`. This file imports no Dexie, so pure modules can use these shapes.

```typescript
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
```

- [ ] **Step 4: Write the Dexie schema**

Create `src/lib/db/schema.ts`:

```typescript
import Dexie, { type Table } from 'dexie';
import type {
  Ingredient,
  Dish,
  Recipe,
  LogEntry,
  BodyLog,
  SettingRow,
  PortionDef,
} from './types';

/** Bumped only alongside a Dexie version() migration. Import files carry it. */
export const SCHEMA_VERSION = 1;

export class FiShakalDB extends Dexie {
  ingredients!: Table<Ingredient, string>;
  dishes!: Table<Dish, string>;
  recipes!: Table<Recipe, string>;
  portions!: Table<PortionDef, string>;
  logEntries!: Table<LogEntry, string>;
  bodyLogs!: Table<BodyLog, string>;
  settings!: Table<SettingRow, string>;

  constructor(name = 'fishakal') {
    super(name);
    this.version(SCHEMA_VERSION).stores({
      ingredients: 'id, name, source',
      dishes: 'id, name, ownerScope',
      recipes: 'id, dishId',
      portions: 'id, dishId, kind',
      logEntries: 'id, dayKey, dishId, slot, loggedAt',
      bodyLogs: 'id, dayKey, loggedAt',
      settings: 'key',
    });
  }
}

export const db = new FiShakalDB();
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
npx vitest run src/lib/db/schema.test.ts
```

Expected: PASS, 5 tests.

- [ ] **Step 6: Commit**

```bash
git add src/lib/db/
git commit -m "feat: entity types and Dexie schema

types.ts imports no Dexie so pure nutrition and portion modules can use
the entity shapes without pulling IndexedDB into the test environment.

Log entries are indexed by local calendar day key rather than timestamp,
so day boundaries follow the user's timezone rather than UTC."
```

---

## Task 5: Dish nutrient computation

**Files:**
- Create: `src/lib/nutrition/nutrients.ts`, `src/lib/nutrition/dish.ts`
- Test: `src/lib/nutrition/nutrients.test.ts`, `src/lib/nutrition/dish.test.ts`

**Interfaces:**
- Consumes: `NutrientVector`, `Dish`, `Recipe`, `Ingredient` from Task 4.
- Produces:
  - `function addVectors(a: NutrientVector, b: NutrientVector): NutrientVector`
  - `function scaleVector(v: NutrientVector, factor: number): NutrientVector`
  - `const ZERO_VECTOR: NutrientVector`
  - `function nutrientsForMass(per100g: NutrientVector, grams: number): NutrientVector`
  - `function computeRecipeNutrients(recipe: Recipe, ingredientsById: Map<string, Ingredient>): NutrientVector`
  - `function dishNutrientsPer100g(dish: Dish, recipe: Recipe | undefined, ingredientsById: Map<string, Ingredient>): NutrientVector`
  - `class RecipeComputationError extends Error`

- [ ] **Step 1: Write the failing vector test**

Create `src/lib/nutrition/nutrients.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/lib/nutrition/nutrients.test.ts
```

Expected: FAIL, cannot resolve `./nutrients`.

- [ ] **Step 3: Write the vector helpers**

Create `src/lib/nutrition/nutrients.ts`:

```typescript
import type { NutrientKey } from './units';
import type { NutrientVector } from '@/lib/db/types';

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
    throw new RangeError(`Scale factor must be finite, got ${factor}.`);
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
    throw new RangeError(`Mass must be a non-negative finite number, got ${grams}.`);
  }
  return scaleVector(per100g, grams / 100);
}
```

- [ ] **Step 4: Run the vector test to verify it passes**

```bash
npx vitest run src/lib/nutrition/nutrients.test.ts
```

Expected: PASS, 9 tests.

- [ ] **Step 5: Write the failing dish test**

Create `src/lib/nutrition/dish.test.ts`:

```typescript
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
});
```

- [ ] **Step 6: Run the dish test to verify it fails**

```bash
npx vitest run src/lib/nutrition/dish.test.ts
```

Expected: FAIL, cannot resolve `./dish`.

- [ ] **Step 7: Write the dish computation**

Create `src/lib/nutrition/dish.ts`:

```typescript
import type { Dish, Recipe, Ingredient, NutrientVector } from '@/lib/db/types';
import { addVectors, nutrientsForMass, scaleVector, ZERO_VECTOR } from './nutrients';

export class RecipeComputationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RecipeComputationError';
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
  if (dish.derivation === 'authored') return dish.per100g;
  if (!recipe) {
    throw new RecipeComputationError(
      `Dish ${dish.id} is recipe-derived but no recipe was supplied.`,
    );
  }
  return computeRecipeNutrients(recipe, ingredientsById);
}
```

- [ ] **Step 8: Run the dish test to verify it passes**

```bash
npx vitest run src/lib/nutrition/dish.test.ts
```

Expected: PASS, 10 tests.

- [ ] **Step 9: Run the whole suite and lint**

```bash
npm test
npm run lint
```

Expected: all tests pass, no lint errors. The lint rule from Task 1 confirms `src/lib/nutrition/` and `src/lib/portions/` import nothing from React, Next or Dexie.

- [ ] **Step 10: Commit**

```bash
git add src/lib/nutrition/
git commit -m "feat: dish nutrient computation from authored values or recipes

Recipe-derived dishes compute per-100g values from ingredient masses,
yield and a cooking retention factor. Authored dishes keep their own
numbers, so expanding a dish into ingredients stays opt-in per dish.

Unknown ingredients, zero yield and out-of-range retention factors all
throw. A silently skipped ingredient produces a plausible but wrong dish."
```

---

## End of Part 1

At this point the pure logic layer is complete and tested with no UI: units, portions, entities, database schema, and dish nutrient computation.

Continue with `2026-10-06-fishakal-v1-log-PART2.md`, which covers local calendar day handling, daily total aggregation, seed data authored from `PLAN.md`, `FOOD.md` and `WEEK.md`, and the three-tap logging screen.
