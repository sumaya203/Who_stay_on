/**
 * Live integration checks for POST /api/roster.
 *
 * Runs against a server that is already listening (`npm run dev` or
 * `npm start`) and asserts the documented HTTP contract, including the
 * boundary and failure cases from the task brief. Prints one line per case and
 * exits non-zero if any expectation fails.
 *
 *   node evidence/live_api_checks.mjs [base-url]
 */
const BASE = process.argv[2] || process.env.BASE_URL || 'http://localhost:3000';
const ENDPOINT = `${BASE}/api/roster`;

const OUTAGE = [false, false, false, false, false, false, false, false, false, false];
const GRID = [true, true, true, true, true, true, true, true, true, true];

const shop = (over = {}) => ({
  id: 'A',
  kw: 20,
  type: 'mandatory',
  value_per_slot: [10, 10, 10, 10, 10, 10, 10, 10, 10, 10],
  ...over,
});

const base = (over = {}) => ({
  grid_available: OUTAGE,
  generator_capacity_kw: 100,
  fuel_budget_litres: 50,
  max_consecutive_dark: 2,
  fuel_table: [{ load_kw: 100, litres_per_hour: 5 }],
  shops: [shop()],
  ...over,
});

const results = [];
let failed = 0;

async function check(name, { payload, raw, expect }) {
  const options = {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: raw ?? JSON.stringify(payload),
  };
  const started = Date.now();
  let res;
  let data = null;
  let text = '';
  try {
    res = await fetch(ENDPOINT, options);
    text = await res.text();
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  } catch (error) {
    failed += 1;
    results.push(`FAIL  ${name} — request threw: ${error.message}`);
    return;
  }
  const ms = Date.now() - started;
  const problems = [];
  if (expect.status !== undefined && res.status !== expect.status) {
    problems.push(`HTTP ${res.status} !== ${expect.status}`);
  }
  if (expect.shape) {
    const keys = data && typeof data === 'object' ? Object.keys(data).sort().join(',') : '<none>';
    if (keys !== expect.shape) problems.push(`keys [${keys}] !== [${expect.shape}]`);
  }
  for (const [key, value] of Object.entries(expect.fields || {})) {
    if (data?.[key] !== value) problems.push(`${key} = ${JSON.stringify(data?.[key])} !== ${JSON.stringify(value)}`);
  }
  if (expect.errorCount !== undefined && data?.errors?.length !== expect.errorCount) {
    problems.push(`errors.length = ${data?.errors?.length} !== ${expect.errorCount}`);
  }
  if (expect.errorIncludes && !(data?.errors || []).some((e) => e.includes(expect.errorIncludes))) {
    problems.push(`no error containing "${expect.errorIncludes}"`);
  }
  if (expect.maxMs && ms > expect.maxMs) problems.push(`took ${ms} ms > ${expect.maxMs} ms`);

  if (problems.length) {
    failed += 1;
    results.push(`FAIL  ${name} — ${problems.join('; ')}`);
  } else {
    results.push(`ok    ${name} (HTTP ${res.status}, ${ms} ms)`);
  }
  return data;
}

const sample = JSON.parse(await (await import('node:fs/promises')).readFile('public/sample_input.json', 'utf8'));

// ---------------------------------------------------------------- happy path
const sampleData = await check('bundled sample solves with the documented totals', {
  payload: sample,
  expect: {
    status: 200,
    shape: 'dark_hours,fuel_total_litres,roster,status,value_total',
    fields: { status: 'ok', value_total: 200, fuel_total_litres: 25 },
    maxMs: 2000,
  },
});
if (sampleData) {
  const slots = Object.keys(sampleData.roster).sort().join(',');
  const expected = sample.grid_available
    .map((available, t) => (available ? null : `slot_${t}`))
    .filter(Boolean)
    .sort()
    .join(',');
  results.push(slots === expected ? `ok    roster keys are the five outage slots (${slots})` : `FAIL  roster keys ${slots} !== ${expected} (BROKEN)`);
  if (slots !== expected) failed += 1;
}

