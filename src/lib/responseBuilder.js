import { generateDarkReason } from './reasons.js';
import { getFuelForLoad } from './calculations.js';

export function buildResponse(input, solverResult) {
  if (solverResult.status === 'infeasible') {
    return {
      status: 'infeasible',
      reason: solverResult.reason || 'No feasible schedule found.',
      // false = the search window closed before infeasibility could be proven.
      proven: solverResult.proven !== false,
      roster: {},
      value_total: 0,
      fuel_total_litres: 0,
      dark_hours: {}
    };
  }

  const { grid_available, shops, generator_capacity_kw, fuel_table, fuel_budget_litres } = input;
  const { schedule, valueTotal, fuelTotalHundredths } = solverResult;

  const mandatoryShops = shops.filter(s => s.type === 'mandatory');
  const normalShops = shops.filter(s => s.type === 'normal');

  const roster = {};
  const dark_hours = {};

  shops.forEach(s => {
    dark_hours[s.id] = 0;
  });

  // Diesel the day's budget still has free once the returned schedule is paid
  // for. A shed shop whose marginal burn is larger than that could never have
  // run inside the budget, which is what the fuel-bound explanation states.
  const budgetHundredths = Math.round(fuel_budget_litres * 100);
  const remainingFuelHundredths = budgetHundredths - fuelTotalHundredths;

  let recomputedValue = 0;
  const recomputedFuelHundredthsByHour = [];

  for (let t = 0; t < 10; t++) {
    if (grid_available[t]) {
      continue;
    }

    const slotKey = `slot_${t}`;
    roster[slotKey] = {
      powered: [],
      dark: []
    };

    const mask = schedule[t];
    let currentLoad = 0;

    // All mandatory are powered
    mandatoryShops.forEach(s => {
      roster[slotKey].powered.push(s.id);
      currentLoad += s.kw;
      recomputedValue += s.value_per_slot[t];
    });

    const poweredNormal = [];
    const darkNormal = [];

    for (let i = 0; i < normalShops.length; i++) {
      const s = normalShops[i];
      if ((mask & (1 << i)) !== 0) {
        poweredNormal.push(s);
        currentLoad += s.kw;
        recomputedValue += s.value_per_slot[t];
      } else {
        darkNormal.push(s);
        dark_hours[s.id] += 1;
      }
    }

    poweredNormal.forEach(s => roster[slotKey].powered.push(s.id));

    recomputedFuelHundredthsByHour.push(getFuelForLoad(currentLoad, fuel_table));

    // Only the diesel this shop would add to this hour is relevant: the rest of
    // the hour is already scheduled and already paid for.
    const scheduledFuel = getFuelForLoad(currentLoad, fuel_table);

    darkNormal.forEach(s => {
      const withShop = getFuelForLoad(currentLoad + s.kw, fuel_table);
      const marginalFuel = Number.isFinite(withShop) && Number.isFinite(scheduledFuel)
        ? withShop - scheduledFuel
        : Infinity;
      roster[slotKey].dark.push({
        id: s.id,
        reason: generateDarkReason({
          shop: s,
          currentLoadKw: currentLoad,
          remainingFuelHundredths,
          fuelCostIfPoweredHundredths: marginalFuel,
          maxCapacityKw: generator_capacity_kw,
          slotValue: s.value_per_slot[t]
        })
      });
    });
  }

  // Integrity net: the roster above is what clients render, so if the board and
  // the solver's own totals ever diverged it must be reported, not papered over.
  const recomputedFuelHundredths = recomputedFuelHundredthsByHour.reduce(
    (sum, value) => sum + (Number.isFinite(value) ? value : 0),
    0
  );
  if (recomputedValue !== valueTotal || recomputedFuelHundredths !== fuelTotalHundredths) {
    console.error('Roster/summary mismatch', {
      recomputedValue,
      valueTotal,
      recomputedFuelHundredths,
      fuelTotalHundredths
    });
  }

  return {
    status: 'ok',
    roster,
    value_total: valueTotal,
    fuel_total_litres: fuelTotalHundredths / 100,
    dark_hours
  };
}
