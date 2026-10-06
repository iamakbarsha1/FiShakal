# FiShakal v1 Log Surface Implementation Plan: Part 2 of 3

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Part 2 of 3.** Local calendar days, daily totals, repository layer, seed data, and the three-tap logging screen.
Requires Part 1 (`2026-10-06-fishakal-v1-log-PART1.md`) to be complete through Task 5. Continues in `2026-10-06-fishakal-v1-log-PART3.md`.

**Spec:** `docs/superpowers/specs/2026-10-06-fishakal-design.md`

**Global Constraints and Review Focus:** defined in Part 1. They apply here unchanged. This part owns Review Focus items 3 and 4.

**Interfaces available from Part 1:**
- `toCanonical(key, value, sourceUnit)`, `NUTRIENTS`, `NutrientKey`, `UnitMismatchError` from `@/lib/nutrition/units`
- `resolveGrams(portion, count, ctx)`, `PortionDef`, `PortionResolutionError` from `@/lib/portions/resolve`
- `RELATIVE_MULTIPLIERS`, `VESSEL_DEFAULT_ML`, `HAND_DEFAULT_GRAMS`, `DEFAULT_DENSITY_G_PER_ML` from `@/lib/portions/constants`
- `addVectors`, `scaleVector`, `nutrientsForMass`, `ZERO_VECTOR` from `@/lib/nutrition/nutrients`
- `dishNutrientsPer100g`, `computeRecipeNutrients`, `RecipeComputationError` from `@/lib/nutrition/dish`
- `Ingredient`, `Dish`, `Recipe`, `LogEntry`, `BodyLog`, `NutrientVector`, `MealSlot`, `MEAL_SLOTS`, `MEAL_SLOT_LABELS` from `@/lib/db/types`
- `FiShakalDB`, `db`, `SCHEMA_VERSION` from `@/lib/db/schema`

---

## Task 6: Local calendar day handling

This task owns Review Focus item 3.

**Files:**
- Create: `src/lib/time/day.ts`
- Test: `src/lib/time/day.test.ts`
- Modify: `vitest.config.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `function dayKeyOf(date: Date): string` returning `YYYY-MM-DD` in local time
  - `function todayKey(now?: Date): string`
  - `function startOfLocalDay(dayKey: string): Date`
  - `function addDays(dayKey: string, delta: number): string`
  - `function formatDayLabel(dayKey: string, now?: Date): string`

- [ ] **Step 1: Pin the test timezone**

Day-boundary behaviour is only observable when local time and UTC differ. Without a fixed timezone the test passes everywhere by accident. In `vitest.config.ts`, add `env` inside the `test` block so it reads:

```typescript
  test: {
    environment: 'node',
    env: { TZ: 'Asia/Kolkata' },
    include: ['src/**/*.test.ts'],
    coverage: { provider: 'v8', include: ['src/lib/**'] },
  },
```

Asia/Kolkata is UTC+5:30, so any local time before 05:30 falls on the previous UTC day. That is what makes the next test meaningful.

- [ ] **Step 2: Write the failing test**

Create `src/lib/time/day.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { dayKeyOf, todayKey, startOfLocalDay, addDays, formatDayLabel } from './day';

describe('dayKeyOf', () => {
  it('formats a midday date', () => {
    expect(dayKeyOf(new Date(2026, 9, 6, 13, 0))).toBe('2026-10-06');
  });

  it('zero-pads month and day', () => {
    expect(dayKeyOf(new Date(2026, 0, 5, 13, 0))).toBe('2026-01-05');
  });

  // Review Focus 3: a meal logged after midnight must land on the local day.
  // In UTC+5:30, 00:30 local is 19:00 the previous day in UTC. An
  // implementation using toISOString() returns the wrong day here.
  it('keeps a 00:30 local time on the same local day', () => {
    expect(dayKeyOf(new Date(2026, 9, 6, 0, 30))).toBe('2026-10-06');
  });

  it('keeps a 23:45 local time on the same local day', () => {
    expect(dayKeyOf(new Date(2026, 9, 6, 23, 45))).toBe('2026-10-06');
  });

  it('does not agree with the UTC date for an early-morning local time', () => {
    const d = new Date(2026, 9, 6, 0, 30);
    expect(dayKeyOf(d)).not.toBe(d.toISOString().slice(0, 10));
  });
});

describe('startOfLocalDay', () => {
  it('round-trips through dayKeyOf', () => {
    expect(dayKeyOf(startOfLocalDay('2026-10-06'))).toBe('2026-10-06');
  });

  it('returns local midnight', () => {
    const d = startOfLocalDay('2026-10-06');
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
  });

  it('rejects a malformed key', () => {
    expect(() => startOfLocalDay('06-10-2026')).toThrow();
  });
});

