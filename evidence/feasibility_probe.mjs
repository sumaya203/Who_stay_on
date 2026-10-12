/**
 * Independent feasibility probe used as evidence.
 *
 * It answers one question for the 12-shop, all-outage, 40 L instance: does a
 * legal schedule exist at all? The search here is written separately from
 * `src/lib/solver.js` and prunes only with facts that hold for every feasible
 * completion (mandatory-load fuel floor, capacity, dark-streak demand bound),
 * so a "feasible: true" answer is a constructive proof — a schedule exists.
 *
 * Run with: node evidence/feasibility_probe.mjs
 */
const capacity = 120;
const budget = 40;
const maxDark = 3;
const table = [
  { load_kw: 20, litres_per_hour: 1.1 },
  { load_kw: 60, litres_per_hour: 3.4 },
  { load_kw: 120, litres_per_hour: 6.2 },
];
const shops = [];
for (let i = 0; i < 12; i += 1) {
  shops.push({
    id: 'S' + i,
    kw: 5 + (i % 4) * 5,
    type: i < 3 ? 'mandatory' : 'normal',
    value_per_slot: Array.from({ length: 10 }, (_, t) => (i * 7 + t * 13) % 40),
  });
}
const grid = Array(10).fill(false);
const mandatory = shops.filter((s) => s.type === 'mandatory');
const normal = shops.filter((s) => s.type === 'normal');
const mandatoryKw = mandatory.reduce((a, s) => a + s.kw, 0);
const fuelHundredths = (load) => {
  if (load === 0) return 0;
  for (const e of table) if (e.load_kw >= load) return Math.round(e.litres_per_hour * 100);
  return Infinity;
};

// minimum fuel for the remaining slots (mandatory-only load is unavoidable)
const minFuel = [];
let acc = 0;
for (let t = 9; t >= 0; t -= 1) {
  acc += grid[t] ? 0 : fuelHundredths(mandatoryKw);
  minFuel[t] = acc;
}

// minimum number of remaining "on" slots required by the dark-streak limit
function minOns(streak, remaining) {
  if (remaining <= 0) return 0;
  const slack = maxDark - streak; // slots it may still stay dark
  if (remaining <= slack) return 0;
  const firstOn = slack; // place the next on as late as possible
  const tail = remaining - firstOn - 1;
  return 1 + Math.max(0, Math.ceil(tail / (maxDark + 1)));
}

let nodes = 0;
const found = [];
const start = Date.now();

function dfs(t, fuel, streaks) {
  nodes += 1;
  if (Date.now() - start > 60000) return false;
  if (fuel + minFuel[t] > budget * 100) return false;
  if (t === 10) {
    found.push(true);
    return true;
  }
  if (grid[t]) return dfs(t + 1, fuel, new Array(normal.length).fill(0));

  const masks = [];
  for (let mask = 0; mask < 1 << normal.length; mask += 1) {
    let load = mandatoryKw;
    for (let i = 0; i < normal.length; i += 1) if ((mask >> i) & 1) load += normal[i].kw;
    if (load > capacity) continue;
    masks.push(mask);
  }
  // try the most-dark-friendly masks first (fewest light-hours spent)
  masks.sort((a, b) => popcount(a) - popcount(b));

  for (const mask of masks) {
    const next = streaks.slice();
    let ok = true;
    for (let i = 0; i < normal.length; i += 1) {
      if ((mask >> i) & 1) {
        next[i] = 0;
      } else if (++next[i] > maxDark) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    // demand-side bound: every shop must still get its minimum on-slots
    const remaining = 9 - t;
    let needed = mandatoryKw * remaining;
    for (let i = 0; i < normal.length; i += 1) needed += minOns(next[i], remaining) * normal[i].kw;
    if (needed > capacity * remaining) continue;
    const cost = fuelHundredths(loadOf(mask));
    if (fuel + cost > budget * 100) continue;
    if (dfs(t + 1, fuel + cost, next)) return true;
  }
  return false;
}

function popcount(x) {
  let c = 0;
  while (x) {
    c += x & 1;
    x >>= 1;
  }
  return c;
}
function loadOf(mask) {
  let load = mandatoryKw;
  for (let i = 0; i < normal.length; i += 1) if ((mask >> i) & 1) load += normal[i].kw;
  return load;
}

const feasible = dfs(0, 0, new Array(normal.length).fill(0));
console.log('feasible:', feasible, 'nodes:', nodes, 'ms:', Date.now() - start);
