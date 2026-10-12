import { describe, it, expect, vi } from 'vitest';

/**
 * The payload below is valid, so anything thrown from here on is a fault on the
 * server's side. The route must answer HTTP 500 with the JSON error shape the
 * dashboard already understands — not a 400 that blames the user's input.
 */
vi.mock('../src/lib/solver.js', () => ({
  solve() {
    throw new Error('boom');
  },
}));

const { POST } = await import('../src/app/api/roster/route.js');

describe('POST /api/roster internal failure', () => {
  it('answers 500 with a JSON error payload', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const request = new Request('http://localhost:3000/api/roster', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        grid_available: Array(10).fill(false),
        generator_capacity_kw: 100,
        fuel_budget_litres: 50,
        max_consecutive_dark: 2,
        fuel_table: [{ load_kw: 100, litres_per_hour: 5 }],
        shops: [{ id: 'A', kw: 20, type: 'normal', value_per_slot: Array(10).fill(1) }],
      }),
    });

    const res = await POST(request);
    const data = await res.json();
    spy.mockRestore();

    expect(res.status).toBe(500);
    expect(data.status).toBe('error');
    expect(data.errors).toEqual(['Internal server processing error']);
  });
});
