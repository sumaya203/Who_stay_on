# Who Stays On?

An optimization engine and Next.js dashboard for scheduling generator load-shedding during power outages. Built for the "Who Stays On?" hackathon challenge.

## Features
- **Exact Optimization Solver:** Implemented in pure JavaScript using Branch and Bound to globally maximize value across the entire day while respecting shared fuel budget and capacity constraints.
- **Strict Input Validation:** Rejects missing fields, invalid formats, negative numbers, and logic inconsistencies.
- **Detailed Dark Reasons:** Automatically generates accurate explanations for why a shop was not powered, grounded in the numerical data.
- **Premium Operations Dashboard:** Sidebar rail + sticky header, executive summary cards, a ten-slot roster grid as the centrepiece, hourly load/fuel analytics, shop statistics and dark-hour explanations — all driven only by the submitted configuration and the live API response.
- **Accessible Dark Reasons:** Every shed cell is hover-, tap- and keyboard-inspectable (popover with `aria-expanded`, Escape to dismiss) and is also written out in a persistent panel, so nothing depends on a tooltip.
- **Print View:** Dedicated `@media print` layout that re-maps the dark theme onto a clean, high-contrast white A4 summary.

## Design System
`src/app/globals.css` holds the single token layer (`@theme` + `:root`) for colour, type scale, spacing, radii, shadow and motion; component classes (`card`, `btn`, `badge`, `dtable`, `rc*` cell states, `meter`, `popover`, …) live in `@layer components` so Tailwind utilities always win. `src/app/components/` contains presentation-only components plus `analytics.js`, which derives every chart and table figure from the API response and the input payload (it reuses the solver's own `getFuelForLoad`, so the per-hour fuel bars agree with the engine by construction; the UI flags when totals reconcile with `value_total`/`fuel_total_litres`).

## Tech Stack
- Next.js (App Router), React, Tailwind CSS.
- Pure JavaScript (no TypeScript, strictly adhering to hackathon rules).
- Vitest for backend testing.

## Prerequisites
- Node.js (v18+ recommended)
- npm

## Setup & Startup
1. **Install dependencies:**
   \`\`\`bash
   npm install
   \`\`\`

2. **Development:**
   \`\`\`bash
   npm run dev
   \`\`\`
   Opens at \`http://localhost:3000\`.

3. **Production Build & Start:**
   \`\`\`bash
   npm run build
   npm start
   \`\`\`

4. **Testing:**
   \`\`\`bash
   npm run test
   \`\`\`

## API Endpoint
\`POST /api/roster\`
- Accepts the required JSON schema.
- Returns \`{ status: "ok", roster, value_total, fuel_total_litres, dark_hours }\`.
- In case of infeasibility, returns \`{ status: "infeasible", reason, ... }\`.
- In case of validation errors, returns \`{ status: "invalid_input", errors: [...] }\` with HTTP 400.

## Implementation Notes
- Optimality is guaranteed for the problem scale ($N \le 12$ shops, 10 hours) using Depth-First Search with Branch & Bound and State Memoization.
- Fuel table consumption assumes a step function as described, calculating cost once per outage slot based on the combined load.
- If solver hits the 8.5 second timeout to meet the <10s requirement, it gracefully returns the best found feasible solution with \`isOptimal: false\`.
