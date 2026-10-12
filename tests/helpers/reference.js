/**
 * Independent reference model used ONLY by the test suite.
 *
 * It is deliberately written a different way from `src/lib/solver.js`:
 * a plain memoised recursion that returns the best (value, fuel) pair for a
 * state, with no branch-and-bound ordering, no pre-computed valid masks and no
 * upper-bound pruning. If both implementations agree on random cases, the
 * production solver's pruning is very unlikely to be hiding a worse optimum.
 *
 * It also owns an independent feasibility checker, so a schedule produced by
 * the production solver is validated against the raw constraints rather than
 * against another copy of the solver's own bookkeeping.
 */
import { getFuelForLoad } from '../../src/lib/calculations.js';

export const HOURS = 10;

/** Best value first, then lowest fuel (mirrors the intended objective). */
function better(a, b) {
  if (!b) return a;
  if (!a) return b;
  if (a.value !== b.value) return a.value > b.value ? a : b;
  return a.fuel <= b.fuel ? a : b;
}

export function referenceSolve(input) {
  const {
    grid_available,
    generator_capacity_kw: capacity,
    fuel_budget_litres,
    max_consecutive_dark: maxDark,
    fuel_table,
    shops,
  } = input;

  const budget = Math.round(fuel_budget_litres * 100);
  const mandatory = shops.filter((s) => s.type === 'mandatory');
  const normal = shops.filter((s) => s.type === 'normal');
  const mandatoryKw = mandatory.reduce((sum, s) => sum + s.kw, 0);
  const mandatoryValue = [];
  for (let t = 0; t < HOURS; t += 1) {
    mandatoryValue[t] = mandatory.reduce((sum, s) => sum + s.value_per_slot[t], 0);
  }

  // Hard infeasibility: the mandatory set alone cannot run in an outage slot.
  for (let t = 0; t < HOURS; t += 1) {
    if (grid_available[t]) continue;
    const cost = getFuelForLoad(mandatoryKw, fuel_table);
    if (mandatoryKw > capacity || !Number.isFinite(cost) || cost > budget) {
      return { status: 'infeasible' };
    }
  }

  const memo = new Map();

  function best(t, fuelUsed, streaks) {
    if (t === HOURS) return { value: 0, fuel: fuelUsed };
    const key = `${t}|${fuelUsed}|${streaks.join(',')}`;
    if (memo.has(key)) return memo.get(key);

    let result = null;

    const take = (mask) => {
      let kw = mandatoryKw;
      let value = mandatoryValue[t];
      const next = streaks.slice();
      for (let i = 0; i < normal.length; i += 1) {
        if (mask & (1 << i)) {
          kw += normal[i].kw;
          value += normal[i].value_per_slot[t];
          next[i] = 0;
        } else {
          next[i] = streaks[i] + 1;
          if (next[i] > maxDark) return;
        }
      }
      if (kw > capacity) return;
      const cost = getFuelForLoad(kw, fuel_table);
      if (!Number.isFinite(cost)) return;
      if (fuelUsed + cost > budget) return;
      const rest = best(t + 1, fuelUsed + cost, next);
      if (!rest) return;
      result = better({ value: value + rest.value, fuel: rest.fuel }, result);
    };

    if (grid_available[t]) {
      // Mains on: every shop runs from the grid at zero diesel cost, so the
      // generator capacity and fuel constraints do not apply; streaks reset.
      // The mains hours are a constant for the objective either way, and the
      // documented convention (README, /api/roster) counts value on generator
      // hours only, so no value is booked here.
      const rest = best(t + 1, fuelUsed, new Array(normal.length).fill(0));
      if (rest) result = better({ value: rest.value, fuel: rest.fuel }, result);
    } else {
      for (let mask = 0; mask < 1 << normal.length; mask += 1) take(mask);
    }

    memo.set(key, result);
    return result;
  }

  const result = best(0, 0, new Array(normal.length).fill(0));
  if (!result) return { status: 'infeasible' };
  return { status: 'ok', valueTotal: result.value, fuelTotalHundredths: result.fuel };
}

/**
 * Independently validates a solver schedule against the raw constraints.
 * Returns `{ feasible, reasons, value, fuelHundredths, darkHours }`.
 */
