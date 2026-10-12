# Who Stays On?

Generator load-shedding scheduler for the "Who Stays On?" challenge: a
branch-and-bound optimisation engine in pure JavaScript (`src/lib`) plus a
Next.js dashboard that renders exactly what the engine returns.

- `POST /api/roster` — solves one ten-slot day (`10:00`–`19:00`).
- `GET /api/health` — `{ "status": "ok" }`, used by the dashboard's engine pill.

## Input

```jsonc
{
  "grid_available": [true, false, false, true, false, false, true, true, false, true], // exactly 10 booleans
  "generator_capacity_kw": 100,          // positive integer, kW
  "fuel_budget_litres": 50.0,            // >= 0, at most 2 decimals
  "max_consecutive_dark": 2,             // >= 0, whole hours
  "fuel_table": [                        // strictly increasing load steps, at most 2 decimals
    { "load_kw": 30, "litres_per_hour": 1.5 },
    { "load_kw": 70, "litres_per_hour": 3.2 },
    { "load_kw": 100, "litres_per_hour": 5.0 }
  ],
  "shops": [                             // <= 12, unique non-blank ids
    {
      "id": "A_MANDATORY",
      "kw": 20,
      "type": "mandatory",               // "mandatory" | "normal"
      "value_per_slot": [10, 10, 10, 10, 10, 10, 10, 10, 10, 10] // 10 non-negative integers
    }
  ]
}
```

A ready-to-run example lives in `public/sample_input.json` and is loadable from
the dashboard with one click.

The dashboard validates this exact contract **before** submitting, using the
same `src/lib/validation.js` module the API route uses. A payload with missing
fields or mistyped values (numbers as strings, a short `grid_available`, a
malformed `fuel_table`…) is never sent: each message is shown next to the field
that produced it in the payload-contract panel, and nothing is silently
coerced or defaulted.

## Output

```jsonc
// 200 — feasible
{
  "status": "ok",
  "roster": {                            // only outage slots appear
    "slot_1": {                          // slot_t = the t-th hour of the day, 0-based -> 11:00
      "powered": ["A_MANDATORY", "B_NORMAL", "C_NORMAL"],
      "dark": []                         // [{ "id": "...", "reason": "..." }]
    }
  },
  "value_total": 200,
  "fuel_total_litres": 25,
  "dark_hours": { "A_MANDATORY": 0, "B_NORMAL": 0, "C_NORMAL": 0 }
}

// 200 — no schedule exists (or the search window closed without a proof)
{ "status": "infeasible", "reason": "...", "proven": true, "roster": {}, "value_total": 0, "fuel_total_litres": 0, "dark_hours": {} }

// 400 — schema violation, one message per problem
{ "status": "invalid_input", "errors": ["fuel_table coverage must end at or above generator_capacity_kw"] }

// 500 — unexpected failure after validation
{ "status": "error", "errors": ["Internal server processing error"] }
```

`value_total` and `fuel_total_litres` describe the **outage hours**: during
grid hours every shop runs on mains and no diesel is burned, so those hours add
the same constant to every candidate schedule and cannot change which schedule
is best. `proven: false` means the 8.5 s search window closed before the absence
of a feasible schedule could be established; the dashboard labels that state
"unproven" instead of claiming infeasibility.

## Rules the engine enforces

- Every grid hour powers every shop and burns nothing.
- During an outage hour the generator carries the powered shops; the load may
  not exceed `generator_capacity_kw`.
- A mandatory shop is always powered during outages.
- No shop may stay dark longer than `max_consecutive_dark` outage hours in a row.
- A load is billed at the first `fuel_table` step whose `load_kw` is at or above
  it (a step function, e.g. a 20 kW load with steps `[30, 70, 100]` burns the
  `30 kW` rate).
- Total burn may not exceed `fuel_budget_litres`.
- Objective: maximise the summed `value_per_slot` of powered shops.

Fuel is accumulated in integer hundredths of a litre, so the arithmetic is free
of floating-point drift.

## Dashboard

