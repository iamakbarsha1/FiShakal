# FiShakal v1 Log Surface Implementation Plan: Part 3 of 3

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Part 3 of 3.** Photo portions, vessel calibration, body logging, export and import, PWA install and offline, and final verification against the spec's success criteria.
Requires Parts 1 and 2 complete through Task 10. This part owns Review Focus item 5.

**Spec:** `docs/superpowers/specs/2026-10-06-fishakal-design.md`

**Global Constraints and Review Focus:** defined in Part 1. They apply here unchanged.

---

## Task 11: Custom and photo portions

**Files:**
- Modify: `src/lib/portions/resolve.ts` (comment only)
- Create: `src/components/AddPortionSheet.tsx`
- Modify: `src/components/LogSheet.tsx`
- Test: `src/lib/portions/photo.test.ts`

**Interfaces:**
- Consumes: `PortionDef`, `db`, `newId`.
- Produces:
  - `PortionDef.photo` (declared in Part 1 Task 3) is now populated
  - `function createPortion(database, input: { dishId: string; kind: PortionKind; label: string; grams: number; photo?: Blob }): Promise<PortionDef>` in `src/lib/db/repo.ts`
  - `<AddPortionSheet dishId onDone onCancel />`

Dexie only declares indexed fields in `stores()`. `photo` is not indexed, so storing a `Blob` on `PortionDef` needs no schema version bump and no migration. IndexedDB stores Blobs natively.

- [ ] **Step 1: Document the photo field**

`interface PortionDef` in `src/lib/portions/resolve.ts` already declares `photo?: Blob` from Part 1 Task 3. Expand its comment to record why it needs no migration:

```typescript
  /**
   * The user's own photo of this portion, stored as a Blob. Dexie declares
   * only indexed fields in stores(), so a non-indexed Blob property needs
   * no schema version bump. The photo is a recall cue; the mass in `grams`
   * is what actually resolves.
   */
  photo?: Blob;
```

`resolveGrams` is unchanged: a photo portion resolves from its stored `grams` exactly like a vessel portion, so no existing test changes.

- [ ] **Step 2: Write the failing test**

Create `src/lib/portions/photo.test.ts`:

```typescript
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { FiShakalDB } from '@/lib/db/schema';
import { createPortion } from '@/lib/db/repo';
import { resolveGrams } from './resolve';

let db: FiShakalDB;

beforeEach(async () => {
  db = new FiShakalDB(`photo-${Math.random()}`);
  await db.open();
});

describe('createPortion', () => {
  it('stores a photo portion and resolves it by mass', async () => {
    const blob = new Blob(['fake-jpeg-bytes'], { type: 'image/jpeg' });
    const p = await createPortion(db, {
      dishId: 'dish-sambar', kind: 'photo', label: 'My usual katori', grams: 165, photo: blob,
    });

    expect(p.photo).toBeDefined();
    expect(resolveGrams(p, 1)).toBe(165);
  });

  it('round-trips the photo through IndexedDB', async () => {
    const blob = new Blob(['bytes'], { type: 'image/jpeg' });
    const p = await createPortion(db, { dishId: 'd1', kind: 'photo', label: 'usual', grams: 100, photo: blob });
    const loaded = await db.portions.get(p.id);
    expect(loaded?.photo).toBeInstanceOf(Blob);
  });

  it('creates a metric portion without a photo', async () => {
    const p = await createPortion(db, { dishId: 'd1', kind: 'metric', label: '75 g', grams: 75 });
    expect(p.photo).toBeUndefined();
    expect(resolveGrams(p, 2)).toBe(150);
  });

  it('rejects a non-positive mass', async () => {
    await expect(
      createPortion(db, { dishId: 'd1', kind: 'metric', label: 'bad', grams: 0 }),
    ).rejects.toThrow();
  });

  it('rejects an empty label', async () => {
    await expect(
      createPortion(db, { dishId: 'd1', kind: 'metric', label: '  ', grams: 50 }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
npx vitest run src/lib/portions/photo.test.ts
```

Expected: FAIL, `createPortion` is not exported from `@/lib/db/repo`.

- [ ] **Step 4: Add createPortion to the repository**

Append to `src/lib/db/repo.ts`:

```typescript
import type { PortionDef, PortionKind } from '@/lib/portions/resolve';

export async function createPortion(
  database: FiShakalDB,
  input: { dishId: string; kind: PortionKind; label: string; grams: number; photo?: Blob },
): Promise<PortionDef> {
  const label = input.label.trim();
  if (label.length === 0) {
    throw new RangeError('A portion needs a label.');
  }
  if (!Number.isFinite(input.grams) || input.grams <= 0) {
    throw new RangeError(`A portion needs a positive mass, got ${input.grams}.`);
  }
  const portion: PortionDef = {
    id: newId('portion'),
    dishId: input.dishId,
    kind: input.kind,
    label,
    grams: input.grams,
    ...(input.photo ? { photo: input.photo } : {}),
  };
  await database.portions.add(portion);
  return portion;
}
```

Add `PortionKind` to the existing type import from `@/lib/portions/resolve` if one is already present, rather than duplicating the import line.

