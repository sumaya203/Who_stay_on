import { describe, it, expect } from 'vitest';
import { solve } from '../src/lib/solver.js';
import { validateRequest } from '../src/lib/validation.js';
import { buildResponse } from '../src/lib/responseBuilder.js';

describe('Validation', () => {
  it('rejects invalid max decimals', () => {
    const data = {
      grid_available: Array(10).fill(false),
      generator_capacity_kw: 100,
      fuel_budget_litres: 10.123,
      max_consecutive_dark: 2,
      fuel_table: [{ load_kw: 100, litres_per_hour: 5 }],
      shops: []
    };
    const v = validateRequest(data);
    expect(v.valid).toBe(false);
    expect(v.errors[0]).toContain("more than 2 decimal places");
  });
});

describe('Solver', () => {
  it('solves simple grid fully available scenario', () => {
    const data = {
      grid_available: Array(10).fill(true),
      generator_capacity_kw: 100,
      fuel_budget_litres: 100,
      max_consecutive_dark: 2,
      fuel_table: [{ load_kw: 100, litres_per_hour: 5 }],
      shops: [
        { id: "A", kw: 50, type: "normal", value_per_slot: Array(10).fill(10) }
      ]
    };
    const s = solve(data);
    expect(s.status).toBe('ok');
    expect(s.valueTotal).toBe(0);
    expect(s.fuelTotalHundredths).toBe(0);
    const resp = buildResponse(data, s);
    expect(Object.keys(resp.roster).length).toBe(0);
  });

  it('rejects infeasible mandatory capacity', () => {
    const data = {
      grid_available: Array(10).fill(false),
      generator_capacity_kw: 10,
      fuel_budget_litres: 100,
      max_consecutive_dark: 2,
      fuel_table: [{ load_kw: 100, litres_per_hour: 5 }],
      shops: [
        { id: "A", kw: 50, type: "mandatory", value_per_slot: Array(10).fill(10) }
      ]
    };
    const s = solve(data);
    expect(s.status).toBe('infeasible');
  });

  it('honors consecutive dark limit', () => {
    const data = {
      grid_available: Array(10).fill(false),
      generator_capacity_kw: 10, // Can only power one
      fuel_budget_litres: 100,
      max_consecutive_dark: 1, // Max 1 dark
      fuel_table: [{ load_kw: 100, litres_per_hour: 5 }],
      shops: [
        { id: "A", kw: 10, type: "normal", value_per_slot: Array(10).fill(10) },
        { id: "B", kw: 10, type: "normal", value_per_slot: Array(10).fill(10) },
        { id: "C", kw: 10, type: "normal", value_per_slot: Array(10).fill(10) }
      ]
    };
    // 3 shops, max capacity 1 (only 1 powered per slot). So 2 are dark per slot.
    // Over 10 slots, if max_consecutive_dark = 1, we must power each shop every other slot.
    // But we can only power 1 per slot! Impossible for 3 shops to all be powered every other slot.
    const s = solve(data);
    expect(s.status).toBe('infeasible');
  });

  it('optimizes value under capacity and fuel', () => {
    const data = {
      grid_available: Array(10).fill(false), // 10 outage hours
      generator_capacity_kw: 20,
      fuel_budget_litres: 30, // 30 litres max
      max_consecutive_dark: 10,
      fuel_table: [
        { load_kw: 10, litres_per_hour: 2.5 },
        { load_kw: 20, litres_per_hour: 5.0 }
      ],
      shops: [
        { id: "A", kw: 10, type: "normal", value_per_slot: Array(10).fill(10) },
        { id: "B", kw: 10, type: "normal", value_per_slot: Array(10).fill(20) }
      ]
    };
    // Can power both (20kW) -> uses 5.0L per hr. Max fuel 30L -> can power both for 6 hours, then 0.
    // Value: 6 * 30 = 180. Wait, could we power B for 10 hours? 10kW -> 2.5L/hr. 10 * 2.5 = 25L. Value: 10 * 20 = 200.
    // Best is to power B alone!
    const s = solve(data);
    expect(s.status).toBe('ok');
    expect(s.valueTotal).toBe(220); // The solver optimally mixes A+B and B-only to use exactly 30L fuel.
    expect(s.fuelTotalHundredths).toBe(3000);
  });
});
