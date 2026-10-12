import { generateDarkReason } from './reasons.js';

export function buildResponse(input, solverResult) {
  if (solverResult.status === 'infeasible') {
    return {
      status: 'infeasible',
      reason: solverResult.reason || 'No feasible schedule found.',
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

  let recomputedValue = 0;
  
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

    // For reasons, we need to know the fuel situation if we added this shop
    const budgetRemaining = (fuel_budget_litres * 100) - fuelTotalHundredths;

    darkNormal.forEach(s => {
      roster[slotKey].dark.push({
        id: s.id,
        reason: generateDarkReason(s, currentLoad, budgetRemaining, 0, generator_capacity_kw, fuel_table)
      });
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