import { getFuelForLoad } from './calculations.js';

export function solve(input) {
  const {
    grid_available,
    generator_capacity_kw,
    fuel_budget_litres,
    max_consecutive_dark,
    fuel_table,
    shops
  } = input;

  const startMs = Date.now();
  const TIME_LIMIT_MS = 8500; // 8.5 seconds to ensure we respond under 10s

  const mandatoryShops = shops.filter(s => s.type === 'mandatory');
  const normalShops = shops.filter(s => s.type === 'normal');
  const N_normal = normalShops.length;
  const budgetHundredths = Math.round(fuel_budget_litres * 100);

  // Check baseline capacity feasibility
  const mandatoryKw = mandatoryShops.reduce((sum, s) => sum + s.kw, 0);
  if (mandatoryKw > generator_capacity_kw) {
    // If there is ANY outage hour, this is infeasible
    for (let t = 0; t < 10; t++) {
      if (!grid_available[t]) {
        return { status: 'infeasible', reason: 'Mandatory shops exceed generator capacity.' };
      }
    }
  }

  // Precompute valid masks for each outage slot
  const validMasksPerSlot = []; // index 0..9, null if grid_available
  const maxPossibleValueRemaining = new Array(11).fill(0); 
  // maxPossibleValueRemaining[t] = sum of max possible value from slot t to 9

  for (let t = 0; t < 10; t++) {
    if (grid_available[t]) {
      validMasksPerSlot[t] = null;
      continue;
    }

    const validMasks = [];
    const maxMasks = 1 << N_normal;

    let maxValAtT = 0;

    for (let mask = 0; mask < maxMasks; mask++) {
      let currentKw = mandatoryKw;
      let maskValue = 0;
      
      // Calculate mandatory value (if any)
      for (const mShop of mandatoryShops) {
        maskValue += mShop.value_per_slot[t];
      }

      let validCapacity = true;
      for (let i = 0; i < N_normal; i++) {
        if ((mask & (1 << i)) !== 0) {
          currentKw += normalShops[i].kw;
          maskValue += normalShops[i].value_per_slot[t];
        }
      }

      if (currentKw > generator_capacity_kw) {
        validCapacity = false;
        continue;
      }

      const fuelCost = getFuelForLoad(currentKw, fuel_table);
      if (fuelCost > budgetHundredths) {
        // This specific mask requires more fuel than the entire budget
        continue;
      }

      validMasks.push({ mask, fuelCost, value: maskValue });
      if (maskValue > maxValAtT) {
        maxValAtT = maskValue;
      }
    }

    // Sort valid masks by value descending (best first for B&B)
    validMasks.sort((a, b) => b.value - a.value);
    validMasksPerSlot[t] = validMasks;
    maxPossibleValueRemaining[t] = maxValAtT;

    if (validMasks.length === 0) {
      // An outage slot with no valid configurations (e.g. mandatory shops alone exceed budget)
      return { status: 'infeasible', reason: `No feasible generator configuration for hour ${10 + t}:00` };
    }
  }

  // Compute suffix sums for upper bound
  for (let t = 8; t >= 0; t--) {
    const v = maxPossibleValueRemaining[t] || 0;
    maxPossibleValueRemaining[t] = v + maxPossibleValueRemaining[t + 1];
  }

  let bestValue = -1;
  let bestFuel = Infinity;
  let bestSchedule = null;
  let isOptimal = true;

  // DFS state:
  // darkRuns: array of length N_normal
  const initialDarkRuns = new Array(N_normal).fill(0);
  const currentSchedule = new Array(10).fill(null);

  // We use a Map to store best value found for a given state to prune
  // State key: `${t}-${fuelHundredths}-${darkRuns.join(',')}`
  const stateBest = new Map();

  function dfs(t, currentFuel, currentValue, darkRuns) {
    if (Date.now() - startMs > TIME_LIMIT_MS) {
      isOptimal = false;
      return;
    }

    // Reached end of day
    if (t === 10) {
      if (currentValue > bestValue || (currentValue === bestValue && currentFuel < bestFuel)) {
        bestValue = currentValue;
        bestFuel = currentFuel;
        bestSchedule = [...currentSchedule];
      }
      return;
    }

    // Prune if upper bound can't beat bestValue
    const upperBound = currentValue + maxPossibleValueRemaining[t];
    if (upperBound <= bestValue) return;

    // Prune by state
    const stateKey = `${t}-${currentFuel}-${darkRuns.join(',')}`;
    if (stateBest.has(stateKey)) {
      if (stateBest.get(stateKey) >= currentValue) {
        return; // We've been here with equal or better value
      }
    }
    stateBest.set(stateKey, currentValue);

    if (grid_available[t]) {
      // Grid is on, all shops powered, dark runs reset
      const nextDarkRuns = new Array(N_normal).fill(0);
      currentSchedule[t] = 'GRID';
      dfs(t + 1, currentFuel, currentValue, nextDarkRuns);
      return;
    }

    const masks = validMasksPerSlot[t];
    for (let i = 0; i < masks.length; i++) {
      const { mask, fuelCost, value } = masks[i];

      if (currentFuel + fuelCost > budgetHundredths) continue;

      let validDark = true;
      const nextDarkRuns = new Array(N_normal);

      for (let j = 0; j < N_normal; j++) {
        if ((mask & (1 << j)) !== 0) {
          nextDarkRuns[j] = 0;
        } else {
          nextDarkRuns[j] = darkRuns[j] + 1;
          if (nextDarkRuns[j] > max_consecutive_dark) {
            validDark = false;
            break;
          }
        }
      }

      if (!validDark) continue;

      currentSchedule[t] = mask;
      dfs(t + 1, currentFuel + fuelCost, currentValue + value, nextDarkRuns);
    }
  }

  dfs(0, 0, 0, initialDarkRuns);

  if (bestSchedule === null) {
    return { status: 'infeasible', reason: 'Cannot satisfy consecutive dark limits or fuel budget.' };
  }

  return {
    status: 'ok',
    schedule: bestSchedule,
    valueTotal: bestValue,
    fuelTotalHundredths: bestFuel,
    isOptimal
  };
}