import { describe, it, expect } from 'vitest';
import { validateRequest } from '../src/lib/validation.js';

const valid = () => ({
  grid_available: [true, false, false, true, false, false, true, true, false, true],
  generator_capacity_kw: 100,
  fuel_budget_litres: 50,
  max_consecutive_dark: 2,
  fuel_table: [
    { load_kw: 30, litres_per_hour: 1.5 },
    { load_kw: 70, litres_per_hour: 3.2 },
    { load_kw: 100, litres_per_hour: 5.0 },
  ],
  shops: [{ id: 'A', kw: 20, type: 'mandatory', value_per_slot: Array(10).fill(10) }],
});

const mutate = (patch) => ({ ...valid(), ...patch });

describe('validation accepts specification-shaped input', () => {
  it('accepts the reference payload', () => {
    expect(validateRequest(valid())).toEqual({ valid: true, errors: [] });
  });

  it('accepts an empty shop list', () => {
    expect(validateRequest(mutate({ shops: [] })).valid).toBe(true);
  });

  it('accepts a zero fuel budget, a zero dark limit and zero values', () => {
    const body = mutate({
      fuel_budget_litres: 0,
      max_consecutive_dark: 0,
      shops: [{ id: 'A', kw: 20, type: 'normal', value_per_slot: Array(10).fill(0) }],
    });
    expect(validateRequest(body)).toEqual({ valid: true, errors: [] });
  });

  it('accepts an all-outage and an all-grid day', () => {
    expect(validateRequest(mutate({ grid_available: Array(10).fill(false) })).valid).toBe(true);
    expect(validateRequest(mutate({ grid_available: Array(10).fill(true) })).valid).toBe(true);
  });

  it('accepts exactly 12 shops (the documented maximum)', () => {
    const shops = Array.from({ length: 12 }, (_, i) => ({
      id: `S${i}`,
      kw: 5,
      type: i % 2 ? 'normal' : 'mandatory',
      value_per_slot: Array(10).fill(7),
    }));
    expect(validateRequest(mutate({ shops })).valid).toBe(true);
  });

  it('ignores unknown extra fields instead of rejecting them', () => {
    const body = mutate({ note: 'judge extra field', nested: { a: 1 } });
    expect(validateRequest(body).valid).toBe(true);
  });

  it('accepts large integer loads and values', () => {
    const body = mutate({
      generator_capacity_kw: 100000,
      fuel_budget_litres: 999999.99,
      fuel_table: [{ load_kw: 100000, litres_per_hour: 5000 }],
      shops: [{ id: 'BIG', kw: 100000, type: 'normal', value_per_slot: Array(10).fill(1000000) }],
    });
    expect(validateRequest(body)).toEqual({ valid: true, errors: [] });
  });
});

