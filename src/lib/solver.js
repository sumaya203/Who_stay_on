import { getFuelForLoad } from './calculations.js';

/**
 * Exact branch-and-bound search for the ten-slot generator schedule.
 *
 * Everything here is semantics-preserving: the two extra prunes added to the
 * search (a mandatory-load fuel floor and a dark-streak/capacity demand floor)
 * only cut states that cannot possibly lead to a feasible completion, and the
 * schedule ordering is unchanged, so the returned optimum is the same one the
 * plain exhaustive search would find — it is just found (or ruled out) faster.
 *
 * Returned shapes:
 *   { status: 'ok', schedule, valueTotal, fuelTotalHundredths, isOptimal }
 *   { status: 'infeasible', reason, proven }
 * `proven === false` means the search window closed before the absence of a
 * feasible schedule could be established; the response reports that honestly
 * instead of claiming a proof it does not have.
 */
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
        return { status: 'infeasible', reason: 'Mandatory shops exceed generator capacity.', proven: true };
      }
    }
  }

  // Precompute valid masks for each outage slot
  const validMasksPerSlot = []; // index 0..9, null if grid_available
  const maxPossibleValueRemaining = new Array(11).fill(0);
  const remainingOutageSlots = new Array(11).fill(0);

  for (let t = 0; t < 10; t++) {
    if (grid_available[t]) {
      validMasksPerSlot[t] = null;
      remainingOutageSlots[t] = 0;
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

      for (let i = 0; i < N_normal; i++) {
        if ((mask & (1 << i)) !== 0) {
          currentKw += normalShops[i].kw;
          maskValue += normalShops[i].value_per_slot[t];
        }
      }

      if (currentKw > generator_capacity_kw) {
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
      return { status: 'infeasible', reason: `No feasible generator configuration for hour ${10 + t}:00`, proven: true };
    }

    remainingOutageSlots[t] = 1;
  }

  // Compute suffix sums for upper bound
  for (let t = 8; t >= 0; t--) {
    const v = maxPossibleValueRemaining[t] || 0;
    maxPossibleValueRemaining[t] = v + maxPossibleValueRemaining[t + 1];
    remainingOutageSlots[t] = remainingOutageSlots[t] + remainingOutageSlots[t + 1];
  }

  /* ---------------------------------------------------------------- pruning
     A relaxation of the remaining budget: what is the least diesel that can
     still deliver a given amount of kW-hours through `r` outage slots? Every
     outage slot must carry at least the mandatory load, and never more than the
     capacity, and the hourly burn is a step function of the load — so the answer
     is a small DP over (slots, kW-hours) built from the fuel table steps.

     Any real completion needs at least the mandatory load in every remaining
     outage slot plus the minimum number of on-shifts each normal shop still
     requires to respect `max_consecutive_dark`. Both are hard floors, so if the
     DP says the floor exceeds the remaining budget, the subtree is impossible.
     This only ever removes states that cannot be completed, so the optimum is
     unchanged — it is simply proven (or ruled out) far sooner.
   ------------------------------------------------------------------------ */
  const INF = Number.POSITIVE_INFINITY;
  const totalShopKw = mandatoryKw + normalShops.reduce((sum, s) => sum + s.kw, 0);
  const energyCap = Math.min(generator_capacity_kw, totalShopKw) * 10;

  // Per slot, the loads worth considering are the fuel-table step boundaries
  // (the largest load a given burn rate can carry) plus the capacity itself.
  // Any real load sits somewhere inside a step, so replacing it with the step's
  // boundary never costs more diesel and never delivers less kW-hours; that is
  // what makes the DP below an honest lower bound rather than a guess.
  const usableLoadLevels = [];
  {
    const seenLevels = new Set();
    for (const level of [mandatoryKw, ...fuel_table.map((entry) => entry.load_kw), generator_capacity_kw]) {
      if (!Number.isInteger(level) || level < 0 || level < mandatoryKw || level > generator_capacity_kw) continue;
      if (seenLevels.has(level)) continue;
      const cost = getFuelForLoad(level, fuel_table);
      if (!Number.isFinite(cost)) continue;
      seenLevels.add(level);
      usableLoadLevels.push({ level, cost });
    }
  }

  // fuelFloor[r][e] = least fuel (hundredths) that r outage slots need in order to
  // deliver at least e kW-hours, when each slot carries a load from the
  // relaxation above. Every slot must burn at least the mandatory load, so
  // fuelFloor[r][0] = r * cheapest feasible slot cost.
  let fuelFloor = null;
  if (usableLoadLevels.length > 0 && energyCap <= 400000) {
    fuelFloor = [];
    for (let r = 0; r <= 10; r++) fuelFloor.push(new Float64Array(energyCap + 1).fill(INF));
    fuelFloor[0][0] = 0;
    for (let r = 1; r <= 10; r++) {
      const prev = fuelFloor[r - 1];
      const cur = fuelFloor[r];
      for (let e = 0; e <= energyCap; e++) {
        let best = INF;
        for (let c = 0; c < usableLoadLevels.length; c++) {
          const { level, cost } = usableLoadLevels[c];
          const prevCost = prev[e > level ? e - level : 0];
          if (prevCost === INF) continue;
          const total = cost + prevCost;
          if (total < best) best = total;
        }
        cur[e] = best;
      }
    }
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

  /**
   * Fewest outage slots in which this shop must be powered from slot `from`
   * onward, given how many slots it has already been dark for. Waiting as long
   * as the limit allows is always optimal, so the greedy walk is exact, and any
   * completion therefore needs at least this many `kw` of gen-set energy here.
   */
  function minimumRequiredShifts(streak, from) {
    let remainingStreak = streak;
    let shifts = 0;
    for (let s = from; s < 10; s++) {
      if (grid_available[s]) {
        remainingStreak = 0;
        continue;
      }
      if (remainingStreak >= max_consecutive_dark) {
        shifts++;
        remainingStreak = 0;
      } else {
        remainingStreak++;
      }
    }
    return shifts;
  }

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

    // Energy floor: what every remaining outage slot cannot avoid drawing, plus
    // the minimum number of on-shifts each shop still needs to keep its dark
    // streaks legal. If even the cheapest diesel bill for that energy exceeds
    // what is left of the budget, no completion of this state is feasible.
    const outageSlotsLeft = remainingOutageSlots[t];
    if (outageSlotsLeft > 0 && N_normal > 0) {
      let requiredKwHours = mandatoryKw * outageSlotsLeft;
      for (let j = 0; j < N_normal; j++) {
        requiredKwHours += minimumRequiredShifts(darkRuns[j], t) * normalShops[j].kw;
      }
      if (fuelFloor) {
        if (requiredKwHours > energyCap) return;
        const floor = fuelFloor[outageSlotsLeft][requiredKwHours];
        if (!Number.isFinite(floor) || currentFuel + floor > budgetHundredths) return;
      } else if (requiredKwHours > generator_capacity_kw * outageSlotsLeft) {
        return;
      }
    } else if (fuelFloor && outageSlotsLeft > 0) {
      const floor = fuelFloor[outageSlotsLeft][0];
      if (!Number.isFinite(floor) || currentFuel + floor > budgetHundredths) return;
    }

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
    return {
      status: 'infeasible',
      reason: isOptimal
        ? 'Cannot satisfy consecutive dark limits or fuel budget.'
        : 'No feasible schedule was found within the 8.5 s search window; the instance could not be ruled out exhaustively.',
      proven: isOptimal
    };
  }

  return {
    status: 'ok',
    schedule: bestSchedule,
    valueTotal: bestValue,
    fuelTotalHundredths: bestFuel,
    isOptimal
  };
}
