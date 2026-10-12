import { describe, it, expect } from 'vitest';
import { solve } from '../src/lib/solver.js';
import { auditSchedule, expectedResponseTotals } from './helpers/reference.js';

/**
 * Independent feasibility audit of the schedules the production solver emits:
 * every constraint is re-checked from the raw input, and the reported totals
 * are re-derived from the schedule itself (never from the solver's own sums).
 */
const base = {
  grid_available: [true, false, false, true, false, false, true, true, false, true],
  generator_capacity_kw: 100,
  fuel_budget_litres: 50,
  max_consecutive_dark: 2,
  fuel_table: [
    { load_kw: 30, litres_per_hour: 1.5 },
    { load_kw: 70, litres_per_hour: 3.2 },
    { load_kw: 100, litres_per_hour: 5.0 },
  ],
  shops: [
    { id: 'A', kw: 20, type: 'mandatory', value_per_slot: Array(10).fill(10) },
    { id: 'B', kw: 40, type: 'normal', value_per_slot: [5, 15, 25, 5, 20, 10, 5, 5, 30, 5] },
    { id: 'C', kw: 30, type: 'normal', value_per_slot: [10, 5, 10, 15, 5, 25, 10, 10, 5, 10] },
  ],
};

const cases = [
  ['sample day', base],
  ['tight fuel', { ...base, fuel_budget_litres: 15 }],
  ['zero fuel budget', { ...base, fuel_budget_litres: 0 }],
  ['all outage', { ...base, grid_available: Array(10).fill(false) }],
  ['no outage', { ...base, grid_available: Array(10).fill(true) }],
  ['no dark allowed', { ...base, max_consecutive_dark: 0, grid_available: Array(10).fill(false) }],
  ['never-dark limit', { ...base, max_consecutive_dark: 10, grid_available: Array(10).fill(false) }],
  ['capacity exactly at mandatory load', { ...base, generator_capacity_kw: 20, grid_available: Array(10).fill(false) }],
  ['capacity below mandatory load', { ...base, generator_capacity_kw: 10, grid_available: Array(10).fill(false) }],
];

describe('solver schedules are independently feasible', () => {
  for (const [name, input] of cases) {
    it(`audits: ${name}`, () => {
      const solved = solve(input);
      if (solved.status !== 'ok') {
        expect(['infeasible']).toContain(solved.status);
        return;
      }

      const audit = auditSchedule(input, solved.schedule);
      expect(audit.reasons, `${name} → ${audit.reasons.join('; ')}`).toEqual([]);
      expect(audit.feasible).toBe(true);

      // The solver's own totals must agree with the values re-derived from the
      // schedule, otherwise the API would report numbers the roster contradicts.
      expect(audit.value).toBe(solved.valueTotal);
      expect(audit.fuelHundredths).toBe(solved.fuelTotalHundredths);
    });
  }

  it('reports infeasible when the mandatory load cannot run during an outage', () => {
    const input = {
      ...base,
      grid_available: Array(10).fill(false),
      generator_capacity_kw: 10,
    };
    const solved = solve(input);
    expect(solved.status).toBe('infeasible');
    expect(solved.reason).toMatch(/capacity/i);
  });

  it('still solves when capacity is below the mandatory load but the grid covers every hour', () => {
    const input = { ...base, grid_available: Array(10).fill(true), generator_capacity_kw: 10 };
    const solved = solve(input);
    expect(solved.status).toBe('ok');
    expect(solved.fuelTotalHundredths).toBe(0);
    expect(solved.schedule).toEqual(Array(10).fill('GRID'));
  });

  it('is feasible with an empty shop list', () => {
    const input = { ...base, shops: [], grid_available: Array(10).fill(false) };
    const solved = solve(input);
    expect(solved.status).toBe('ok');
    expect(solved.valueTotal).toBe(0);
    expect(solved.fuelTotalHundredths).toBe(0);
  });
});

describe('audit helper sanity', () => {
  it('flags an over-capacity schedule', () => {
    const input = { ...base, generator_capacity_kw: 50, grid_available: Array(10).fill(false) };
    // mask 0b11 powers both normal shops (40+30) plus the 20 kW mandatory shop
    const audit = auditSchedule(input, Array(10).fill(0b11));
    expect(audit.feasible).toBe(false);
    expect(audit.reasons.some((r) => /capacity/.test(r))).toBe(true);
  });

  it('flags a dark streak longer than the limit', () => {
    const input = { ...base, max_consecutive_dark: 1, grid_available: Array(10).fill(false) };
    const audit = auditSchedule(input, Array(10).fill(0));
    expect(audit.feasible).toBe(false);
    expect(audit.reasons.some((r) => /in a row/.test(r))).toBe(true);
  });

  it('exposes the response totals it expects', () => {
    const input = { ...base };
    const solved = solve(input);
    const totals = expectedResponseTotals(input, solved.schedule);
    expect(totals.value).toBe(200);
    expect(totals.fuelHundredths).toBe(2500);
    expect(totals.darkHours).toEqual({ A: 0, B: 0, C: 0 });
  });
});