- [ ] **Step 5: Run the test to verify it passes**

```bash
npx vitest run src/lib/portions/photo.test.ts
```

Expected: PASS, 5 tests.

- [ ] **Step 6: Write the add-portion sheet**

Create `src/components/AddPortionSheet.tsx`. The camera input is a native `<input type="file" capture>`, which needs no library and works in an installed PWA.

```tsx
'use client';

import { useState } from 'react';
import { db } from '@/lib/db/schema';
import { createPortion } from '@/lib/db/repo';

export function AddPortionSheet({
  dishId, onDone, onCancel,
}: { dishId: string; onDone: (portionId: string) => void; onCancel: () => void }) {
  const [label, setLabel] = useState('');
  const [grams, setGrams] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const preview = photo ? URL.createObjectURL(photo) : null;

  async function save() {
    try {
      const p = await createPortion(db, {
        dishId,
        kind: photo ? 'photo' : 'metric',
        label: label.trim() || (photo ? 'My usual' : `${grams} g`),
        grams: Number(grams),
        ...(photo ? { photo } : {}),
      });
      onDone(p.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-neutral-950">
      <header className="flex items-center justify-between border-b border-neutral-900 px-4 py-3">
        <h2 className="text-sm font-medium text-neutral-300">New portion</h2>
        <button onClick={onCancel} className="px-2 py-1 text-sm text-neutral-500">Cancel</button>
      </header>

      <div className="flex flex-col gap-4 p-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs uppercase tracking-wide text-neutral-600">Label</span>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="My usual katori"
            className="border-b border-neutral-800 bg-transparent py-2 text-base text-neutral-100 outline-none placeholder:text-neutral-700"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs uppercase tracking-wide text-neutral-600">Grams</span>
          <input
            value={grams}
            onChange={(e) => setGrams(e.target.value)}
            inputMode="numeric"
            placeholder="165"
            className="border-b border-neutral-800 bg-transparent py-2 text-base tabular-nums text-neutral-100 outline-none placeholder:text-neutral-700"
          />
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-xs uppercase tracking-wide text-neutral-600">Photo, optional</span>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
            className="text-sm text-neutral-400 file:mr-3 file:rounded-full file:border file:border-neutral-800 file:bg-transparent file:px-4 file:py-2 file:text-sm file:text-neutral-300"
          />
          {preview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Portion preview" className="h-40 w-full rounded-lg object-cover" />
          )}
        </label>

        {error && <p className="text-sm text-amber-500">{error}</p>}

        <button
          onClick={() => void save()}
          className="mt-2 rounded-full bg-neutral-100 px-4 py-3 text-sm font-medium text-neutral-950 active:bg-neutral-300"
        >
          Save portion
        </button>
      </div>
    </div>
  );
}
```

`next/image` is not used because `output: 'export'` disables optimization and the source here is an object URL, not a static asset.

- [ ] **Step 7: Offer the sheet from the log flow**

In `src/components/LogSheet.tsx`, add the import and a state flag:

```tsx
import { AddPortionSheet } from './AddPortionSheet';
```

```tsx
  const [adding, setAdding] = useState(false);
```

In the portion-chip branch, add one more chip after the mapped portions:

```tsx
          <button
            onClick={() => setAdding(true)}
            className="rounded-full border border-dashed border-neutral-800 px-4 py-2.5 text-sm text-neutral-500 active:bg-neutral-900"
          >
            + New
          </button>
```

And render the sheet at the end of the component's returned markup, before the closing `</div>`:

```tsx
      {adding && dish && (
        <AddPortionSheet
          dishId={dish.id}
          onCancel={() => setAdding(false)}
          onDone={(portionId) => { setAdding(false); void choosePortion(portionId); }}
        />
      )}
```

Creating a portion logs it immediately, so adding a portion costs no extra tap beyond the one that created it.

- [ ] **Step 8: Verify by hand**

```bash
npm run build && npx serve out
```

Open a dish, tap **+ New**, photograph a real portion, enter its mass, save. The entry must appear in the slot, and the new chip must be present the next time that dish is opened.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: custom and photo portions

A photo portion is the user's own photograph of their own serving, with
the mass they entered once. It needs no content pipeline and calibrates
itself, because the reference is their crockery rather than a stock image.

Blobs are stored directly on the portion record. Dexie only declares
indexed fields, so a non-indexed Blob property needs no migration."
```

---

## Task 12: Vessel calibration

**Files:**
- Create: `src/lib/db/settings.ts`, `src/app/settings/page.tsx`
- Test: `src/lib/db/settings.test.ts`

**Interfaces:**
- Consumes: `db`, `VESSEL_DEFAULT_ML`.
- Produces:
  - `function getVesselMl(database, vessel): Promise<number>`
  - `function setVesselMl(database, vessel, ml): Promise<void>`
  - `function allVesselMl(database): Promise<Record<VesselName, number>>`
  - `type VesselName = keyof typeof VESSEL_DEFAULT_ML`

Calibration is a single editable number per vessel, not a flow. Spec §9 is explicit: ship sensible defaults, expose them, build nothing more.

- [ ] **Step 1: Write the failing test**

Create `src/lib/db/settings.test.ts`:

```typescript
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { FiShakalDB } from './schema';
import { getVesselMl, setVesselMl, allVesselMl } from './settings';
import { VESSEL_DEFAULT_ML } from '@/lib/portions/constants';

