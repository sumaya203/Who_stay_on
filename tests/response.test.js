import { describe, it, expect } from 'vitest';
import { solve } from '../src/lib/solver.js';
import { buildResponse } from '../src/lib/responseBuilder.js';
import { getFuelForLoad } from '../src/lib/calculations.js';
import { auditSchedule } from './helpers/reference.js';

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
    { id: 'A_MANDATORY', kw: 20, type: 'mandatory', value_per_slot: Array(10).fill(10) },
    { id: 'B_NORMAL', kw: 40, type: 'normal', value_per_slot: [5, 15, 25, 5, 20, 10, 5, 5, 30, 5] },
    { id: 'C_NORMAL', kw: 30, type: 'normal', value_per_slot: [10, 5, 10, 15, 5, 25, 10, 10, 5, 10] },
  ],
};

const build = (input) => buildResponse(input, solve(input));

describe('fuel table semantics', () => {
  it('is a step function: a load is billed at the first step at or above it', () => {
    expect(getFuelForLoad(0, base.fuel_table)).toBe(0);
    expect(getFuelForLoad(1, base.fuel_table)).toBe(150);
    expect(getFuelForLoad(30, base.fuel_table)).toBe(150);
    expect(getFuelForLoad(31, base.fuel_table)).toBe(320);
    expect(getFuelForLoad(70, base.fuel_table)).toBe(320);
    expect(getFuelForLoad(71, base.fuel_table)).toBe(500);
    expect(getFuelForLoad(100, base.fuel_table)).toBe(500);
  });

  it('cannot be billed above the covered range', () => {
    expect(getFuelForLoad(101, base.fuel_table)).toBe(Infinity);
  });
});