describe('validation rejects malformed input with usable messages', () => {
  const cases = [
    ['non-object body', null, /JSON object/],
    ['array body', [], /JSON object/],
    ['missing everything', {}, /grid_available/],
    ['nine grid slots', mutate({ grid_available: Array(9).fill(true) }), /exactly 10/],
    ['0/1 instead of booleans', mutate({ grid_available: Array(10).fill(1) }), /booleans/],
    ['null grid entry', mutate({ grid_available: [true, null, true, true, true, true, true, true, true, true] }), /booleans/],
    ['zero capacity', mutate({ generator_capacity_kw: 0 }), /positive integer/],
    ['negative capacity', mutate({ generator_capacity_kw: -5 }), /positive integer/],
    ['fractional capacity', mutate({ generator_capacity_kw: 12.5 }), /positive integer/],
    ['capacity as string', mutate({ generator_capacity_kw: '100' }), /positive integer/],
    ['negative fuel budget', mutate({ fuel_budget_litres: -1 }), /nonnegative/],
    ['fuel budget as string', mutate({ fuel_budget_litres: '50' }), /nonnegative/],
    ['fuel budget with 3 decimals', mutate({ fuel_budget_litres: 10.123 }), /2 decimal places/],
    ['null fuel budget', mutate({ fuel_budget_litres: null }), /nonnegative/],
    ['negative dark limit', mutate({ max_consecutive_dark: -1 }), /nonnegative integer/],
    ['fractional dark limit', mutate({ max_consecutive_dark: 1.5 }), /nonnegative integer/],
    ['empty fuel table', mutate({ fuel_table: [] }), /non-empty/],
    ['fuel table not an array', mutate({ fuel_table: {} }), /non-empty/],
    ['null fuel table entry', mutate({ fuel_table: [{ load_kw: 10, litres_per_hour: 1 }, null] }), /must be an object/],
    ['zero load in table', mutate({ fuel_table: [{ load_kw: 0, litres_per_hour: 1 }] }), /positive integer/],
    ['descending load in table', mutate({ fuel_table: [{ load_kw: 50, litres_per_hour: 1 }, { load_kw: 20, litres_per_hour: 2 }] }), /strictly increasing/],
    ['negative burn rate', mutate({ fuel_table: [{ load_kw: 100, litres_per_hour: -1 }] }), /nonnegative/],
    ['burn rate with 3 decimals', mutate({ fuel_table: [{ load_kw: 100, litres_per_hour: 1.234 }] }), /decimal precision/],
    ['table that never reaches capacity', mutate({ fuel_table: [{ load_kw: 30, litres_per_hour: 1.5 }] }), /coverage/],
    ['shops not an array', mutate({ shops: {} }), /shops must be an array/],
    ['null shop entry', mutate({ shops: [null] }), /must be an object/],
    ['13 shops', mutate({ shops: Array.from({ length: 13 }, (_, i) => ({ id: `S${i}`, kw: 5, type: 'normal', value_per_slot: Array(10).fill(1) })) }), /at most 12/],
    ['duplicate ids', mutate({ shops: [
      { id: 'A', kw: 5, type: 'normal', value_per_slot: Array(10).fill(1) },
      { id: 'A', kw: 5, type: 'normal', value_per_slot: Array(10).fill(1) },
    ] }), /duplicate shop id/],
    ['blank id', mutate({ shops: [{ id: '   ', kw: 5, type: 'normal', value_per_slot: Array(10).fill(1) }] }), /nonblank string/],
    ['numeric id', mutate({ shops: [{ id: 7, kw: 5, type: 'normal', value_per_slot: Array(10).fill(1) }] }), /nonblank string/],
    ['zero kw', mutate({ shops: [{ id: 'A', kw: 0, type: 'normal', value_per_slot: Array(10).fill(1) }] }), /positive integer/],
    ['negative kw', mutate({ shops: [{ id: 'A', kw: -10, type: 'normal', value_per_slot: Array(10).fill(1) }] }), /positive integer/],
    ['fractional kw', mutate({ shops: [{ id: 'A', kw: 7.5, type: 'normal', value_per_slot: Array(10).fill(1) }] }), /positive integer/],
    ['unknown type', mutate({ shops: [{ id: 'A', kw: 10, type: 'vip', value_per_slot: Array(10).fill(1) }] }), /must be 'mandatory' or 'normal'/],
    ['missing type', mutate({ shops: [{ id: 'A', kw: 10, value_per_slot: Array(10).fill(1) }] }), /must be 'mandatory' or 'normal'/],
    ['nine values', mutate({ shops: [{ id: 'A', kw: 10, type: 'normal', value_per_slot: Array(9).fill(1) }] }), /exactly 10/],
    ['negative value', mutate({ shops: [{ id: 'A', kw: 10, type: 'normal', value_per_slot: [0, 0, 0, 0, 0, 0, 0, 0, 0, -1] }] }), /nonnegative integer/],
    ['fractional value', mutate({ shops: [{ id: 'A', kw: 10, type: 'normal', value_per_slot: [0, 0, 0, 0, 0, 0, 0, 0, 0, 1.5] }] }), /nonnegative integer/],
    ['null value entry', mutate({ shops: [{ id: 'A', kw: 10, type: 'normal', value_per_slot: [0, 0, 0, 0, 0, 0, 0, 0, 0, null] }] }), /nonnegative integer/],
  ];

  for (const [name, body, pattern] of cases) {
    it(`rejects: ${name}`, () => {
      const result = validateRequest(body);
      expect(result.valid).toBe(false);
      expect(result.errors.join(' | ')).toMatch(pattern);
    });
  }

  it('rejects values that JSON can carry but arithmetic cannot (1e999 -> Infinity)', () => {
    const parsed = JSON.parse('{"grid_available":[true,true,true,true,true,true,true,true,true,true],"generator_capacity_kw":100,"fuel_budget_litres":1e999,"max_consecutive_dark":2,"fuel_table":[{"load_kw":100,"litres_per_hour":1}],"shops":[]}');
    expect(Number.isFinite(parsed.fuel_budget_litres)).toBe(false);
    expect(validateRequest(parsed).valid).toBe(false);

    const table = JSON.parse('{"grid_available":[true,true,true,true,true,true,true,true,true,true],"generator_capacity_kw":100,"fuel_budget_litres":10,"max_consecutive_dark":2,"fuel_table":[{"load_kw":100,"litres_per_hour":1e999}],"shops":[]}');
    expect(validateRequest(table).valid).toBe(false);
  });

  it('reports every problem at once instead of stopping at the first', () => {
    const result = validateRequest({ grid_available: [], generator_capacity_kw: 0, shops: 'nope' });
    expect(result.errors.length).toBeGreaterThanOrEqual(4);
  });
});
