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