let db: FiShakalDB;

beforeEach(async () => {
  db = new FiShakalDB(`settings-${Math.random()}`);
  await db.open();
});

describe('vessel calibration', () => {
  it('falls back to the seeded default', async () => {
    expect(await getVesselMl(db, 'katori')).toBe(VESSEL_DEFAULT_ML.katori);
  });

  it('persists an override', async () => {
    await setVesselMl(db, 'katori', 180);
    expect(await getVesselMl(db, 'katori')).toBe(180);
  });

  it('overwrites rather than duplicating', async () => {
    await setVesselMl(db, 'katori', 180);
    await setVesselMl(db, 'katori', 200);
    expect(await getVesselMl(db, 'katori')).toBe(200);
    expect(await db.settings.count()).toBe(1);
  });

  it('keeps vessels independent', async () => {
    await setVesselMl(db, 'katori', 180);
    expect(await getVesselMl(db, 'ladle')).toBe(VESSEL_DEFAULT_ML.ladle);
  });

  it('rejects a non-positive volume', async () => {
    await expect(setVesselMl(db, 'katori', 0)).rejects.toThrow();
    await expect(setVesselMl(db, 'katori', -5)).rejects.toThrow();
  });

  it('returns every vessel with defaults applied', async () => {
    await setVesselMl(db, 'cup', 300);
    const all = await allVesselMl(db);
    expect(all.cup).toBe(300);
    expect(all.katori).toBe(VESSEL_DEFAULT_ML.katori);
    expect(Object.keys(all).sort()).toEqual(Object.keys(VESSEL_DEFAULT_ML).sort());
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/lib/db/settings.test.ts
```

Expected: FAIL, cannot resolve `./settings`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/db/settings.ts`:

```typescript
import type { FiShakalDB } from './schema';
import { VESSEL_DEFAULT_ML } from '@/lib/portions/constants';

export type VesselName = keyof typeof VESSEL_DEFAULT_ML;

function key(vessel: VesselName): string {
  return `vessel.ml.${vessel}`;
}

export async function getVesselMl(database: FiShakalDB, vessel: VesselName): Promise<number> {
  const row = await database.settings.get(key(vessel));
  return typeof row?.value === 'number' ? row.value : VESSEL_DEFAULT_ML[vessel];
}

export async function setVesselMl(
  database: FiShakalDB,
  vessel: VesselName,
  ml: number,
): Promise<void> {
  if (!Number.isFinite(ml) || ml <= 0) {
    throw new RangeError(`Vessel volume must be positive, got ${ml}.`);
  }
  await database.settings.put({ key: key(vessel), value: ml });
}

export async function allVesselMl(database: FiShakalDB): Promise<Record<VesselName, number>> {
  const names = Object.keys(VESSEL_DEFAULT_ML) as VesselName[];
  const values = await Promise.all(names.map((n) => getVesselMl(database, n)));
  return Object.fromEntries(names.map((n, i) => [n, values[i]])) as Record<VesselName, number>;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/lib/db/settings.test.ts
```

Expected: PASS, 6 tests.

- [ ] **Step 5: Write the settings page**

Create `src/app/settings/page.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/schema';
import { allVesselMl, setVesselMl, type VesselName } from '@/lib/db/settings';

export default function SettingsPage() {
  const vessels = useLiveQuery(() => allVesselMl(db), []);

  return (
    <main className="mx-auto min-h-dvh max-w-md">
      <header className="flex items-center justify-between border-b border-neutral-900 px-4 py-3">
        <h1 className="text-base font-medium text-neutral-100">Settings</h1>
        <Link href="/" className="text-sm text-neutral-500">Done</Link>
      </header>

      <section className="p-4">
        <h2 className="text-xs uppercase tracking-wide text-neutral-600">Your vessels</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Measure each one once with water. Changing a value corrects every
          past entry that used it.
        </p>

        <ul className="mt-4 flex flex-col gap-3">
          {vessels && (Object.keys(vessels) as VesselName[]).map((name) => (
            <li key={name} className="flex items-center justify-between">
              <span className="text-sm capitalize text-neutral-300">{name}</span>
              <span className="flex items-baseline gap-2">
                <input
                  type="number"
                  defaultValue={vessels[name]}
                  min={1}
                  onBlur={(e) => {
                    const ml = Number(e.target.value);
                    if (Number.isFinite(ml) && ml > 0) void setVesselMl(db, name, ml);
                  }}
                  className="w-20 border-b border-neutral-800 bg-transparent py-1 text-right text-base tabular-nums text-neutral-100 outline-none"
                />
                <span className="text-xs text-neutral-600">ml</span>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
```

- [ ] **Step 6: Link settings from the day header**

In `src/components/DayHeader.tsx`, add `import Link from 'next/link';` and replace the next-day button with a fragment containing both it and a settings link:

```tsx
      <span className="flex items-center">
        <button onClick={onNext} aria-label="Next day" className="px-3 py-2 text-neutral-500">
          &rarr;
        </button>
        <Link href="/settings" aria-label="Settings" className="px-3 py-2 text-neutral-500">
          &#9881;
        </Link>
      </span>
```

- [ ] **Step 7: Commit**

```bash
npm test && npm run lint && npm run build
git add -A
git commit -m "feat: vessel calibration in settings

One editable number per vessel, defaults seeded. Because log entries
store a portion reference rather than computed grams, correcting a
vessel volume corrects every past entry that used it."
```

---

## Task 13: Export and import

This task owns Review Focus item 5.

**Files:**
- Create: `src/lib/db/transfer.ts`
- Test: `src/lib/db/transfer.test.ts`
- Modify: `src/app/settings/page.tsx`

**Interfaces:**
- Consumes: `FiShakalDB`, `SCHEMA_VERSION`.
- Produces:
  - `interface ExportFile { app: 'fishakal'; schemaVersion: number; exportedAt: string; data: {...} }`
  - `function exportAll(database): Promise<ExportFile>`
  - `function importAll(database, file: unknown): Promise<{ imported: number }>`
  - `class ImportError extends Error`

- [ ] **Step 1: Write the failing test**

Create `src/lib/db/transfer.test.ts`:

```typescript
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { FiShakalDB, SCHEMA_VERSION } from './schema';
import { exportAll, importAll, ImportError } from './transfer';
import { seedIfEmpty } from './seed';
import { logMeal } from './repo';

let db: FiShakalDB;

beforeEach(async () => {
  db = new FiShakalDB(`transfer-${Math.random()}`);
  await db.open();
});

async function populated() {
  await seedIfEmpty(db);
  const dish = (await db.dishes.get('dish-sambar'))!;
  await logMeal(db, { dishId: dish.id, portionId: dish.defaultPortionId!, slot: 'lunch' });
}

describe('exportAll', () => {
  it('stamps the app name and schema version', async () => {
    await populated();
    const file = await exportAll(db);
    expect(file.app).toBe('fishakal');
    expect(file.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('includes every table', async () => {
    await populated();
    const file = await exportAll(db);
    expect(file.data.dishes.length).toBeGreaterThan(0);
    expect(file.data.portions.length).toBeGreaterThan(0);
    expect(file.data.logEntries).toHaveLength(1);
  });

  it('survives a JSON round trip', async () => {
    await populated();
    const file = await exportAll(db);
    expect(() => JSON.parse(JSON.stringify(file))).not.toThrow();
  });
});

describe('importAll', () => {
  it('restores into an empty database', async () => {
    await populated();
    const file = JSON.parse(JSON.stringify(await exportAll(db)));

    const target = new FiShakalDB(`target-${Math.random()}`);
    await target.open();
    const r = await importAll(target, file);

    expect(r.imported).toBeGreaterThan(0);
    expect(await target.logEntries.count()).toBe(1);
    expect(await target.dishes.count()).toBe(await db.dishes.count());
  });

  // Review Focus 5: a mismatched schema version must refuse, not half-apply.
  it('refuses a newer schema version', async () => {
    await populated();
    const file = JSON.parse(JSON.stringify(await exportAll(db)));
    file.schemaVersion = SCHEMA_VERSION + 1;
    await expect(importAll(db, file)).rejects.toThrow(ImportError);
  });

  it('refuses an older schema version', async () => {
    await populated();
    const file = JSON.parse(JSON.stringify(await exportAll(db)));
    file.schemaVersion = SCHEMA_VERSION - 1;
    await expect(importAll(db, file)).rejects.toThrow(ImportError);
  });

  it('leaves existing data untouched when it refuses', async () => {
    await populated();
    const before = await db.logEntries.count();
    const file = JSON.parse(JSON.stringify(await exportAll(db)));
    file.schemaVersion = SCHEMA_VERSION + 1;

    await expect(importAll(db, file)).rejects.toThrow(ImportError);
    expect(await db.logEntries.count()).toBe(before);
    expect(await db.dishes.count()).toBeGreaterThan(0);
  });

  it('refuses a file from another application', async () => {
    await populated();
    const file = JSON.parse(JSON.stringify(await exportAll(db)));
    file.app = 'something-else';
    await expect(importAll(db, file)).rejects.toThrow(ImportError);
  });

  it('refuses a file with no envelope', async () => {
    await expect(importAll(db, { dishes: [] })).rejects.toThrow(ImportError);
    await expect(importAll(db, null)).rejects.toThrow(ImportError);
    await expect(importAll(db, 'not an object')).rejects.toThrow(ImportError);
  });

  it('refuses a file whose data section is malformed', async () => {
    await populated();
    const file = JSON.parse(JSON.stringify(await exportAll(db)));
    file.data.dishes = 'not an array';
    await expect(importAll(db, file)).rejects.toThrow(ImportError);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/lib/db/transfer.test.ts
```

Expected: FAIL, cannot resolve `./transfer`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/db/transfer.ts`:

```typescript
import type { FiShakalDB } from './schema';
import { SCHEMA_VERSION } from './schema';
import type { Ingredient, Dish, Recipe, LogEntry, BodyLog, SettingRow, PortionDef } from './types';

const TABLE_NAMES = ['ingredients', 'dishes', 'recipes', 'portions', 'logEntries', 'bodyLogs', 'settings'] as const;

export interface ExportFile {
  app: 'fishakal';
  schemaVersion: number;
  exportedAt: string;
  data: {
    ingredients: Ingredient[];
    dishes: Dish[];
    recipes: Recipe[];
    portions: PortionDef[];
    logEntries: LogEntry[];
    bodyLogs: BodyLog[];
    settings: SettingRow[];
  };
}

export class ImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImportError';
  }
}

export async function exportAll(database: FiShakalDB): Promise<ExportFile> {
  const [ingredients, dishes, recipes, portions, logEntries, bodyLogs, settings] = await Promise.all([
    database.ingredients.toArray(),
    database.dishes.toArray(),
    database.recipes.toArray(),
    database.portions.toArray(),
    database.logEntries.toArray(),
    database.bodyLogs.toArray(),
    database.settings.toArray(),
  ]);

  // ponytail: photo Blobs are dropped from the export rather than base64
  // encoded, which would multiply file size by roughly 1.33 and make a
  // year of portions awkward to move. Masses survive, so every portion
  // still resolves after an import; only the recall image is lost.
  // Revisit if users report missing photos after a device move.
  const portionsWithoutPhotos = portions.map(({ photo: _photo, ...rest }) => rest);

  return {
    app: 'fishakal',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    data: { ingredients, dishes, recipes, portions: portionsWithoutPhotos, logEntries, bodyLogs, settings },
  };
}

function assertEnvelope(file: unknown): asserts file is ExportFile {
  if (typeof file !== 'object' || file === null) {
    throw new ImportError('This file is not a FiShakal export.');
  }
  const f = file as Partial<ExportFile>;
  if (f.app !== 'fishakal') {
    throw new ImportError('This file was not exported by FiShakal.');
  }
  if (f.schemaVersion !== SCHEMA_VERSION) {
    throw new ImportError(
      `This export uses schema version ${String(f.schemaVersion)}, but this app reads version ${SCHEMA_VERSION}. ` +
        'Nothing was changed. Update the app, or export again from the version that wrote this file.',
    );
  }
  if (typeof f.data !== 'object' || f.data === null) {
    throw new ImportError('This export has no data section.');
  }
  for (const name of TABLE_NAMES) {
    if (!Array.isArray((f.data as Record<string, unknown>)[name])) {
      throw new ImportError(`This export has a malformed "${name}" section.`);
    }
  }
}

/**
 * Replace the database contents with an export file.
 *
 * Validation happens in full before any write. A version or shape mismatch
 * leaves the existing database exactly as it was, because a partially
 * applied import is worse than a refused one.
 */
export async function importAll(
  database: FiShakalDB,
  file: unknown,
): Promise<{ imported: number }> {
  assertEnvelope(file);
  const { data } = file;

  let imported = 0;
  await database.transaction(
    'rw',
    database.ingredients, database.dishes, database.recipes, database.portions,
    database.logEntries, database.bodyLogs, database.settings,
    async () => {
      await Promise.all(TABLE_NAMES.map((n) => database.table(n).clear()));
      await database.ingredients.bulkAdd(data.ingredients);
      await database.dishes.bulkAdd(data.dishes);
      await database.recipes.bulkAdd(data.recipes);
      await database.portions.bulkAdd(data.portions);
      await database.logEntries.bulkAdd(data.logEntries);
      await database.bodyLogs.bulkAdd(data.bodyLogs);
      await database.settings.bulkAdd(data.settings);
      imported = TABLE_NAMES.reduce(
        (n, name) => n + (data as Record<string, unknown[]>)[name].length,
        0,
      );
    },
  );

  return { imported };
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/lib/db/transfer.test.ts
```

Expected: PASS, 11 tests.

- [ ] **Step 5: Add export and import to settings**

In `src/app/settings/page.tsx`, add the imports:

```tsx
import { useState } from 'react';
import { exportAll, importAll } from '@/lib/db/transfer';
import { todayKey } from '@/lib/time/day';
```

Add state inside the component:

```tsx
  const [message, setMessage] = useState<string | null>(null);
```

Add these handlers inside the component:

```tsx
  async function handleExport() {
    const file = await exportAll(db);
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = `fishakal-${todayKey()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMessage('Exported.');
  }

  async function handleImport(file: File) {
    try {
      const parsed: unknown = JSON.parse(await file.text());
      const { imported } = await importAll(db, parsed);
      setMessage(`Imported ${imported} records.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    }
  }
```

Add this section before the closing `</main>`:

```tsx
      <section className="border-t border-neutral-900 p-4">
        <h2 className="text-xs uppercase tracking-wide text-neutral-600">Your data</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Everything lives on this device. Export regularly, and before you
          clear your browser data or change phone.
        </p>

        <div className="mt-4 flex flex-col gap-3">
          <button
            onClick={() => void handleExport()}
            className="rounded-full border border-neutral-800 px-4 py-2.5 text-sm text-neutral-200 active:bg-neutral-900"
          >
            Export to file
          </button>

          <label className="rounded-full border border-neutral-800 px-4 py-2.5 text-center text-sm text-neutral-200 active:bg-neutral-900">
            Import from file
            <input
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleImport(f);
              }}
            />
          </label>
        </div>

        {message && <p className="mt-3 text-sm text-neutral-400">{message}</p>}
      </section>