export function auditSchedule(input, schedule) {
  const {
    grid_available,
    generator_capacity_kw: capacity,
    fuel_budget_litres,
    max_consecutive_dark: maxDark,
    fuel_table,
    shops,
  } = input;

  const budget = Math.round(fuel_budget_litres * 100);
  const mandatory = shops.filter((s) => s.type === 'mandatory');
  const normal = shops.filter((s) => s.type === 'normal');
  const mandatoryKw = mandatory.reduce((sum, s) => sum + s.kw, 0);
  const streaks = new Array(normal.length).fill(0);
  const reasons = [];
  const darkHours = Object.fromEntries(shops.map((s) => [s.id, 0]));

  let value = 0;
  let fuelHundredths = 0;

  for (let t = 0; t < HOURS; t += 1) {
    const outage = !grid_available[t];
    if (!outage) {
      if (schedule[t] !== 'GRID') reasons.push(`hour ${10 + t}: expected GRID`);
      streaks.fill(0);
      continue;
    }

    const mask = typeof schedule[t] === 'number' ? schedule[t] : Number(schedule[t]);
    if (!Number.isInteger(mask) || mask < 0) {
      reasons.push(`hour ${10 + t}: missing/invalid mask (${schedule[t]})`);
      continue;
    }

    let load = mandatoryKw;
    let hourValue = mandatory.reduce((sum, s) => sum + s.value_per_slot[t], 0);
    for (let i = 0; i < normal.length; i += 1) {
      const on = (mask & (1 << i)) !== 0;
      const shop = normal[i];
      if (on) {
        load += shop.kw;
        hourValue += shop.value_per_slot[t];
        streaks[i] = 0;
      } else {
        streaks[i] += 1;
        darkHours[shop.id] += 1;
        if (streaks[i] > maxDark) {
          reasons.push(`${shop.id} dark ${streaks[i]} slots in a row (limit ${maxDark})`);
        }
      }
    }

    if (load > capacity) reasons.push(`hour ${10 + t}: load ${load}kW > capacity ${capacity}kW`);
    const cost = getFuelForLoad(load, fuel_table);
    if (!Number.isFinite(cost)) reasons.push(`hour ${10 + t}: fuel table does not cover ${load}kW`);
    else fuelHundredths += cost;
    value += hourValue;
  }

  if (fuelHundredths > budget) {
    reasons.push(`fuel ${fuelHundredths / 100}L exceeds budget ${fuel_budget_litres}L`);
  }

  return { feasible: reasons.length === 0, reasons, value, fuelHundredths, darkHours };
}

/** Value the API response should report for a schedule (outage hours only). */
export function expectedResponseTotals(input, schedule) {
  const audit = auditSchedule(input, schedule);
  const auditInfeasible = !audit.feasible;
  return { ...audit, auditInfeasible };
}

/** Deterministic PRNG so failures are reproducible. */
export function makeRandom(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function randomInput(rand, { maxShops = 4, maxKw = 30, maxBudget = 40 } = {}) {
  const shopCount = 1 + Math.floor(rand() * maxShops);
  const shops = [];
  for (let i = 0; i < shopCount; i += 1) {
    shops.push({
      id: `S${i}`,
      kw: 5 + Math.floor(rand() * (maxKw / 5)) * 5,
      type: rand() < 0.3 ? 'mandatory' : 'normal',
      value_per_slot: Array.from({ length: 10 }, () => Math.floor(rand() * 3) * 5),
    });
  }
  const capacity = 20 + Math.floor(rand() * 5) * 10;
  const table = [];
  for (let load = 10; load <= capacity; load += 10) {
    table.push({ load_kw: load, litres_per_hour: Math.round((load / 10) * 1.5 * 100) / 100 });
  }
  if (!table.some((e) => e.load_kw >= capacity)) {
    table.push({ load_kw: capacity, litres_per_hour: 5 });
  }
  return {
    grid_available: Array.from({ length: 10 }, () => rand() < 0.4),
    generator_capacity_kw: capacity,
    fuel_budget_litres: Math.round(rand() * maxBudget * 100) / 100,
    max_consecutive_dark: Math.floor(rand() * 4),
    fuel_table: table,
    shops,
  };
}
