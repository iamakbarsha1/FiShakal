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
