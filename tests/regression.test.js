import { describe, it, expect } from 'vitest';
import { solve } from '../src/lib/solver.js';
import { buildResponse } from '../src/lib/responseBuilder.js';
import { auditSchedule } from './helpers/reference.js';

/**
 * Regression: this 12-shop, all-outage instance with a tight diesel budget is
 * feasible — a pruned probe finds a legal schedule in 22 nodes — but the
 * original search spent its whole 8.5 s window without finding one and answered
 * `status: "infeasible"`. The response now finds a feasible schedule, and the
 * schedule is audited here against the raw constraints.
 */
const tightTwelveShop = (budget) => ({
  grid_available: Array(10).fill(false),
  generator_capacity_kw: 120,
  fuel_budget_litres: budget,
  max_consecutive_dark: 3,
  fuel_table: [
    { load_kw: 20, litres_per_hour: 1.1 },
    { load_kw: 60, litres_per_hour: 3.4 },
    { load_kw: 120, litres_per_hour: 6.2 },
  ],
  shops: Array.from({ length: 12 }, (_, i) => ({
    id: `S${i}`,
    kw: 5 + (i % 4) * 5,
    type: i < 3 ? 'mandatory' : 'normal',
    value_per_slot: Array.from({ length: 10 }, (_, t) => (i * 7 + t * 13) % 40),
  })),
});

describe('regression: tight instances are no longer reported infeasible', () => {
  it('solves the 12-shop / 40 L instance that used to time out as "infeasible"', () => {
    const input = tightTwelveShop(40);
    const solved = solve(input);

    expect(solved.status).toBe('ok');
    const audit = auditSchedule(input, solved.schedule);
    expect(audit.reasons).toEqual([]);
    expect(audit.value).toBe(solved.valueTotal);
    expect(audit.fuelHundredths).toBe(solved.fuelTotalHundredths);
    expect(audit.fuelHundredths).toBeLessThanOrEqual(4000);
  }, 30000);

  it('still proves the genuinely impossible variants impossible', () => {
    // 25 L cannot carry 30 kW of mandatory load for ten hours in this table,
    // which the fuel floor now proves instead of guessing after a timeout.
    for (const [budget, maxDark] of [[25, 5], [10, 0], [40, 0]]) {
      const input = { ...tightTwelveShop(budget), max_consecutive_dark: maxDark };
      const solved = solve(input);
      expect(solved.status, `budget ${budget} / maxDark ${maxDark}`).toBe('infeasible');
      expect(solved.proven).toBe(true);
    }
  }, 30000);

  it('keeps the value unchanged on instances the old search already solved', () => {
    // Same instance with room to spare: the added pruning must not alter results.
    const input = { ...tightTwelveShop(200), max_consecutive_dark: 2 };
    const solved = solve(input);
    const data = buildResponse(input, solved);
    expect(solved.status).toBe('ok');
    expect(solved.isOptimal).toBe(true);
    expect(data.status).toBe('ok');
    expect(auditSchedule(input, solved.schedule).value).toBe(data.value_total);
  }, 30000);
});