```

- [ ] **Step 6: Verify the round trip by hand**

```bash
npm run build && npx serve out
```

Log two meals, export, clear site data in the browser, reload, import the file. Both meals and the day totals must return identically.

- [ ] **Step 7: Commit**

```bash
npm test && npm run lint
git add -A
git commit -m "feat: JSON export and import with version refusal

Import validates the whole envelope before writing anything. A schema
version or shape mismatch refuses and leaves the existing database
untouched, because a partially applied import is worse than a refused one.

Photo Blobs are omitted from exports. Portion masses survive, so every
portion still resolves after a device move; only the recall image is lost."
```

---

## Task 14: Body log

**Files:**
- Create: `src/app/body/page.tsx`, `src/lib/db/body.ts`
- Test: `src/lib/db/body.test.ts`
- Modify: `src/components/DayHeader.tsx`

**Interfaces:**
- Consumes: `db`, `dayKeyOf`, `newId`.
- Produces:
  - `function recordBody(database, input: { weightKg?: number; waistCm?: number; at?: Date }): Promise<BodyLog>`
  - `function bodyHistory(database, limit?): Promise<BodyLog[]>`

- [ ] **Step 1: Write the failing test**

Create `src/lib/db/body.test.ts`:

```typescript
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { FiShakalDB } from './schema';
import { recordBody, bodyHistory } from './body';