Colorful operations console — dark-navy top navigation bar (no sidebar) with
live section tabs, an executive summary of six color-coded cards (total shops ·
powered shops · shops without power · generator usage · fuel consumption ·
scheduling status), the ten-slot roster grid as the centrepiece, hourly
load/fuel analytics, per-shop statistics and the engine's dark-hour
explanations. Palette: dark navy, vibrant blue, teal and purple on soft cool
backgrounds — green for powered/available, red for unpowered/unavailable,
amber/orange for warnings, blue/purple for information.

- Every figure comes from the submitted configuration or the live API response;
  nothing is mocked, and a response that does not match the contract (missing
  roster, unreadable body) is reported as an error instead of being rendered.
- The payload-contract panel lists all six request fields with their expected
  types and the shared validator's messages next to the offending field; the
  Run action is blocked until the contract passes, so the optimizer never sees
  a mistyped payload.
- Dark cells are buttons: hover shows a tooltip, click/tap/keyboard opens a
  dialog with the engine's reason, `Escape` closes it, and the same text is
  repeated in the Dark Hours panel so nothing is hover-only.
- Loading, success, invalid-input, infeasible, unproven-infeasible, server-error
  and network-error states are all reachable and all tested.
- Responsive across desktop, tablet and mobile; `@media print` drops the screen
  chrome and prints a white A4 page with the roster, the metrics and the
  dark-hour reasons.

## Tech stack

Next.js 16 (App Router), React 19, Tailwind CSS 4, `lucide-react` icons, plain
JavaScript/JSX (no TypeScript), Vitest for the engine, API, analytics and DOM
tests.

## Setup

```bash
npm install
npm run dev      # http://localhost:3000
npm run build && npm start   # production build
npm run lint     # ESLint 9 flat config (eslint.config.mjs)
npm test         # vitest run
```

## Verification

| Command | What it proves |
| --- | --- |
| `npx vitest run` | 161 tests over the solver, the independent reference oracle, the API route, validation (incl. the field-tagged pre-submit contract gate), response building, dark reasons, analytics and the rendered dashboard. |
| `npm run lint` | ESLint 9 flat config, 0 problems. |
| `npm run build` | Production build of `/`, `/api/roster`, `/api/health`. |
| `node evidence/live_api_checks.mjs` | 34 live HTTP checks against a running server (boundaries, rejections, infeasible cases, 405 on the wrong method). |
| `node test_script.js` | Regenerates the fixtures in `evidence/`. |
| `node evidence/solver_crosscheck.mjs 500` | 500 randomised seeds against the reference oracle: 238 mutually feasible, 0 status/value/audit mismatches, 5 fuel tie-break differences, slowest solve 11 ms. |

See `evidence/README.md` for the fixtures and `tests/helpers/reference.js` for
the independent exhaustive oracle the solver is cross-checked against
(60 randomised scenarios in `tests/solver-reference.test.js`).

## Known limitations

- The search window is 8.5 s (the challenge allows 10 s). Pathologically tight
  12-shop instances can return a feasible schedule that is not proven optimal
  (`isOptimal: false` internally, still a legal schedule), and if no schedule
  has been found when the window closes the response is `infeasible` with
  `proven: false` rather than a false claim of impossibility.
- When several schedules tie on the optimal value, the search may return one
  that burns slightly more diesel than the leanest such schedule: in 5 of the
  238 mutually feasible seeds of the 500-seed cross-check the reported fuel was
  above the reference's while every reported value, status and constraint check
  matched. Pruning value-ties is what keeps the 8.5 s window comfortable, so
  this trade-off is deliberate and documented rather than hidden.
- The fuel-table relaxation used for pruning (`fuelFloor`) is only built when
  `capacity × 10 ≤ 400 000` kW-hours; above that the search falls back to the
  capacity-only check and gets slower, not wrong.
- No browser is available in the verification sandbox, so the layout was
  verified at the DOM/CSS level (jsdom tests plus inspection of the compiled
  stylesheet), not by pixel-level screenshots.