// ------------------------------------------------------------- boundary cases
await check('all-grid day with a zero budget is feasible and burns nothing', {
  payload: base({ grid_available: GRID, fuel_budget_litres: 0 }),
  expect: { status: 200, fields: { status: 'ok', value_total: 0, fuel_total_litres: 0 } },
});

await check('all-outage day with a zero budget is infeasible', {
  payload: base({ fuel_budget_litres: 0 }),
  expect: { status: 200, fields: { status: 'infeasible', proven: true, value_total: 0.0 } },
});

// The fuel table is a step function: a 20 kW load in a table whose first step
// is 20 kW burns 0.25 L/h, so ten outage hours cost exactly 2.50 L.
const exactBudget = (litres) =>
  base({
    generator_capacity_kw: 20,
    fuel_table: [{ load_kw: 20, litres_per_hour: 0.25 }],
    fuel_budget_litres: litres,
    max_consecutive_dark: 10,
  });

await check('fuel budget exactly equal to the day\'s burn is feasible', {
  payload: exactBudget(2.5),
  expect: { status: 200, fields: { status: 'ok', fuel_total_litres: 2.5 } },
});

await check('one hundredth of a litre short of the day\'s burn is infeasible', {
  payload: exactBudget(2.49),
  expect: { status: 200, fields: { status: 'infeasible' } },
});

await check('load exactly at capacity is allowed', {
  payload: base({
    generator_capacity_kw: 20,
    fuel_table: [{ load_kw: 20, litres_per_hour: 2 }],
    fuel_budget_litres: 20,
  }),
  expect: { status: 200, fields: { status: 'ok', fuel_total_litres: 20 } },
});

await check('mandatory load one kW above capacity is infeasible', {
  payload: base({
    generator_capacity_kw: 19,
    fuel_table: [{ load_kw: 19, litres_per_hour: 2 }],
    fuel_budget_litres: 20,
    shops: [shop({ kw: 20 })],
  }),
  expect: { status: 200, fields: { status: 'infeasible', proven: true } },
});

// With max_consecutive_dark = 0 the only legal outage plan powers the shop in
// every hour, which costs the full 50 L; one litre less makes that impossible.
await check('zero dark limit with enough fuel is feasible', {
  payload: base({ max_consecutive_dark: 0, shops: [shop({ type: 'normal' })] }),
  expect: { status: 200, fields: { status: 'ok', value_total: 100, fuel_total_litres: 50 } },
});

await check('zero dark limit without enough fuel is infeasible', {
  payload: base({ max_consecutive_dark: 0, fuel_budget_litres: 49, shops: [shop({ type: 'normal' })] }),
  expect: { status: 200, fields: { status: 'infeasible', proven: true } },
});

await check('empty shop list is feasible', {
  payload: base({ shops: [] }),
  expect: { status: 200, fields: { status: 'ok', value_total: 0, fuel_total_litres: 0 } },
});

await check('zero value shops still produce a legal schedule', {
  payload: base({
    shops: [
      shop({ id: 'M', type: 'mandatory', value_per_slot: Array(10).fill(0) }),
      shop({ id: 'N', kw: 10, type: 'normal', value_per_slot: Array(10).fill(0) }),
    ],
  }),
  expect: { status: 200, fields: { status: 'ok', value_total: 0 } },
});

await check('twelve shops at the documented maximum', {
  payload: base({
    generator_capacity_kw: 1000,
    fuel_table: [{ load_kw: 1000, litres_per_hour: 40 }],
    fuel_budget_litres: 400,
    shops: Array.from({ length: 12 }, (_, i) =>
      shop({ id: `S${i}`, kw: 10, type: i < 2 ? 'mandatory' : 'normal', value_per_slot: Array(10).fill(i + 1) })
    ),
  }),
  expect: { status: 200, fields: { status: 'ok' }, maxMs: 9000 },
});

await check('large-but-legal numbers stay exact', {
  payload: base({
    generator_capacity_kw: 100000,
    fuel_table: [{ load_kw: 500, litres_per_hour: 25.5 }, { load_kw: 100000, litres_per_hour: 900.25 }],
    fuel_budget_litres: 100000.5,
    shops: [shop({ kw: 60000, value_per_slot: Array(10).fill(9999) })],
  }),
  expect: { status: 200, fields: { status: 'ok', fuel_total_litres: 9002.5, value_total: 99990 } },
});