describe('response builder', () => {
  it('reproduces the documented sample totals', () => {
    const data = build(base);
    expect(data.value_total).toBe(200);
    expect(data.fuel_total_litres).toBe(25);
    expect(data.dark_hours).toEqual({ A_MANDATORY: 0, B_NORMAL: 0, C_NORMAL: 0 });
    expect(Object.keys(data.roster)).toEqual(['slot_1', 'slot_2', 'slot_4', 'slot_5', 'slot_8']);
  });

  it('publishes totals that the roster itself reproduces', () => {
    const input = { ...base, fuel_budget_litres: 15 };
    const data = build(input);
    const solved = solve(input);

    let value = 0;
    let fuelHundredths = 0;
    for (const [slotKey, slot] of Object.entries(data.roster)) {
      const t = Number(slotKey.split('_')[1]);
      let load = 0;
      for (const id of slot.powered) {
        const shop = input.shops.find((s) => s.id === id);
        load += shop.kw;
        value += shop.value_per_slot[t];
      }
      fuelHundredths += getFuelForLoad(load, input.fuel_table);
    }

    expect(value).toBe(data.value_total);
    expect(fuelHundredths).toBe(Math.round(data.fuel_total_litres * 100));
    expect(value).toBe(solved.valueTotal);
  });

  it('always powers every mandatory shop during an outage', () => {
    const input = { ...base, fuel_budget_litres: 12, shops: [
      ...base.shops,
      { id: 'D_MANDATORY', kw: 10, type: 'mandatory', value_per_slot: Array(10).fill(3) },
    ] };
    const data = build(input);
    for (const slot of Object.values(data.roster)) {
      expect(slot.powered).toContain('A_MANDATORY');
      expect(slot.powered).toContain('D_MANDATORY');
    }
  });

  it('never schedules more than the generator capacity', () => {
    const input = { ...base, fuel_budget_litres: 40, grid_available: Array(10).fill(false) };
    const data = build(input);
    for (const [slotKey, slot] of Object.entries(data.roster)) {
      const t = Number(slotKey.split('_')[1]);
      const load = slot.powered.reduce(
        (sum, id) => sum + input.shops.find((s) => s.id === id).kw,
        0
      );
      expect(load, `slot ${t}`).toBeLessThanOrEqual(input.generator_capacity_kw);
    }
  });

  it('gives every dark entry a non-empty explanation', () => {
    const data = build({ ...base, fuel_budget_litres: 12 });
    let darkCount = 0;
    for (const slot of Object.values(data.roster)) {
      for (const entry of slot.dark) {
        darkCount += 1;
        expect(typeof entry.reason).toBe('string');
        expect(entry.reason.length).toBeGreaterThan(20);
      }
    }
    expect(darkCount).toBeGreaterThan(0);
  });

  it('explains capacity-bound sheds with the real numbers', () => {
    // 50 kW cannot host the 20 kW mandatory shop together with either normal
    // shop (40 kW / 35 kW), so both are shed for a capacity reason whenever the
    // mains are down — and the outage runs stay inside the dark limit.
    const input = {
      ...base,
      generator_capacity_kw: 50,
      shops: [
        { id: 'A_MANDATORY', kw: 20, type: 'mandatory', value_per_slot: Array(10).fill(10) },
        { id: 'B_NORMAL', kw: 40, type: 'normal', value_per_slot: Array(10).fill(30) },
        { id: 'C_NORMAL', kw: 35, type: 'normal', value_per_slot: Array(10).fill(20) },
      ],
    };
    const data = build(input);
    expect(data.status).toBe('ok');
    const reasons = Object.values(data.roster).flatMap((slot) => slot.dark.map((d) => d.reason));
    expect(reasons.length).toBe(input.grid_available.filter((g) => g === false).length * 2);
    for (const reason of reasons) {
      expect(reason).toMatch(/past the generator's 50 kW capacity/);
    }
  });

  it('explains fuel-bound sheds with the marginal litres', () => {
    // 30 L lets the 40 kW shop run six hours; the rest of the day it is shed
    // because powering it would need more diesel than the day has left.
    const input = {
      ...base,
      fuel_budget_litres: 30,
      max_consecutive_dark: 9,
      grid_available: Array(10).fill(false),
      shops: [base.shops[1]],
    };
    const data = build(input);
    const reasons = Object.values(data.roster).flatMap((slot) => slot.dark.map((d) => d.reason));
    expect(reasons.length).toBeGreaterThan(0);
    expect(reasons.some((r) => /diesel budget is the binding constraint/.test(r))).toBe(true);
  });

  it('explains zero-value sheds without blaming fuel or capacity', () => {
    const input = {
      ...base,
      grid_available: Array(10).fill(false),
      fuel_budget_litres: 50,
      // A limit that spans the whole outage day, otherwise the limit itself
      // forces the 0-value shop back on and the shed hours are limit-driven.
      max_consecutive_dark: 10,
      shops: [
        { id: 'A', kw: 20, type: 'mandatory', value_per_slot: Array(10).fill(10) },
        { id: 'Z', kw: 30, type: 'normal', value_per_slot: Array(10).fill(0) },
      ],
    };
    const data = build(input);
    const reasons = Object.values(data.roster).flatMap((slot) => slot.dark.map((d) => d.reason));
    expect(reasons.length).toBe(10);
    for (const reason of reasons) expect(reason).toMatch(/0 value/);
  });

  it('keeps the dark-streak limit out of the shed explanations it does not cause', () => {
    // With max_consecutive_dark = 2 a 0-value shop must come back on every third
    // slot, so some of its dark hours are limit-driven rather than value-driven.
    const input = {
      ...base,
      grid_available: Array(10).fill(false),
      max_consecutive_dark: 2,
      shops: [
        { id: 'A', kw: 20, type: 'mandatory', value_per_slot: Array(10).fill(10) },
        { id: 'Z', kw: 30, type: 'normal', value_per_slot: Array(10).fill(0) },
      ],
    };
    const data = build(input);
    expect(data.status).toBe('ok');
    expect(data.dark_hours.Z).toBe(7);
    expect(Object.values(data.roster).reduce((n, slot) => n + slot.powered.length, 0)).toBe(13);
  });

  it('marks proven results and never claims a proof it skipped', () => {
    const infeasible = buildResponse(base, { status: 'infeasible', reason: 'nope', proven: false });
    expect(infeasible.status).toBe('infeasible');
    expect(infeasible.proven).toBe(false);
    expect(infeasible.roster).toEqual({});
    expect(infeasible.value_total).toBe(0);
    expect(infeasible.fuel_total_litres).toBe(0);
    expect(infeasible.dark_hours).toEqual({});
  });
});

describe('end-to-end agreement on the sample configuration', () => {
  it('matches the schedule audit exactly', () => {
    const solved = solve(base);
    const audit = auditSchedule(base, solved.schedule);
    const data = buildResponse(base, solved);
    expect(audit.feasible).toBe(true);
    expect(audit.value).toBe(data.value_total);
    expect(audit.fuelHundredths).toBe(Math.round(data.fuel_total_litres * 100));
    expect(audit.darkHours).toEqual(data.dark_hours);
  });

  it('holds for a batch of adverse configurations', () => {
    const configurations = [
      { fuel_budget_litres: 0.01 },
      { fuel_budget_litres: 14.99 },
      { fuel_budget_litres: 15 },
      { fuel_budget_litres: 15.01 },
      { max_consecutive_dark: 0 },
      { max_consecutive_dark: 10 },
      { generator_capacity_kw: 20 },
      { generator_capacity_kw: 21 },
      { grid_available: Array(10).fill(false) },
      { grid_available: Array(10).fill(true) },
      { grid_available: [false, false, false, false, false, false, false, false, false, false], max_consecutive_dark: 1 },
    ];
    for (const patch of configurations) {
      const input = { ...base, ...patch };
      const solved = solve(input);
      const data = buildResponse(input, solved);
      const label = JSON.stringify(patch);
      if (solved.status === 'infeasible') {
        expect(data.status, label).toBe('infeasible');
        expect(data.roster, label).toEqual({});
        continue;
      }
      expect(data.status, label).toBe('ok');
      const audit = auditSchedule(input, solved.schedule);
      expect(audit.reasons, label).toEqual([]);
      expect(audit.value, label).toBe(data.value_total);
      expect(audit.fuelHundredths, label).toBe(Math.round(data.fuel_total_litres * 100));
      expect(audit.darkHours, label).toEqual(data.dark_hours);
    }
  });
});