let db: FiShakalDB;

beforeEach(async () => {
  db = new FiShakalDB(`body-${Math.random()}`);
  await db.open();
});

describe('recordBody', () => {
  it('stores weight against the local day', async () => {
    const r = await recordBody(db, { weightKg: 86, at: new Date(2026, 9, 6, 7, 0) });
    expect(r.dayKey).toBe('2026-10-06');
    expect(r.weightKg).toBe(86);
  });

  it('stores waist without weight', async () => {
    const r = await recordBody(db, { waistCm: 98 });
    expect(r.waistCm).toBe(98);
    expect(r.weightKg).toBeUndefined();
  });

  it('replaces an earlier reading on the same day', async () => {
    await recordBody(db, { weightKg: 86, at: new Date(2026, 9, 6, 7, 0) });
    await recordBody(db, { weightKg: 85.6, at: new Date(2026, 9, 6, 8, 0) });
    const rows = await db.bodyLogs.where('dayKey').equals('2026-10-06').toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].weightKg).toBe(85.6);
  });

  it('rejects an entry with no measurement', async () => {
    await expect(recordBody(db, {})).rejects.toThrow();
  });

  it('rejects an implausible weight', async () => {
    await expect(recordBody(db, { weightKg: 0 })).rejects.toThrow();
    await expect(recordBody(db, { weightKg: 700 })).rejects.toThrow();
  });
});