describe('addDays', () => {
  it('advances by one day', () => {
    expect(addDays('2026-10-06', 1)).toBe('2026-10-07');
  });

  it('crosses a month boundary', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
  });

  it('goes backwards', () => {
    expect(addDays('2026-11-01', -1)).toBe('2026-10-31');
  });

  it('crosses a year boundary', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('todayKey', () => {
  it('uses the supplied clock', () => {
    expect(todayKey(new Date(2026, 9, 6, 2, 0))).toBe('2026-10-06');
  });
});

describe('formatDayLabel', () => {
  const now = new Date(2026, 9, 6, 12, 0);

  it('labels the current day', () => {
    expect(formatDayLabel('2026-10-06', now)).toBe('Today');
  });

  it('labels the previous day', () => {
    expect(formatDayLabel('2026-10-05', now)).toBe('Yesterday');
  });

  it('falls back to a date for older days', () => {
    expect(formatDayLabel('2026-09-30', now)).not.toBe('Today');
    expect(formatDayLabel('2026-09-30', now)).not.toBe('Yesterday');
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
npx vitest run src/lib/time/day.test.ts
```

Expected: FAIL, cannot resolve `./day`.

- [ ] **Step 4: Write the implementation**

Create `src/lib/time/day.ts`:

```typescript
const DAY_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * The local calendar day a moment falls on, as 'YYYY-MM-DD'.
 *
 * Deliberately built from local date components rather than toISOString(),
 * which is UTC. A meal logged at 00:30 belongs to the day the user thinks
 * they are in, not to the previous UTC day.
 */
export function dayKeyOf(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function todayKey(now: Date = new Date()): string {
  return dayKeyOf(now);
}

export function startOfLocalDay(dayKey: string): Date {
  if (!DAY_KEY_PATTERN.test(dayKey)) {
    throw new RangeError(`Expected a YYYY-MM-DD day key, got "${dayKey}".`);
  }
  const [y, m, d] = dayKey.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

export function addDays(dayKey: string, delta: number): string {
  const d = startOfLocalDay(dayKey);
  d.setDate(d.getDate() + delta);
  return dayKeyOf(d);
}

export function formatDayLabel(dayKey: string, now: Date = new Date()): string {
  const today = dayKeyOf(now);
  if (dayKey === today) return 'Today';
  if (dayKey === addDays(today, -1)) return 'Yesterday';
  return startOfLocalDay(dayKey).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
npx vitest run src/lib/time/day.test.ts
```

Expected: PASS, 15 tests.

- [ ] **Step 6: Commit**

```bash
git add src/lib/time/ vitest.config.ts
git commit -m "feat: local calendar day keys

Day keys are built from local date components, not toISOString(). A meal
logged at 00:30 belongs to the day the user is in, not the previous UTC
day. Tests run pinned to Asia/Kolkata so the distinction is observable."
```

---

## Task 7: Daily total aggregation

This task owns Review Focus item 4.

**Files:**
- Create: `src/lib/nutrition/totals.ts`
- Test: `src/lib/nutrition/totals.test.ts`

**Interfaces:**
- Consumes: `resolveGrams`, `dishNutrientsPer100g`, `nutrientsForMass`, `addVectors`, entity types.
- Produces:
  - `interface TotalsLookup { dishes: Map<string, Dish>; portions: Map<string, PortionDef>; recipes: Map<string, Recipe>; ingredients: Map<string, Ingredient> }`
  - `interface SkippedEntry { entryId: string; reason: string }`
  - `interface DayTotals { totals: NutrientVector; bySlot: Record<MealSlot, NutrientVector>; skipped: SkippedEntry[] }`
  - `function computeDayTotals(entries: LogEntry[], lookup: TotalsLookup): DayTotals`

- [ ] **Step 1: Write the failing test**

Create `src/lib/nutrition/totals.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { computeDayTotals, type TotalsLookup } from './totals';
import type { Dish, LogEntry, PortionDef, Recipe, Ingredient } from '@/lib/db/types';
import { VESSEL_DEFAULT_ML } from '@/lib/portions/constants';

const dish: Dish = {
  id: 'd-sambar', name: 'Sambar', ownerScope: 'seed', derivation: 'authored',
  per100g: { energy: 60, protein: 3, iron: 1 }, defaultPortionId: 'p-katori', createdAt: 0,
};
const katori: PortionDef = { id: 'p-katori', dishId: 'd-sambar', kind: 'vessel', label: '1 katori', grams: 150 };
const usual: PortionDef = { id: 'p-usual', dishId: 'd-sambar', kind: 'relative', label: 'usual', grams: 0, multiplier: 1 };

function lookup(over: Partial<TotalsLookup> = {}): TotalsLookup {
  return {
    dishes: new Map([[dish.id, dish]]),
    portions: new Map([[katori.id, katori], [usual.id, usual]]),
    recipes: new Map<string, Recipe>(),
    ingredients: new Map<string, Ingredient>(),
    vesselMl: { ...VESSEL_DEFAULT_ML },
    ...over,
  };
}

function entry(over: Partial<LogEntry> = {}): LogEntry {
  return { id: 'l1', dishId: 'd-sambar', portionId: 'p-katori', count: 1, slot: 'lunch', dayKey: '2026-10-06', loggedAt: 1, ...over };
}

describe('computeDayTotals', () => {
  it('returns zeros for an empty day', () => {
    const r = computeDayTotals([], lookup());
    expect(r.totals).toEqual({});
    expect(r.skipped).toEqual([]);
  });

  it('scales a single entry by its portion mass', () => {
    const r = computeDayTotals([entry()], lookup());
    expect(r.totals.energy).toBeCloseTo(90, 6);
    expect(r.totals.protein).toBeCloseTo(4.5, 6);
  });

  it('multiplies by the entry count', () => {
    const r = computeDayTotals([entry({ count: 2 })], lookup());
    expect(r.totals.energy).toBeCloseTo(180, 6);
  });

  it('sums across entries', () => {
    const r = computeDayTotals([entry({ id: 'l1' }), entry({ id: 'l2' })], lookup());
    expect(r.totals.energy).toBeCloseTo(180, 6);
  });

  it('groups by meal slot', () => {
    const r = computeDayTotals(
      [entry({ id: 'l1', slot: 'lunch' }), entry({ id: 'l2', slot: 'dinner' })],
      lookup(),
    );
    expect(r.bySlot.lunch.energy).toBeCloseTo(90, 6);
    expect(r.bySlot.dinner.energy).toBeCloseTo(90, 6);
    expect(r.bySlot.breakfast).toEqual({});
  });

  it('resolves a relative portion against the dish default', () => {
    const r = computeDayTotals([entry({ portionId: 'p-usual' })], lookup());
    expect(r.totals.energy).toBeCloseTo(90, 6);
  });

  // Review Focus 4: a deleted dish or portion must not take down the day.
  it('skips an entry whose dish was deleted', () => {
    const r = computeDayTotals([entry({ dishId: 'gone' })], lookup());
    expect(r.totals).toEqual({});
    expect(r.skipped).toHaveLength(1);
    expect(r.skipped[0].entryId).toBe('l1');
    expect(r.skipped[0].reason).toMatch(/dish/i);
  });

  it('skips an entry whose portion was deleted', () => {
    const r = computeDayTotals([entry({ portionId: 'gone' })], lookup());
    expect(r.skipped).toHaveLength(1);
    expect(r.skipped[0].reason).toMatch(/portion/i);
  });

  it('still totals the surviving entries when one is dangling', () => {
    const r = computeDayTotals([entry({ id: 'l1' }), entry({ id: 'l2', dishId: 'gone' })], lookup());
    expect(r.totals.energy).toBeCloseTo(90, 6);
    expect(r.skipped).toHaveLength(1);
  });

  it('skips rather than throws when a relative portion has no dish default', () => {
    const orphan: Dish = { ...dish, defaultPortionId: undefined };
    const r = computeDayTotals(
      [entry({ portionId: 'p-usual' })],
      lookup({ dishes: new Map([[orphan.id, orphan]]) }),
    );
    expect(r.skipped).toHaveLength(1);
    expect(r.totals).toEqual({});
  });

  it('skips rather than throws when a recipe dish has a broken recipe', () => {
    const recipeDish: Dish = { ...dish, derivation: 'recipe' };
    const r = computeDayTotals(
      [entry()],
      lookup({ dishes: new Map([[recipeDish.id, recipeDish]]) }),
    );
    expect(r.skipped).toHaveLength(1);
    expect(r.totals).toEqual({});
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/lib/nutrition/totals.test.ts
```

Expected: FAIL, cannot resolve `./totals`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/nutrition/totals.ts`:

```typescript
import type {
  Dish, Recipe, Ingredient, LogEntry, PortionDef, NutrientVector, MealSlot,
} from '@/lib/db/types';
import { MEAL_SLOTS } from '@/lib/db/types';
import { resolveGrams } from '@/lib/portions/resolve';
import type { VesselName } from '@/lib/portions/constants';
import { dishNutrientsPer100g } from './dish';
import { addVectors, nutrientsForMass } from './nutrients';

export interface TotalsLookup {
  dishes: Map<string, Dish>;
  portions: Map<string, PortionDef>;
  recipes: Map<string, Recipe>;
  ingredients: Map<string, Ingredient>;
  /**
   * The user's current calibrated vessel volumes, in ml. Vessel portions
   * resolve against these rather than against their stored grams, which is
   * what makes recalibration correct history: nothing is rewritten, past
   * entries simply resolve against the current value on the next read.
   */
  vesselMl: Record<VesselName, number>;
}

export interface SkippedEntry {
  entryId: string;
  reason: string;
}

export interface DayTotals {
  totals: NutrientVector;
  bySlot: Record<MealSlot, NutrientVector>;
  skipped: SkippedEntry[];
}

function emptyBySlot(): Record<MealSlot, NutrientVector> {
  return Object.fromEntries(MEAL_SLOTS.map((s) => [s, {}])) as Record<MealSlot, NutrientVector>;
}

/**
 * Aggregate a day's log entries into totals.
 *
 * An entry referencing a deleted dish or portion is recorded in `skipped`
 * rather than thrown. One dangling reference must not take down the whole
 * day view; the user needs to see the rest of their day and be told what
 * could not be counted.
 */
export function computeDayTotals(entries: LogEntry[], lookup: TotalsLookup): DayTotals {
  let totals: NutrientVector = {};
  const bySlot = emptyBySlot();
  const skipped: SkippedEntry[] = [];

  for (const entry of entries) {
    const dish = lookup.dishes.get(entry.dishId);
    if (!dish) {
      skipped.push({ entryId: entry.id, reason: `Dish ${entry.dishId} no longer exists.` });
      continue;
    }
    const portion = lookup.portions.get(entry.portionId);
    if (!portion) {
      skipped.push({ entryId: entry.id, reason: `Portion ${entry.portionId} no longer exists.` });
      continue;
    }

    // A dish's default portion must never itself be `relative`: its grams
    // are 0, so resolveGrams would reject it and every relative entry on
    // that dish would disappear into `skipped` with no clear cause. Task 8
    // has a seed test enforcing this; the guard here names it if it happens.
    const defaultPortion = dish.defaultPortionId
      ? lookup.portions.get(dish.defaultPortionId)
      : undefined;
    if (defaultPortion?.kind === 'relative') {
      skipped.push({
        entryId: entry.id,
        reason: `Dish ${dish.id} has a relative portion as its default, which cannot be a baseline.`,
      });
      continue;
    }

    try {
      const grams = resolveGrams(portion, entry.count, {
        defaultPortionGrams: defaultPortion?.grams,
        vesselMl: portion.vesselKey ? lookup.vesselMl[portion.vesselKey] : undefined,
        densityGPerMl: dish.densityGPerMl,
      });
      const per100g = dishNutrientsPer100g(
        dish,
        lookup.recipes.get(dish.id),
        lookup.ingredients,
      );
      const contribution = nutrientsForMass(per100g, grams);
      totals = addVectors(totals, contribution);
      bySlot[entry.slot] = addVectors(bySlot[entry.slot], contribution);
    } catch (err) {
      skipped.push({
        entryId: entry.id,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { totals, bySlot, skipped };
}
```

Note the recipe lookup is keyed by `dish.id`, matching the seed and repository layers in Task 8, which store one recipe per dish under the dish's own id.

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/lib/nutrition/totals.test.ts
```

Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/nutrition/totals.ts src/lib/nutrition/totals.test.ts
git commit -m "feat: daily total aggregation with dangling-reference tolerance

Entries referencing a deleted dish or portion are collected in skipped[]
rather than thrown. A single dangling reference must not blank the whole
day view; the user sees the rest of the day and what could not be counted."
```

---

## Task 8: Repository layer and seed data

**Files:**
- Create: `src/lib/db/repo.ts`, `src/lib/db/seed-data.ts`, `src/lib/db/seed.ts`
- Test: `src/lib/db/seed.test.ts`

**Interfaces:**
- Consumes: `FiShakalDB`, entity types, `toCanonical`, `VESSEL_DEFAULT_ML`, `HAND_DEFAULT_GRAMS`, `RELATIVE_MULTIPLIERS`, `todayKey`.
- Produces:
  - `function newId(prefix: string): string`
  - `function loadLookup(database: FiShakalDB): Promise<TotalsLookup>`
  - `function logMeal(database: FiShakalDB, input: { dishId: string; portionId: string; count?: number; slot: MealSlot; at?: Date }): Promise<LogEntry>`
  - `function entriesForDay(database: FiShakalDB, dayKey: string): Promise<LogEntry[]>`
  - `function recentDishes(database: FiShakalDB, slot: MealSlot, limit?: number): Promise<Dish[]>`
  - `function deleteEntry(database: FiShakalDB, entryId: string): Promise<void>`
  - `const SEED_INGREDIENTS: Ingredient[]`, `const SEED_DISHES: SeedDish[]`
  - `function seedIfEmpty(database: FiShakalDB): Promise<{ seeded: boolean }>`

- [ ] **Step 1: Write the repository**

Create `src/lib/db/repo.ts`:

```typescript
import type { FiShakalDB } from './schema';
import type { Dish, LogEntry, MealSlot } from './types';
import type { TotalsLookup } from '@/lib/nutrition/totals';
import { VESSEL_DEFAULT_ML, type VesselName } from '@/lib/portions/constants';
import { dayKeyOf } from '@/lib/time/day';

export function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

/**
 * The user's calibrated vessel volumes, falling back to the seeded defaults
 * for any vessel they have not adjusted. Lives here rather than in Part 3's
 * settings module because the aggregator needs it to resolve vessel portions.
 */
export async function allVesselMl(database: FiShakalDB): Promise<Record<VesselName, number>> {
  const names = Object.keys(VESSEL_DEFAULT_ML) as VesselName[];
  const rows = await database.settings.bulkGet(names.map((n) => `vessel.ml.${n}`));
  return Object.fromEntries(
    names.map((n, i) => [n, typeof rows[i]?.value === 'number' ? (rows[i]!.value as number) : VESSEL_DEFAULT_ML[n]]),
  ) as Record<VesselName, number>;
}

/** Load every table needed to compute totals. The dataset is small by design. */
export async function loadLookup(database: FiShakalDB): Promise<TotalsLookup> {
  const [dishes, portions, recipes, ingredients, vesselMl] = await Promise.all([
    database.dishes.toArray(),
    database.portions.toArray(),
    database.recipes.toArray(),
    database.ingredients.toArray(),
    allVesselMl(database),
  ]);
  return {
    dishes: new Map(dishes.map((d) => [d.id, d])),
    portions: new Map(portions.map((p) => [p.id, p])),
    recipes: new Map(recipes.map((r) => [r.dishId, r])),
    ingredients: new Map(ingredients.map((i) => [i.id, i])),
    vesselMl,
  };
}

export async function logMeal(
  database: FiShakalDB,
  input: { dishId: string; portionId: string; count?: number; slot: MealSlot; at?: Date },
): Promise<LogEntry> {
  const at = input.at ?? new Date();
  const entry: LogEntry = {
    id: newId('log'),
    dishId: input.dishId,
    portionId: input.portionId,
    count: input.count ?? 1,
    slot: input.slot,
    dayKey: dayKeyOf(at),
    loggedAt: at.getTime(),
  };
  await database.logEntries.add(entry);
  return entry;
}

export function entriesForDay(database: FiShakalDB, dayKey: string): Promise<LogEntry[]> {
  return database.logEntries.where('dayKey').equals(dayKey).sortBy('loggedAt');
}

export async function deleteEntry(database: FiShakalDB, entryId: string): Promise<void> {
  await database.logEntries.delete(entryId);
}

/**
 * Dishes most recently logged in this slot, most recent first, then any
 * remaining dishes by name. Recency plus slot is what makes the picker a
 * single tap for the dozen dishes that actually recur.
 */
export async function recentDishes(
  database: FiShakalDB,
  slot: MealSlot,
  limit = 12,
): Promise<Dish[]> {
  const recent = await database.logEntries
    .where('slot').equals(slot)
    .reverse().sortBy('loggedAt');

  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const e of recent) {
    if (!seen.has(e.dishId)) {
      seen.add(e.dishId);
      ordered.push(e.dishId);
    }
    if (ordered.length >= limit) break;
  }

  const byId = new Map((await database.dishes.toArray()).map((d) => [d.id, d]));
  const head = ordered.map((id) => byId.get(id)).filter((d): d is Dish => d !== undefined);

  const tail = [...byId.values()]
    .filter((d) => !seen.has(d.id))
    .sort((a, b) => a.name.localeCompare(b.name));

  return [...head, ...tail];
}
```

- [ ] **Step 2: Write the seed data**

Create `src/lib/db/seed-data.ts`. Values are per 100 g in canonical units, authored from `FOOD.md` and `WEEK.md` with USDA FoodData Central (CC0) for ingredient primitives. Spec §13 forbids any other source.

This file is deliberately data-only. Extend it rather than scattering food values through the codebase.

```typescript
import type { Ingredient, NutrientVector } from './types';
import {
  RELATIVE_MULTIPLIERS, VESSEL_DEFAULT_ML, HAND_DEFAULT_GRAMS,
  DEFAULT_DENSITY_G_PER_ML, type VesselName,
} from '@/lib/portions/constants';

export const SEED_INGREDIENTS: Ingredient[] = [
  { id: 'ing-toor-dal', name: 'Toor dal, dry', source: 'usda-fdc', densityGPerMl: 0.85,
    per100g: { energy: 343, protein: 22, fat: 1.5, carbs: 63, fiber: 15, iron: 5.1, calcium: 130 } },
  { id: 'ing-soya-chunks', name: 'Soya chunks, dry', source: 'usda-fdc', densityGPerMl: 0.3,
    per100g: { energy: 345, protein: 52, fat: 0.5, carbs: 33, fiber: 13, iron: 20, calcium: 350 } },
  { id: 'ing-kondakadalai', name: 'Chana (kondakadalai), dry', source: 'usda-fdc', densityGPerMl: 0.8,
    per100g: { energy: 364, protein: 19, fat: 6, carbs: 61, fiber: 17, iron: 6.2, calcium: 105 } },
  { id: 'ing-rice-raw', name: 'Rice, raw milled', source: 'usda-fdc', densityGPerMl: 0.85,
    per100g: { energy: 360, protein: 7, fat: 0.6, carbs: 79, fiber: 1.3, iron: 0.8 } },
  { id: 'ing-egg', name: 'Egg, whole', source: 'usda-fdc', densityGPerMl: 1.03,
    per100g: { energy: 143, protein: 13, fat: 9.5, carbs: 0.7, iron: 1.8, vitaminD: 2, vitaminB12: 0.9 } },
  { id: 'ing-chicken-breast', name: 'Chicken, skinless', source: 'usda-fdc', densityGPerMl: 1.05,
    per100g: { energy: 165, protein: 31, fat: 3.6, carbs: 0, iron: 1, vitaminB12: 0.3 } },
  { id: 'ing-sardine', name: 'Sardine (mathi)', source: 'usda-fdc', densityGPerMl: 1.05,
    per100g: { energy: 208, protein: 25, fat: 11.5, carbs: 0, calcium: 382, vitaminD: 4.8, vitaminB12: 8.9 } },
  { id: 'ing-curd', name: 'Curd, whole milk', source: 'usda-fdc', densityGPerMl: 1.03,
    per100g: { energy: 61, protein: 3.5, fat: 3.3, carbs: 4.7, calcium: 121, vitaminB12: 0.4 } },
  { id: 'ing-oil', name: 'Cooking oil', source: 'usda-fdc', densityGPerMl: 0.92,
    per100g: { energy: 884, protein: 0, fat: 100, carbs: 0 } },
  { id: 'ing-onion', name: 'Onion', source: 'usda-fdc', densityGPerMl: 0.95,
    per100g: { energy: 40, protein: 1.1, fat: 0.1, carbs: 9.3, fiber: 1.7 } },
  { id: 'ing-tomato', name: 'Tomato', source: 'usda-fdc', densityGPerMl: 0.95,
    per100g: { energy: 18, protein: 0.9, fat: 0.2, carbs: 3.9, fiber: 1.2 } },
  { id: 'ing-coconut', name: 'Coconut, fresh grated', source: 'usda-fdc', densityGPerMl: 0.5,
    per100g: { energy: 354, protein: 3.3, fat: 33, carbs: 15, fiber: 9 } },
];

export interface SeedPortion {
  kind: 'vessel' | 'hand' | 'metric' | 'relative';
  /** Required when kind is 'vessel', so settings recalibration can find it. */
  vesselKey?: VesselName;
  label: string;
  grams: number;
  multiplier?: number;
  isDefault?: boolean;
}

export interface SeedDish {
  id: string;
  name: string;
  per100g: NutrientVector;
  densityGPerMl?: number;
  portions: SeedPortion[];
}

/**
 * Vessel portions store a MASS, not a volume. Converting one to the other
 * needs the dish's density, so it is explicit here rather than implied.
 * Writing a millilitre figure straight into a grams field is correct only
 * when density happens to be 1.0 and silently wrong otherwise, which is the
 * same unit-confusion class the nutrient layer has a dedicated test for.
 */
function vesselGrams(vessel: VesselName, densityGPerMl: number = DEFAULT_DENSITY_G_PER_ML): number {
  return Math.round(VESSEL_DEFAULT_ML[vessel] * densityGPerMl);
}

/**
 * Seed dishes authored from PLAN.md, FOOD.md and WEEK.md. Every dish ships
 * with a default portion so relative sizing works from the first log.
 */
export const SEED_DISHES: SeedDish[] = [
  { id: 'dish-sambar', name: 'Sambar', per100g: { energy: 62, protein: 3.1, fat: 1.8, carbs: 8.4, fiber: 2.2, iron: 0.9 },
    portions: [
      { kind: 'vessel', vesselKey: 'katori', label: '1 katori', grams: vesselGrams('katori'), isDefault: true },
      { kind: 'vessel', vesselKey: 'ladle', label: '1 ladle', grams: vesselGrams('ladle') },
      { kind: 'relative', label: 'Less', grams: 0, multiplier: RELATIVE_MULTIPLIERS.less },
      { kind: 'relative', label: 'More', grams: 0, multiplier: RELATIVE_MULTIPLIERS.more },
    ] },
  { id: 'dish-rasam', name: 'Rasam', per100g: { energy: 28, protein: 1.1, fat: 0.9, carbs: 4.1, iron: 0.5 },
    portions: [
      { kind: 'vessel', vesselKey: 'katori', label: '1 katori', grams: vesselGrams('katori'), isDefault: true },
      { kind: 'relative', label: 'More', grams: 0, multiplier: RELATIVE_MULTIPLIERS.more },
    ] },
  { id: 'dish-white-rice', name: 'White rice, cooked', per100g: { energy: 130, protein: 2.7, fat: 0.3, carbs: 28, fiber: 0.4 },
    portions: [
      { kind: 'hand', label: '1 fist', grams: HAND_DEFAULT_GRAMS.fist, isDefault: true },
      { kind: 'vessel', vesselKey: 'katori', label: '1 katori', grams: vesselGrams('katori') },
      { kind: 'relative', label: 'Less', grams: 0, multiplier: RELATIVE_MULTIPLIERS.less },
      { kind: 'metric', label: '100 g', grams: 100 },
    ] },
  { id: 'dish-soya-curry', name: 'Soya chunks curry', per100g: { energy: 118, protein: 14, fat: 3.5, carbs: 8, fiber: 3.4, iron: 4.2, calcium: 85 },
    portions: [
      { kind: 'vessel', vesselKey: 'katori', label: '1 katori', grams: vesselGrams('katori'), isDefault: true },
      { kind: 'hand', label: '1 palm', grams: HAND_DEFAULT_GRAMS.palm },
      { kind: 'relative', label: 'More', grams: 0, multiplier: RELATIVE_MULTIPLIERS.more },
    ] },
  { id: 'dish-boiled-egg', name: 'Boiled egg', per100g: { energy: 155, protein: 13, fat: 11, carbs: 1.1, iron: 1.2, vitaminD: 2, vitaminB12: 1.1 },
    portions: [
      { kind: 'metric', label: '1 egg', grams: 50, isDefault: true },
      { kind: 'metric', label: '2 eggs', grams: 100 },
      { kind: 'metric', label: '3 eggs', grams: 150 },
    ] },
  { id: 'dish-chicken-curry', name: 'Chicken curry', per100g: { energy: 165, protein: 18, fat: 9, carbs: 3.2, iron: 1.3, vitaminB12: 0.3 },
    portions: [
      { kind: 'vessel', vesselKey: 'katori', label: '1 katori', grams: vesselGrams('katori'), isDefault: true },
      { kind: 'hand', label: '1 palm', grams: HAND_DEFAULT_GRAMS.palm },
      { kind: 'relative', label: 'More', grams: 0, multiplier: RELATIVE_MULTIPLIERS.more },
    ] },
  { id: 'dish-fish-fry', name: 'Fish fry', per100g: { energy: 205, protein: 22, fat: 12, carbs: 2, calcium: 220, vitaminD: 4, vitaminB12: 6 },
    portions: [
      { kind: 'metric', label: '1 piece', grams: 80, isDefault: true },
      { kind: 'metric', label: '2 pieces', grams: 160 },
    ] },
  { id: 'dish-curd', name: 'Curd', per100g: { energy: 61, protein: 3.5, fat: 3.3, carbs: 4.7, calcium: 121, vitaminB12: 0.4 },
    portions: [
      { kind: 'vessel', vesselKey: 'katori', label: '1 katori', grams: vesselGrams('katori'), isDefault: true },
      { kind: 'vessel', vesselKey: 'tumbler', label: '1 tumbler', grams: vesselGrams('tumbler') },
    ] },
  { id: 'dish-chapati', name: 'Chapati', per100g: { energy: 297, protein: 9, fat: 7, carbs: 49, fiber: 5, iron: 2.5 },
    portions: [
      { kind: 'metric', label: '1 chapati', grams: 45, isDefault: true },
      { kind: 'metric', label: '2 chapatis', grams: 90 },
      { kind: 'metric', label: '3 chapatis', grams: 135 },
    ] },
  { id: 'dish-idli', name: 'Idli', per100g: { energy: 136, protein: 4.3, fat: 0.4, carbs: 28, fiber: 1.2 },
    portions: [
      { kind: 'metric', label: '2 idli', grams: 90, isDefault: true },
      { kind: 'metric', label: '3 idli', grams: 135 },
      { kind: 'metric', label: '4 idli', grams: 180 },
    ] },
  { id: 'dish-dosa', name: 'Dosa', per100g: { energy: 168, protein: 3.9, fat: 5.2, carbs: 26, fiber: 1.1 },
    portions: [{ kind: 'metric', label: '1 dosa', grams: 85, isDefault: true }, { kind: 'metric', label: '2 dosa', grams: 170 }] },
  { id: 'dish-kondakadalai-sundal', name: 'Kondakadalai sundal', per100g: { energy: 164, protein: 8.9, fat: 2.6, carbs: 27, fiber: 7.6, iron: 2.9 },
    portions: [
      { kind: 'vessel', vesselKey: 'katori', label: '1 katori', grams: vesselGrams('katori'), isDefault: true },
      { kind: 'hand', label: '1 cupped hand', grams: HAND_DEFAULT_GRAMS.cuppedHand },
    ] },
  { id: 'dish-biryani', name: 'Biryani', per100g: { energy: 185, protein: 8.5, fat: 7.5, carbs: 21, fiber: 1.4 },
    portions: [
      { kind: 'hand', label: '1 fist', grams: HAND_DEFAULT_GRAMS.fist, isDefault: true },
      { kind: 'relative', label: 'Less', grams: 0, multiplier: RELATIVE_MULTIPLIERS.less },
      { kind: 'relative', label: 'More', grams: 0, multiplier: RELATIVE_MULTIPLIERS.more },
    ] },
  { id: 'dish-black-coffee', name: 'Black coffee, no sugar', per100g: { energy: 2, protein: 0.1, fat: 0, carbs: 0 },
    portions: [{ kind: 'vessel', vesselKey: 'tumbler', label: '1 tumbler', grams: vesselGrams('tumbler'), isDefault: true }] },
];
```

- [ ] **Step 3: Write the failing seed test**

Create `src/lib/db/seed.test.ts`:

```typescript
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { FiShakalDB } from './schema';
import { seedIfEmpty } from './seed';
import { loadLookup, logMeal, entriesForDay, recentDishes } from './repo';
import { computeDayTotals } from '@/lib/nutrition/totals';
import { dayKeyOf } from '@/lib/time/day';

let db: FiShakalDB;

beforeEach(async () => {
  db = new FiShakalDB(`seed-${Math.random()}`);
  await db.open();
});

describe('seedIfEmpty', () => {
  it('populates dishes, portions and ingredients', async () => {
    const r = await seedIfEmpty(db);
    expect(r.seeded).toBe(true);
    expect(await db.dishes.count()).toBeGreaterThan(10);
    expect(await db.ingredients.count()).toBeGreaterThan(5);
    expect(await db.portions.count()).toBeGreaterThan(20);
  });

  it('is idempotent', async () => {
    await seedIfEmpty(db);
    const first = await db.dishes.count();
    const second = await seedIfEmpty(db);
    expect(second.seeded).toBe(false);
    expect(await db.dishes.count()).toBe(first);
  });

  it('gives every seeded dish a default portion', async () => {
    await seedIfEmpty(db);
    for (const dish of await db.dishes.toArray()) {
      expect(dish.defaultPortionId, `${dish.name} has no default portion`).toBeDefined();
      expect(await db.portions.get(dish.defaultPortionId!)).toBeDefined();
    }
  });

  it('gives every vessel portion a vesselKey', async () => {
    await seedIfEmpty(db);
    const vessels = await db.portions.where('kind').equals('vessel').toArray();
    expect(vessels.length).toBeGreaterThan(0);
    for (const p of vessels) {
      expect(p.vesselKey, `${p.label} on ${p.dishId} has no vesselKey`).toBeDefined();
    }
  });

  it('never makes a relative portion a dish default', async () => {
    await seedIfEmpty(db);
    for (const dish of await db.dishes.toArray()) {
      const def = await db.portions.get(dish.defaultPortionId!);
      expect(def?.kind, `${dish.name} defaults to a relative portion`).not.toBe('relative');
    }
  });

  it('gives every relative portion a resolvable baseline', async () => {
    await seedIfEmpty(db);
    const lookup = await loadLookup(db);
    for (const p of await db.portions.toArray()) {
      if (p.kind !== 'relative') continue;
      const dish = lookup.dishes.get(p.dishId);
      expect(dish?.defaultPortionId, `${p.label} on ${p.dishId}`).toBeDefined();
    }
  });
});

describe('logging round trip', () => {
  it('logs a meal and totals it', async () => {
    await seedIfEmpty(db);
    const dish = (await db.dishes.get('dish-soya-curry'))!;
    await logMeal(db, { dishId: dish.id, portionId: dish.defaultPortionId!, slot: 'lunch' });

    const key = dayKeyOf(new Date());
    const entries = await entriesForDay(db, key);
    expect(entries).toHaveLength(1);

    const result = computeDayTotals(entries, await loadLookup(db));
    expect(result.skipped).toEqual([]);
    expect(result.totals.protein).toBeGreaterThan(0);
    expect(result.bySlot.lunch.protein).toBeGreaterThan(0);
  });

  it('resolves every seeded relative portion without skipping', async () => {
    await seedIfEmpty(db);
    const relatives = await db.portions.where('kind').equals('relative').toArray();
    expect(relatives.length).toBeGreaterThan(0);
    for (const p of relatives) {
      await logMeal(db, { dishId: p.dishId, portionId: p.id, slot: 'dinner' });
    }
    const entries = await entriesForDay(db, dayKeyOf(new Date()));
    const result = computeDayTotals(entries, await loadLookup(db));
    expect(result.skipped).toEqual([]);
  });

  it('recalibrating a vessel corrects an already-logged entry', async () => {
    await seedIfEmpty(db);
    const dish = (await db.dishes.get('dish-sambar'))!;
    const katori = (await db.portions.get(dish.defaultPortionId!))!;
    expect(katori.vesselKey).toBe('katori');

    await logMeal(db, { dishId: dish.id, portionId: katori.id, slot: 'lunch' });
    const entries = await entriesForDay(db, dayKeyOf(new Date()));

    const before = computeDayTotals(entries, await loadLookup(db));
    await db.settings.put({ key: 'vessel.ml.katori', value: 300 });
    const after = computeDayTotals(entries, await loadLookup(db));

    expect(after.skipped).toEqual([]);
    expect(after.totals.energy!).toBeGreaterThan(before.totals.energy!);
    expect(after.totals.energy!).toBeCloseTo(before.totals.energy! * 2, 5);
  });

  it('orders recent dishes for the slot first', async () => {
    await seedIfEmpty(db);
    await logMeal(db, { dishId: 'dish-biryani', portionId: (await db.dishes.get('dish-biryani'))!.defaultPortionId!, slot: 'lunch' });
    const list = await recentDishes(db, 'lunch');
    expect(list[0].id).toBe('dish-biryani');
  });

  it('returns all dishes when nothing has been logged', async () => {
    await seedIfEmpty(db);
    const list = await recentDishes(db, 'breakfast');
    expect(list.length).toBe(await db.dishes.count());
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

```bash
npx vitest run src/lib/db/seed.test.ts
```

Expected: FAIL, cannot resolve `./seed`.

- [ ] **Step 5: Write the seeder**

Create `src/lib/db/seed.ts`:

```typescript
import type { FiShakalDB } from './schema';
import type { Dish, PortionDef } from './types';
import { SEED_INGREDIENTS, SEED_DISHES } from './seed-data';

/**
 * Populate the database on first run. Idempotent: it checks for existing
 * dishes and does nothing if any are present, so it is safe to call on
 * every app start and after an import.
 */
export async function seedIfEmpty(database: FiShakalDB): Promise<{ seeded: boolean }> {
  const existing = await database.dishes.count();
  if (existing > 0) return { seeded: false };

  const dishes: Dish[] = [];
  const portions: PortionDef[] = [];
  const now = Date.now();

  for (const seed of SEED_DISHES) {
    let defaultPortionId: string | undefined;

    seed.portions.forEach((p, index) => {
      const portion: PortionDef = {
        id: `${seed.id}-p${index}`,
        dishId: seed.id,
        kind: p.kind,
        label: p.label,
        grams: p.grams,
        ...(p.vesselKey !== undefined ? { vesselKey: p.vesselKey } : {}),
        ...(p.multiplier !== undefined ? { multiplier: p.multiplier } : {}),
      };
      portions.push(portion);
      if (p.isDefault) defaultPortionId = portion.id;
    });

    if (!defaultPortionId) {
      throw new Error(`Seed dish ${seed.id} declares no default portion.`);
    }

    dishes.push({
      id: seed.id,
      name: seed.name,
      ownerScope: 'seed',
      derivation: 'authored',
      per100g: seed.per100g,
      ...(seed.densityGPerMl !== undefined ? { densityGPerMl: seed.densityGPerMl } : {}),
      defaultPortionId,
      createdAt: now,
    });
  }

  await database.transaction('rw', database.ingredients, database.dishes, database.portions, async () => {
    await database.ingredients.bulkAdd(SEED_INGREDIENTS);
    await database.dishes.bulkAdd(dishes);
    await database.portions.bulkAdd(portions);
  });

  return { seeded: true };
}
```

- [ ] **Step 6: Run the test to verify it passes**

```bash
npx vitest run src/lib/db/seed.test.ts
```

Expected: PASS, 12 tests.

- [ ] **Step 7: Expand the seed set to the spec target**

Spec §12 calls for roughly 50 dishes and 200 ingredients. Steps 1 to 6 ship
14 and 12, which is enough to prove the engine but not enough to log a real
week without constantly adding dishes.

This step is data authoring, not engineering. Work through `WEEK.md` day by
day and `FOOD.md` section by section, and add every dish and ingredient that
appears, following the existing row format in `src/lib/db/seed-data.ts`.

Rules for each row:
- Ingredient values come from USDA FoodData Central only. Record the FDC id
  in `sourceRef`. No other source is permitted by spec §13.
- Dish values are hand-authored per 100 g of the cooked dish, not of its dry
  ingredients. A dish whose numbers you cannot justify does not go in.
- Every dish needs at least one portion marked `isDefault`, or `seedIfEmpty`
  throws by design.
- Prefer the portion kind a person would actually say for that dish: katori
  for wet dishes, pieces for countable items, fist for rice and biryani.

The existing tests already enforce the invariants across whatever you add:
`seedIfEmpty` fails if any dish lacks a default portion, and
`resolves every seeded relative portion without skipping` fails if any
relative portion has no resolvable baseline. Run them after every batch of
ten dishes rather than at the end.

```bash
npx vitest run src/lib/db/seed.test.ts
```

Stop when `WEEK.md` and `FOOD.md` are exhausted. If that lands at 40 dishes
rather than 50, that is the right number; the target was an estimate and the
source documents are the authority.

- [ ] **Step 8: Run the whole suite**

```bash
npm test && npm run lint
```

Expected: all tests pass, no lint errors.

- [ ] **Step 9: Commit**

```bash
git add src/lib/db/
git commit -m "feat: repository layer and seed data

Seeds the dish and ingredient set authored from PLAN.md, FOOD.md and
WEEK.md, with USDA FoodData Central (CC0) for ingredient primitives. No
other data source is permitted by spec section 13.

Every seeded dish ships with a default portion, so relative sizing
resolves from the very first log rather than throwing on a fresh install.

recentDishes() orders by most recently logged in the same slot, which is
what collapses the dish picker to one tap for the dishes that recur."
```

---

## Task 9: Today screen

**Files:**
- Create: `src/components/Providers.tsx`, `src/components/DayHeader.tsx`, `src/components/SlotRow.tsx`, `src/components/TotalsBar.tsx`, `src/hooks/useDay.ts`
- Modify: `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`

**Interfaces:**
- Consumes: everything from Tasks 6 to 8.
- Produces:
  - `function useDay(dayKey: string)` returning `{ entries, totals, bySlot, skipped, lookup, ready }`
  - `<DayHeader dayKey onPrev onNext />`, `<SlotRow slot entries lookup onAdd onRemove />`, `<TotalsBar totals />`

- [ ] **Step 1: Install the Dexie React binding**

```bash
npm install dexie-react-hooks@^4
```

`useLiveQuery` re-renders on IndexedDB writes without a hand-rolled subscription layer. It is maintained by the Dexie author and adds no transitive dependencies.

- [ ] **Step 2: Write the day hook**

Create `src/hooks/useDay.ts`:

```typescript
'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/schema';
import { loadLookup, entriesForDay } from '@/lib/db/repo';
import { computeDayTotals } from '@/lib/nutrition/totals';
import { MEAL_SLOTS, type MealSlot, type NutrientVector } from '@/lib/db/types';

export function useDay(dayKey: string) {
  const data = useLiveQuery(async () => {
    const [entries, lookup] = await Promise.all([
      entriesForDay(db, dayKey),
      loadLookup(db),
    ]);
    return { entries, lookup, ...computeDayTotals(entries, lookup) };
  }, [dayKey]);

  if (!data) {
    return {
      ready: false as const,
      entries: [],
      lookup: undefined,
      totals: {},
      bySlot: Object.fromEntries(MEAL_SLOTS.map((s) => [s, {}])) as Record<MealSlot, NutrientVector>,
      skipped: [],
    };
  }
  return { ready: true as const, ...data };
}
```

- [ ] **Step 3: Write the providers component**

Create `src/components/Providers.tsx`. Seeding runs once on mount, client-side, because there is no server.

```tsx
'use client';

import { useEffect, useState } from 'react';
import { db } from '@/lib/db/schema';
import { seedIfEmpty } from '@/lib/db/seed';

export function Providers({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    seedIfEmpty(db)
      .catch((err) => console.error('Seeding failed', err))
      .finally(() => { if (!cancelled) setReady(true); });
    return () => { cancelled = true; };
  }, []);

  if (!ready) {
    return <div className="flex min-h-dvh items-center justify-center text-neutral-500">Loading</div>;
  }
  return <>{children}</>;
}
```

- [ ] **Step 4: Write the totals bar**

Create `src/components/TotalsBar.tsx`:

```tsx
'use client';

import { NUTRIENTS, type NutrientKey } from '@/lib/nutrition/units';
import type { NutrientVector } from '@/lib/db/types';

const HEADLINE: NutrientKey[] = ['energy', 'protein', 'fat', 'carbs'];

export function TotalsBar({ totals }: { totals: NutrientVector }) {
  return (
    <div className="grid grid-cols-4 gap-px bg-neutral-800 text-center">
      {HEADLINE.map((key) => (
        <div key={key} className="bg-neutral-950 px-2 py-3">
          <div className="text-xl font-semibold tabular-nums text-neutral-100">
            {Math.round(totals[key] ?? 0)}
          </div>
          <div className="text-[11px] uppercase tracking-wide text-neutral-500">
            {NUTRIENTS[key].label}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Write the day header**

Create `src/components/DayHeader.tsx`:

```tsx
'use client';

import { formatDayLabel } from '@/lib/time/day';

export function DayHeader({
  dayKey, onPrev, onNext,
}: { dayKey: string; onPrev: () => void; onNext: () => void }) {
  return (
    <header className="flex items-center justify-between px-4 py-3">
      <button onClick={onPrev} aria-label="Previous day" className="px-3 py-2 text-neutral-500">
        &larr;
      </button>
      <h1 className="text-base font-medium text-neutral-100">{formatDayLabel(dayKey)}</h1>
      <button onClick={onNext} aria-label="Next day" className="px-3 py-2 text-neutral-500">
        &rarr;
      </button>
    </header>
  );
}
```

- [ ] **Step 6: Write the slot row**

Create `src/components/SlotRow.tsx`:

```tsx
'use client';

import type { LogEntry, MealSlot, NutrientVector } from '@/lib/db/types';
import { MEAL_SLOT_LABELS } from '@/lib/db/types';
import type { TotalsLookup } from '@/lib/nutrition/totals';

export function SlotRow({
  slot, entries, lookup, slotTotals, onAdd, onRemove,
}: {
  slot: MealSlot;
  entries: LogEntry[];
  lookup: TotalsLookup | undefined;
  slotTotals: NutrientVector;
  onAdd: (slot: MealSlot) => void;
  onRemove: (entryId: string) => void;
}) {
  return (
    <section className="border-b border-neutral-900">
      <button
        onClick={() => onAdd(slot)}
        className="flex w-full items-baseline justify-between px-4 py-3 text-left active:bg-neutral-900"
      >
        <span className="text-sm font-medium text-neutral-300">{MEAL_SLOT_LABELS[slot]}</span>
        <span className="text-xs tabular-nums text-neutral-600">
          {Math.round(slotTotals.energy ?? 0)} kcal
        </span>
      </button>

      {entries.length > 0 && (
        <ul className="pb-2">
          {entries.map((e) => {
            const dish = lookup?.dishes.get(e.dishId);
            const portion = lookup?.portions.get(e.portionId);
            return (
              <li key={e.id} className="flex items-center justify-between px-4 py-1.5">
                <span className="truncate text-sm text-neutral-400">
                  {dish?.name ?? 'Deleted dish'}
                  <span className="ml-2 text-neutral-600">
                    {e.count > 1 ? `${e.count} × ` : ''}{portion?.label ?? '?'}
                  </span>
                </span>
                <button
                  onClick={() => onRemove(e.id)}
                  aria-label={`Remove ${dish?.name ?? 'entry'}`}
                  className="px-2 text-neutral-700"
                >
                  &times;
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 7: Wire the layout and page**

Replace `src/app/layout.tsx`:

```tsx
import type { Metadata, Viewport } from 'next';
import { Providers } from '@/components/Providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'FiShakal',
  description: 'Log what you actually ate.',
};

export const viewport: Viewport = {
  themeColor: '#0a0a0a',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-dvh bg-neutral-950 text-neutral-100 antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

Replace `src/app/page.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { db } from '@/lib/db/schema';
import { deleteEntry } from '@/lib/db/repo';
import { MEAL_SLOTS, type MealSlot } from '@/lib/db/types';
import { todayKey, addDays } from '@/lib/time/day';
import { useDay } from '@/hooks/useDay';
import { DayHeader } from '@/components/DayHeader';
import { SlotRow } from '@/components/SlotRow';
import { TotalsBar } from '@/components/TotalsBar';

export default function TodayPage() {
  const [dayKey, setDayKey] = useState(() => todayKey());
  const [, setPickerSlot] = useState<MealSlot | null>(null);
  const day = useDay(dayKey);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col">
      <DayHeader
        dayKey={dayKey}
        onPrev={() => setDayKey((k) => addDays(k, -1))}
        onNext={() => setDayKey((k) => addDays(k, 1))}
      />
      <TotalsBar totals={day.totals} />

      <div className="flex-1">
        {MEAL_SLOTS.map((slot) => (
          <SlotRow
            key={slot}
            slot={slot}
            entries={day.entries.filter((e) => e.slot === slot)}
            lookup={day.lookup}
            slotTotals={day.bySlot[slot] ?? {}}
            onAdd={setPickerSlot}
            onRemove={(id) => void deleteEntry(db, id)}
          />
        ))}
      </div>

      {day.skipped.length > 0 && (
        <p className="px-4 py-3 text-xs text-amber-500">
          {day.skipped.length} entr{day.skipped.length === 1 ? 'y' : 'ies'} could not be counted.
        </p>
      )}
    </main>
  );
}
```

The `setPickerSlot` state is wired but unused until Task 10 attaches the picker. The destructured `[, setPickerSlot]` avoids an unused-variable lint error in the meantime.

- [ ] **Step 8: Verify the build and run it**

```bash
npm run lint && npm run build && npx serve out
```

Open the served URL on a phone-sized viewport. Expected: six meal slots, a totals bar reading zero, and day navigation that moves the header label between Today, Yesterday and a date.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: today screen with six meal slots and live totals

useLiveQuery re-renders the day on any IndexedDB write, so logging and
deleting reflect immediately without manual cache invalidation.

Seeding runs client-side on mount because there is no server to run it."
```

---

## Task 10: The three-tap log flow

This task delivers the spec §11 interaction: slot, dish, portion.

**Files:**
- Create: `src/components/LogSheet.tsx`
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `recentDishes`, `logMeal`, `db`, `MealSlot`.
- Produces: `<LogSheet slot onClose />`

- [ ] **Step 1: Write the log sheet**

Create `src/components/LogSheet.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/schema';
import { recentDishes, logMeal } from '@/lib/db/repo';
import { MEAL_SLOT_LABELS, type Dish, type MealSlot } from '@/lib/db/types';

export function LogSheet({ slot, onClose }: { slot: MealSlot; onClose: () => void }) {
  const [dish, setDish] = useState<Dish | null>(null);
  const [query, setQuery] = useState('');

  const dishes = useLiveQuery(() => recentDishes(db, slot), [slot]) ?? [];
  const portions = useLiveQuery(
    () => (dish ? db.portions.where('dishId').equals(dish.id).toArray() : Promise.resolve([])),
    [dish?.id],
  ) ?? [];

  const visible = query
    ? dishes.filter((d) => d.name.toLowerCase().includes(query.toLowerCase()))
    : dishes;

  async function choosePortion(portionId: string) {
    if (!dish) return;
    await logMeal(db, { dishId: dish.id, portionId, slot });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-neutral-950">
      <header className="flex items-center justify-between border-b border-neutral-900 px-4 py-3">
        <h2 className="text-sm font-medium text-neutral-300">
          {dish ? dish.name : MEAL_SLOT_LABELS[slot]}
        </h2>
        <button
          onClick={() => (dish ? setDish(null) : onClose())}
          className="px-2 py-1 text-sm text-neutral-500"
        >
          {dish ? 'Back' : 'Close'}
        </button>
      </header>

      {!dish ? (
        <>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search dishes"
            aria-label="Search dishes"
            className="border-b border-neutral-900 bg-transparent px-4 py-3 text-base text-neutral-100 outline-none placeholder:text-neutral-700"
          />
          <ul className="flex-1 overflow-y-auto">
            {visible.map((d) => (
              <li key={d.id}>
                <button
                  onClick={() => setDish(d)}
                  className="w-full px-4 py-3.5 text-left text-base text-neutral-200 active:bg-neutral-900"
                >
                  {d.name}
                </button>
              </li>
            ))}
            {visible.length === 0 && (
              <li className="px-4 py-6 text-sm text-neutral-600">No dish matches &ldquo;{query}&rdquo;.</li>
            )}
          </ul>
        </>
      ) : (
        <div className="flex flex-wrap content-start gap-2 p-4">
          {portions.map((p) => (
            <button
              key={p.id}
              onClick={() => void choosePortion(p.id)}
              className="rounded-full border border-neutral-800 px-4 py-2.5 text-sm text-neutral-200 active:bg-neutral-900"
            >
              {p.label}
            </button>
          ))}
          {portions.length === 0 && (
            <p className="text-sm text-neutral-600">This dish has no portions yet.</p>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Attach the sheet to the page**

In `src/app/page.tsx`, change the picker state line from `const [, setPickerSlot]` to:

```tsx
  const [pickerSlot, setPickerSlot] = useState<MealSlot | null>(null);
```

Add the import:

```tsx
import { LogSheet } from '@/components/LogSheet';
```

And render it just before the closing `</main>`:

```tsx
      {pickerSlot && <LogSheet slot={pickerSlot} onClose={() => setPickerSlot(null)} />}
```

- [ ] **Step 3: Verify the three-tap budget by hand**

```bash
npm run build && npx serve out
```

On a phone-sized viewport, count the taps from a cold load: tap the slot, tap the dish, tap the portion. Three. The entry must appear in the slot and the totals bar must update without a reload.

Then confirm the interaction holds for a recurring dish: log Sambar at lunch, reload, open lunch again. Sambar must now be first in the list, because `recentDishes` orders by most recently logged in that slot.

- [ ] **Step 4: Verify offline operation**

With the page open, switch the device or browser to offline and repeat the three taps. The log must succeed, since nothing in this path touches the network.

- [ ] **Step 5: Run the full suite**

```bash
npm test && npm run lint && npm run build
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: three-tap log flow

Slot, dish, portion. Dishes are ordered by most recently logged in the
same slot, which collapses the picker to a single tap for the dozen
dishes that actually recur.

Portion chips render whatever kinds the dish defines. The sheet does not
know or care whether a chip is a vessel, a hand unit or a metric amount."
```

---

## End of Part 2

The product is now usable: a working offline tracker where a meal is three taps.

Continue with `2026-10-06-fishakal-v1-log-PART3.md`, which covers photo portions, vessel calibration in settings, body logging, JSON export and import with schema-version refusal, and the PWA manifest and offline service worker.
