# Who Stays On?

An optimization engine and Next.js dashboard for scheduling generator load-shedding during power outages. Built for the "Who Stays On?" hackathon challenge.

## Features
- **Exact Optimization Solver:** Implemented in pure JavaScript using Branch and Bound to globally maximize value across the entire day while respecting shared fuel budget and capacity constraints.
- **Strict Input Validation:** Rejects missing fields, invalid formats, negative numbers, and logic inconsistencies.
- **Detailed Dark Reasons:** Automatically generates accurate explanations for why a shop was not powered, grounded in the numerical data.
- **Polished UI Dashboard:** Upload JSON, run optimization, and view results with per-hour statistics and shop-level drill-downs. 
- **Print View:** Dedicated `@media print` layout for cleanly printing A4 summaries.

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