describe('bodyHistory', () => {
  it('returns most recent first', async () => {
    await recordBody(db, { weightKg: 86, at: new Date(2026, 9, 4, 7, 0) });
    await recordBody(db, { weightKg: 85, at: new Date(2026, 9, 6, 7, 0) });
    const rows = await bodyHistory(db);
    expect(rows[0].dayKey).toBe('2026-10-06');
  });

  it('respects the limit', async () => {
    for (let i = 1; i <= 5; i++) {
      await recordBody(db, { weightKg: 80 + i, at: new Date(2026, 9, i, 7, 0) });
    }
    expect(await bodyHistory(db, 3)).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/lib/db/body.test.ts
```

Expected: FAIL, cannot resolve `./body`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/db/body.ts`:

```typescript
import type { FiShakalDB } from './schema';
import type { BodyLog } from './types';
import { dayKeyOf } from '@/lib/time/day';
import { newId } from './repo';

const MIN_WEIGHT_KG = 20;
const MAX_WEIGHT_KG = 400;
const MIN_WAIST_CM = 30;
const MAX_WAIST_CM = 250;

export async function recordBody(
  database: FiShakalDB,
  input: { weightKg?: number; waistCm?: number; photo?: Blob; at?: Date },
): Promise<BodyLog> {
  if (input.weightKg === undefined && input.waistCm === undefined) {
    throw new RangeError('Record a weight, a waist measurement, or both.');
  }
  if (input.weightKg !== undefined &&
      (!Number.isFinite(input.weightKg) || input.weightKg < MIN_WEIGHT_KG || input.weightKg > MAX_WEIGHT_KG)) {
    throw new RangeError(`Weight must be between ${MIN_WEIGHT_KG} and ${MAX_WEIGHT_KG} kg.`);
  }
  if (input.waistCm !== undefined &&
      (!Number.isFinite(input.waistCm) || input.waistCm < MIN_WAIST_CM || input.waistCm > MAX_WAIST_CM)) {
    throw new RangeError(`Waist must be between ${MIN_WAIST_CM} and ${MAX_WAIST_CM} cm.`);
  }

  const at = input.at ?? new Date();
  const dayKey = dayKeyOf(at);

  // One reading per day. A second reading corrects the first rather than
  // adding a point, because daily weight noise is already large enough.
  const existing = await database.bodyLogs.where('dayKey').equals(dayKey).first();
  const row: BodyLog = {
    id: existing?.id ?? newId('body'),
    dayKey,
    loggedAt: at.getTime(),
    ...(input.weightKg !== undefined ? { weightKg: input.weightKg } : {}),
    ...(input.waistCm !== undefined ? { waistCm: input.waistCm } : {}),
  };
  await database.bodyLogs.put(row);
  return row;
}

export async function bodyHistory(database: FiShakalDB, limit = 90): Promise<BodyLog[]> {
  const rows = await database.bodyLogs.orderBy('dayKey').reverse().toArray();
  return rows.slice(0, limit);
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/lib/db/body.test.ts
```

Expected: PASS, 7 tests.

- [ ] **Step 5: Write the body page**

Create `src/app/body/page.tsx`:

```tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/schema';
import { recordBody, bodyHistory } from '@/lib/db/body';
import { formatDayLabel } from '@/lib/time/day';

export default function BodyPage() {
  const [weight, setWeight] = useState('');
  const [waist, setWaist] = useState('');
  const [error, setError] = useState<string | null>(null);
  const history = useLiveQuery(() => bodyHistory(db, 30), []) ?? [];

  async function save() {
    try {
      await recordBody(db, {
        ...(weight ? { weightKg: Number(weight) } : {}),
        ...(waist ? { waistCm: Number(waist) } : {}),
      });
      setWeight('');
      setWaist('');
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <main className="mx-auto min-h-dvh max-w-md">
      <header className="flex items-center justify-between border-b border-neutral-900 px-4 py-3">
        <h1 className="text-base font-medium text-neutral-100">Body</h1>
        <Link href="/" className="text-sm text-neutral-500">Done</Link>
      </header>

      <section className="flex items-end gap-3 p-4">
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="text-xs uppercase tracking-wide text-neutral-600">Weight kg</span>
          <input
            value={weight} onChange={(e) => setWeight(e.target.value)} inputMode="decimal"
            className="border-b border-neutral-800 bg-transparent py-2 text-base tabular-nums text-neutral-100 outline-none"
          />
        </label>
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="text-xs uppercase tracking-wide text-neutral-600">Waist cm</span>
          <input
            value={waist} onChange={(e) => setWaist(e.target.value)} inputMode="decimal"
            className="border-b border-neutral-800 bg-transparent py-2 text-base tabular-nums text-neutral-100 outline-none"
          />
        </label>
        <button
          onClick={() => void save()}
          className="rounded-full bg-neutral-100 px-4 py-2.5 text-sm font-medium text-neutral-950"
        >
          Save
        </button>
      </section>

      {error && <p className="px-4 text-sm text-amber-500">{error}</p>}

      <ul className="px-4">
        {history.map((row) => (
          <li key={row.id} className="flex justify-between border-b border-neutral-900 py-2.5 text-sm">
            <span className="text-neutral-400">{formatDayLabel(row.dayKey)}</span>
            <span className="tabular-nums text-neutral-300">
              {row.weightKg !== undefined && `${row.weightKg} kg`}
              {row.weightKg !== undefined && row.waistCm !== undefined && '  ·  '}
              {row.waistCm !== undefined && `${row.waistCm} cm`}
            </span>
          </li>
        ))}
      </ul>
    </main>
  );
}
```

- [ ] **Step 6: Link it from the day header**

In `src/components/DayHeader.tsx`, add a body link next to the settings link:

```tsx
        <Link href="/body" aria-label="Body" className="px-3 py-2 text-neutral-500">
          &#9878;
        </Link>
```

- [ ] **Step 7: Commit**

```bash
npm test && npm run lint && npm run build
git add -A
git commit -m "feat: body weight and waist logging

One reading per local day; a second reading on the same day corrects the
first rather than adding a point, since daily weight noise is already
larger than the signal being tracked.

Range validation rejects transposed or mistyped values at entry."
```

---

## Task 15: PWA install, offline shell, and final verification

**Files:**
- Create: `public/manifest.webmanifest`, `public/sw.js`, `public/icon-192.png`, `public/icon-512.png`, `src/components/RegisterSW.tsx`, `README.md`
- Modify: `src/app/layout.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: an installable, offline-capable app.

- [ ] **Step 1: Create the manifest**

Create `public/manifest.webmanifest`:

```json
{
  "name": "FiShakal",
  "short_name": "FiShakal",
  "description": "Log what you actually ate.",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#0a0a0a",
  "theme_color": "#0a0a0a",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
}
```

- [ ] **Step 2: Generate the icons**

Placeholder marks until a real one exists. Without them the browser offers no install prompt.

```bash
npm install --save-dev sharp
node -e "
const sharp = require('sharp');
const svg = (s) => Buffer.from(
  '<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"'+s+'\" height=\"'+s+'\">' +
  '<rect width=\"'+s+'\" height=\"'+s+'\" fill=\"#0a0a0a\"/>' +
  '<text x=\"50%\" y=\"50%\" dy=\"0.35em\" text-anchor=\"middle\" ' +
  'font-family=\"Helvetica,Arial,sans-serif\" font-weight=\"600\" ' +
  'font-size=\"'+Math.round(s*0.46)+'\" fill=\"#fafafa\">Fi</text></svg>'
);
for (const s of [192, 512]) {
  sharp(svg(s)).png().toFile('public/icon-'+s+'.png');
}
"
npm uninstall sharp
```

`sharp` is installed and removed in the same step so it does not become a project dependency for a one-off asset.

- [ ] **Step 3: Write the service worker**

Create `public/sw.js`. Hand-written rather than adding a PWA plugin: the whole requirement is "serve the shell when offline", and that is a dozen lines.

```javascript
const CACHE = 'fishakal-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(['/', '/settings', '/body', '/manifest.webmanifest'])),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
          }
          return res;
        })
        .catch(() => cached);
      // Cache first: the app shell is static and all data is local, so a
      // stale shell is never wrong and the app opens instantly offline.
      return cached || network;
    }),
  );
});
```

- [ ] **Step 4: Register the service worker**

Create `src/components/RegisterSW.tsx`:

```tsx
'use client';

