import { describe, it, expect } from 'vitest';
import { solve } from '../src/lib/solver.js';
import { buildResponse } from '../src/lib/responseBuilder.js';
import {
  buildModel,
  errorLines,
  fmtLitres,
  fmtNumber,
  fmtPct,
  parseConfig,
  reasonTag,
  slotLabel,
  slotRange,
  summarizeConfig,
} from '../src/app/components/analytics.js';

const input = {
  grid_available: [true, false, false, true, false, false, true, true, false, true],
  generator_capacity_kw: 100,
  fuel_budget_litres: 30,
  max_consecutive_dark: 1,
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

const response = buildResponse(input, solve(input));
const model = buildModel(input, response);

describe('configuration parsing (client side)', () => {
  it('labels the ten slots 10:00 through 19:00', () => {
    expect(slotLabel(0)).toBe('10:00');
    expect(slotLabel(9)).toBe('19:00');
    expect(slotRange(0)).toBe('10:00–11:00');
    expect(slotRange(9)).toBe('19:00–20:00');
  });

  it('reports an empty editor, bad syntax and non-object JSON distinctly', () => {
    expect(parseConfig('')).toMatchObject({ ok: false, empty: true });
    expect(parseConfig('   ')).toMatchObject({ ok: false, empty: true });
    expect(parseConfig('{oops').ok).toBe(false);
    expect(parseConfig('[1,2,3]')).toMatchObject({ ok: false });
    expect(parseConfig('null')).toMatchObject({ ok: false });
    expect(parseConfig('{"shops":[]}')).toMatchObject({ ok: true });
  });

  it('summarises only the facts present in the configuration', () => {
    expect(summarizeConfig(input)).toEqual({
      shopCount: 3,
      mandatoryCount: 1,
      normalCount: 2,
      outageHours: 5,
      gridHours: 5,
      capacityKw: 100,
      fuelBudget: 30,
      maxConsecutiveDark: 1,
      fuelTableSteps: 3,
      totalDemandKw: 90,
    });
    expect(summarizeConfig({})).toMatchObject({ shopCount: 0, outageHours: 0, capacityKw: null });
    expect(summarizeConfig(null)).toBeNull();
  });
});

describe('view model agrees with the API response', () => {
  it('lays out ten hourly slots with the five outage hours', () => {
    expect(model.hours).toHaveLength(10);
    expect(model.outageHours).toHaveLength(5);
    expect(model.gridHours).toHaveLength(5);
    expect(model.hours[0]).toMatchObject({ label: '10:00', gridAvailable: true, outage: false });
  });

  it('burns no diesel and draws no load on grid hours', () => {
    for (const hour of model.gridHours) {
      expect(hour.fuelLitres).toBe(0);
      expect(hour.loadKw).toBe(0);
      expect(hour.cumulativeLitres).toBe(hour.cumulativeLitres);
    }
  });

  it('reproduces the response totals from the schedule', () => {
    expect(model.metrics.valueSum).toBe(response.value_total);
    expect(model.metrics.fuelSum).toBe(response.fuel_total_litres);
    expect(model.metrics.fuelTotal).toBe(response.fuel_total_litres);
    expect(model.hours.at(-1).cumulativeLitres).toBe(response.fuel_total_litres);
    expect(model.metrics.reconciles).toBe(true);
  });

  it('keeps the fuel arithmetic closed against the configured budget', () => {
    expect(model.metrics.budget).toBe(30);
    expect(model.metrics.fuelRemaining + model.metrics.fuelTotal).toBeCloseTo(30, 10);
    expect(model.metrics.budgetUsedPct).toBeLessThanOrEqual(1);
  });

  it('never reports a load above capacity', () => {
    for (const hour of model.outageHours) {
      expect(hour.loadKw).toBeLessThanOrEqual(100);
      expect(hour.headroomKw).toBeGreaterThanOrEqual(0);
    }
  });

  it('matches per-shop dark hours with the response', () => {
    for (const shop of model.shopStats) {
      expect(shop.darkHours).toBe(response.dark_hours[shop.id]);
      const darkFromHours = model.outageHours.filter((h) => h.dark.includes(shop.id)).length;
      expect(shop.darkHours).toBe(darkFromHours);
      expect(shop.poweredOutage + shop.darkHours).toBe(model.outageHours.length);
    }
  });

  it('reads the mandatory flag straight from the configuration', () => {
    expect(model.shopStats.map((s) => s.type)).toEqual(['mandatory', 'normal', 'normal']);
  });
});

describe('view model degrades safely', () => {
  it('carries no result metrics before a run', () => {
    const preRun = buildModel(input, null);
    expect(preRun.solved).toBe(false);
    expect(preRun.metrics.valueTotal).toBeNull();
    expect(preRun.metrics.fuelTotal).toBeNull();
    expect(preRun.metrics.totalDarkHours).toBeNull();
    expect(preRun.hours).toHaveLength(10);
    expect(preRun.shopStats.every((s) => s.darkHours === null)).toBe(true);
  });

  it('handles an infeasible response without inventing numbers', () => {
    const infeasible = buildModel(input, { status: 'infeasible', reason: 'nope', roster: {}, value_total: 0, fuel_total_litres: 0, dark_hours: {} });
    expect(infeasible.solved).toBe(false);
    expect(infeasible.metrics.valueTotal).toBeNull();
    expect(infeasible.outageHours.every((h) => h.powered.length === 0)).toBe(true);
  });

  it('keeps the layout empty when the configuration cannot be parsed', () => {
    const empty = buildModel(null, null);
    expect(empty.hours).toEqual([]);
    expect(empty.outageHours).toEqual([]);
    expect(empty.metrics.outageHourCount).toBe(0);
    expect(empty.metrics.reconciles).toBe(false);
  });

  it('survives a zero capacity without dividing by zero', () => {
    const zero = buildModel({ ...input, generator_capacity_kw: 0 }, null);
    expect(zero.capacity).toBe(0);
    for (const hour of zero.hours) expect(Number.isFinite(hour.loadPct)).toBe(true);
  });

  it('ignores unknown shop ids coming back from the API', () => {
    const polluted = buildModel(input, {
      ...response,
      roster: { slot_1: { powered: ['A', 'GHOST'], dark: [{ id: 'GHOST', reason: 'x' }] } },
    });
    const hour = polluted.outageHours.find((h) => h.t === 1);
    expect(hour.powered).toEqual(['A']);
    expect(hour.dark).toEqual([]);
  });
});

describe('formatting helpers', () => {
  it('renders numbers, litres, percentages and placeholders', () => {
    expect(fmtNumber(1234)).toBe('1,234');
    expect(fmtNumber(null)).toBe('—');
    expect(fmtLitres(25)).toBe('25');
    expect(fmtLitres(20.1)).toBe('20.10');
    expect(fmtLitres(undefined)).toBe('—');
    expect(fmtPct(0.5)).toBe('50%');
    expect(fmtPct(Number.NaN)).toBe('—');
  });

  it('turns an error payload into lines and tolerates anything', () => {
    expect(errorLines(null)).toEqual([]);
    expect(errorLines(['a', 'b'])).toEqual(['a', 'b']);
    expect(errorLines('a\n b \n\n')).toEqual(['a', 'b']);
  });

  it('tags engine reasons without inventing new logic', () => {
    expect(reasonTag('past the generator\'s 100 kW capacity.')).toMatchObject({ tone: 'grid' });
    expect(reasonTag("The day's diesel budget is the binding constraint")).toMatchObject({ tone: 'amber' });
    expect(reasonTag('It offers 0 value in this slot')).toMatchObject({ tone: 'mute' });
    expect(reasonTag('Mandatory shop (should never be dark in a feasible solution)')).toMatchObject({ tone: 'volt' });
    expect(reasonTag("Kept dark to maximise the day's total value")).toMatchObject({ label: 'Value trade-off' });
  });
});
