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

  it('resolves a vessel portion carrying a vesselKey from its stored grams, unchanged', () => {
    const p = portion({ kind: 'vessel', label: '1 katori', grams: 150, vesselKey: 'katori' });
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

  it('throws on an unrecognised portion kind', () => {
    const p = { ...portion({}), kind: 'oz' } as unknown as PortionDef;
    expect(() => resolveGrams(p, 1)).toThrow(PortionResolutionError);
  });

  it('throws on an empty portion kind', () => {
    const p = { ...portion({}), kind: '' } as unknown as PortionDef;
    expect(() => resolveGrams(p, 1)).toThrow(PortionResolutionError);
  });

  it('multiplies a relative portion by count', () => {
    const p = portion({ kind: 'relative', label: 'usual', grams: 0, multiplier: RELATIVE_MULTIPLIERS.usual });
    expect(resolveGrams(p, 3, { defaultPortionGrams: 100 })).toBeCloseTo(300, 10);
  });
});