import { useEffect } from 'react';

export function RegisterSW() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.error('Service worker registration failed', err);
    });
  }, []);
  return null;
}
```

- [ ] **Step 5: Wire it into the layout**

In `src/app/layout.tsx`, add to `metadata`:

```tsx
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'FiShakal', statusBarStyle: 'black-translucent' },
```

Import and render `<RegisterSW />` inside `<body>`, above `<Providers>`:

```tsx
import { RegisterSW } from '@/components/RegisterSW';
```

```tsx
        <RegisterSW />
```

- [ ] **Step 6: Write the README**

Create `README.md`:

```markdown
# FiShakal

Log what you actually ate.

A nutrition tracker for people who eat food cooked by someone else, in a
shared pot, in portions they did not weigh.

## What it is

- Three taps to log a meal: slot, dish, portion.
- Portions in whatever unit suits the moment: katori, ladle, fist, palm,
  your own photo, "less than usual", or grams.
- Works fully offline. No account, no server, no subscription.
- All data stays on your device. Export to a file whenever you want it
  elsewhere.

## Running it

```bash
npm install
npm run dev
```

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm test` | Unit tests |
| `npm run lint` | Lint, including the `src/lib` framework-free boundary |
| `npm run build` | Static export to `out/` |

## Layout

`src/lib/nutrition` and `src/lib/portions` are pure TypeScript and import
nothing from React, Next or Dexie, which is enforced by a lint rule.
Database access is confined to `src/lib/db`.

## Data sources

Ingredient values come from USDA FoodData Central (public domain, CC0).
Dish values are hand-authored. No other source is used. See
`docs/superpowers/specs/2026-10-06-fishakal-design.md` section 13.
```