// --------------------------------------------------------------- rejections
await check('empty JSON object', {
  payload: {},
  expect: { status: 400, errorCount: 6 },
});

await check('grid_available with nine entries', {
  payload: base({ grid_available: GRID.slice(0, 9) }),
  expect: { status: 400, errorIncludes: 'exactly 10' },
});

await check('grid_available with numbers instead of booleans', {
  payload: base({ grid_available: OUTAGE.map(() => 0) }),
  expect: { status: 400, errorIncludes: 'booleans' },
});

await check('negative fuel budget', {
  payload: base({ fuel_budget_litres: -5 }),
  expect: { status: 400, errorIncludes: 'nonnegative' },
});

await check('fuel budget with three decimals', {
  payload: base({ fuel_budget_litres: 12.345 }),
  expect: { status: 400, errorIncludes: 'decimal places' },
});

await check('fractional shop kW', {
  payload: base({ shops: [shop({ kw: 12.5 })] }),
  expect: { status: 400, errorIncludes: 'positive integer' },
});

await check('duplicate shop ids', {
  payload: base({ shops: [shop(), shop()] }),
  expect: { status: 400, errorIncludes: 'duplicate shop id' },
});

await check('blank shop id', {
  payload: base({ shops: [shop({ id: '   ' })] }),
  expect: { status: 400, errorIncludes: 'nonblank' },
});

await check('unknown shop type', {
  payload: base({ shops: [shop({ type: 'optional' })] }),
  expect: { status: 400, errorIncludes: "'mandatory' or 'normal'" },
});

await check('value_per_slot with the wrong length', {
  payload: base({ shops: [shop({ value_per_slot: [1, 1, 1] })] }),
  expect: { status: 400, errorIncludes: 'exactly 10' },
});

await check('negative value_per_slot entry', {
  payload: base({ shops: [shop({ value_per_slot: [1, 1, 1, 1, 1, 1, 1, 1, 1, -1] })] }),
  expect: { status: 400, errorIncludes: 'nonnegative integer' },
});

await check('null shops', {
  payload: base({ shops: null }),
  expect: { status: 400, errorIncludes: 'shops must be an array' },
});

await check('thirteen shops', {
  payload: base({ shops: Array.from({ length: 13 }, (_, i) => shop({ id: `S${i}` })) }),
  expect: { status: 400, errorIncludes: 'at most 12' },
});

await check('fuel table that stops below capacity', {
  payload: base({ fuel_table: [{ load_kw: 40, litres_per_hour: 2 }] }),
  expect: { status: 400, errorIncludes: 'coverage' },
});

await check('fuel table with a decreasing load', {
  payload: base({ fuel_table: [{ load_kw: 50, litres_per_hour: 2 }, { load_kw: 20, litres_per_hour: 1 }] }),
  expect: { status: 400, errorIncludes: 'strictly increasing' },
});

await check('empty fuel table', {
  payload: base({ fuel_table: [] }),
  expect: { status: 400, errorIncludes: 'non-empty' },
});

await check('body that is a JSON array', {
  payload: [1, 2, 3],
  expect: { status: 400, errorIncludes: 'JSON object' },
});

await check('malformed JSON body', {
  raw: 'not json at all',
  expect: { status: 400, fields: { status: 'invalid_input' } },
});

const wrongMethod = await fetch(ENDPOINT, { method: 'GET' });
if (wrongMethod.status === 405) {
  results.push('ok    GET /api/roster is rejected with 405');
} else {
  failed += 1;
  results.push(`FAIL  GET /api/roster answered ${wrongMethod.status} instead of 405`);
}

const health = await fetch(`${BASE}/api/health`);
const healthBody = await health.json();
if (health.status === 200 && healthBody.status === 'ok') {
  results.push('ok    GET /api/health answers {status:"ok"}');
} else {
  failed += 1;
  results.push(`FAIL  GET /api/health answered ${health.status} ${JSON.stringify(healthBody)}`);
}

console.log(`live API checks against ${BASE}\n`);
for (const line of results) console.log(line);
console.log(`\n${results.filter((r) => r.startsWith('ok')).length} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
