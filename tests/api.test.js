import { describe, it, expect } from 'vitest';
import { POST } from '../src/app/api/roster/route.js';
import { GET as health } from '../src/app/api/health/route.js';

const payload = () => ({
  grid_available: [true, false, false, true, false, false, true, true, false, true],
  generator_capacity_kw: 100,
  fuel_budget_litres: 50.0,
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
});

const post = async (body, raw = false) => {
  const request = new Request('http://localhost:3000/api/roster', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: raw ? body : JSON.stringify(body),
  });
  const res = await POST(request);
  return { res, data: await res.json() };
};

describe('POST /api/roster', () => {
  it('answers 200 with the documented response shape', async () => {
    const { res, data } = await post(payload());
    expect(res.status).toBe(200);
    expect(Object.keys(data).sort()).toEqual(['dark_hours', 'fuel_total_litres', 'roster', 'status', 'value_total']);
    expect(data.status).toBe('ok');
    expect(data.value_total).toBe(200);
    expect(data.fuel_total_litres).toBe(25);
  });

  it('only lists outage slots in the roster', async () => {
    const body = payload();
    const { data } = await post(body);
    const outageIndexes = body.grid_available
      .map((available, t) => (available ? null : `slot_${t}`))
      .filter(Boolean);
    expect(Object.keys(data.roster).sort()).toEqual(outageIndexes.sort());
  });

  it('keeps roster entries consistent with dark_hours', async () => {
    const { data } = await post(payload());
    const counted = Object.fromEntries(Object.keys(data.dark_hours).map((id) => [id, 0]));
    for (const slot of Object.values(data.roster)) {
      for (const entry of slot.dark) counted[entry.id] += 1;
    }
    expect(counted).toEqual(data.dark_hours);
  });

  it('is deterministic across repeated runs', async () => {
    const first = await post(payload());
    const second = await post(payload());
    expect(second.data).toEqual(first.data);
  });

  it('rejects a body that is not JSON with 400', async () => {
    const { res, data } = await post('not json at all', true);
    expect(res.status).toBe(400);
    expect(data.status).toBe('invalid_input');
    expect(data.errors).toEqual(['Invalid JSON format']);
  });

  it('rejects an empty JSON object with 400 and per-field messages', async () => {
    const { res, data } = await post({});
    expect(res.status).toBe(400);
    expect(data.errors.length).toBeGreaterThanOrEqual(5);
    expect(data.errors.join(' ')).toMatch(/grid_available/);
  });

  it('rejects a JSON array body with 400', async () => {
    const { res, data } = await post([1, 2, 3]);
    expect(res.status).toBe(400);
    expect(data.status).toBe('invalid_input');
  });

  it('rejects null shops without crashing', async () => {
    const body = payload();
    body.shops = [null, undefined];
    const { res, data } = await post(body);
    expect(res.status).toBe(400);
    expect(data.errors.join(' ')).toMatch(/must be an object/);
  });

  it('answers 200 with an explicit infeasible reason when mandatory load cannot run', async () => {
    const body = payload();
    body.generator_capacity_kw = 10;
    body.grid_available = Array(10).fill(false);
    const { res, data } = await post(body);
    expect(res.status).toBe(200);
    expect(data.status).toBe('infeasible');
    expect(data.reason).toMatch(/capacity/i);
    expect(data.proven).toBe(true);
    expect(data.roster).toEqual({});
    expect(data.value_total).toBe(0);
    expect(data.fuel_total_litres).toBe(0);
  });

  it('answers infeasible for a budget that cannot cover the mandatory load', async () => {
    const body = payload();
    body.fuel_budget_litres = 0;
    body.grid_available = Array(10).fill(false);
    const { res, data } = await post(body);
    expect(res.status).toBe(200);
    expect(data.status).toBe('infeasible');
    expect(data.proven).toBe(true);
  });

  it('solves an all-grid day with an empty roster and zero burn', async () => {
    const body = payload();
    body.grid_available = Array(10).fill(true);
    const { data } = await post(body);
    expect(data.status).toBe('ok');
    expect(data.roster).toEqual({});
    expect(data.value_total).toBe(0);
    expect(data.fuel_total_litres).toBe(0);
  });

  it('solves a zero-budget day when the mains cover every hour', async () => {
    const body = payload();
    body.fuel_budget_litres = 0;
    body.grid_available = Array(10).fill(true);
    const { data } = await post(body);
    expect(data.status).toBe('ok');
    expect(data.fuel_total_litres).toBe(0);
  });

  it('is infeasible for a zero budget when an outage hour needs the generator', async () => {
    const body = payload();
    body.fuel_budget_litres = 0;
    const { data } = await post(body);
    expect(data.status).toBe('infeasible');
    expect(data.proven).toBe(true);
    expect(data.reason).toMatch(/hour 11:00/);
  });
});

describe('GET /api/health', () => {
  it('reports ok', async () => {
    const res = await health();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });
});