- [ ] **Step 7: Verify installability and offline**

```bash
npm run build && npx serve out
```

In Chrome DevTools, Application panel: the manifest must parse with no errors, the service worker must show as activated, and an install prompt must be offered. Then tick Offline in the Network panel, reload, and confirm the app still opens and still logs a meal.

- [ ] **Step 8: Verify the spec's success criteria**

From spec §16. Record the result of each.

1. **Logging time.** Time three separate meals from cold start with a stopwatch. Median must be under 5 seconds.
2. **Three taps.** Count taps for a recurring dish. Must be exactly three.
3. **Accuracy.** Log a full day from `WEEK.md`, then hand-calculate the same day from `PLAN.md`. Totals must agree within 10%. If they do not, the seed values in `src/lib/db/seed-data.ts` are wrong, not the engine; fix the data.
4. **Offline.** Airplane mode, start to finish, including opening the app cold.
5. **Export round trip.** Export, clear site data, import, confirm an identical state.

Criterion 1 in the spec is fourteen consecutive days of real use. That is measured after shipping, not during this plan.

- [ ] **Step 9: Run everything one final time**

```bash
npm test && npm run lint && npm run build
```

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: PWA install, offline shell, and README

Hand-written service worker rather than a PWA plugin. The requirement is
to serve the app shell offline, which is a dozen lines; the plugins for
this are heavier and lag Next releases.

Cache-first is safe here because the shell is static and every byte of
user data lives in IndexedDB, so a stale shell is never stale data."
```

---

## End of Part 3

v1 is complete: an installable, offline nutrition tracker where a meal is three taps, with no account and no server.

## What this plan deliberately does not build

From spec §5, and listed here so an executor does not add them by reflex:

accounts, auth, any server, a hosted database, barcode scanning, workout tracking, community contributions, household mode, the Plan surface with protein-per-rupee, the INDB permission request, and any paid tier.

The Plan surface is the next milestone and needs the `price` field already present on `Ingredient`, plus a `PriceEntry` table. Nothing in v1 blocks it.
