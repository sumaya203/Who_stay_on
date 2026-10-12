# Evidence

This directory contains the actual outputs from testing the engine:

- \`regression_input.json\` / \`regression_output.json\`: Verifies the sample input produces an optimal 200 value while using exactly 25L of fuel (respecting constraints).
- \`boundary_input.json\` / \`boundary_output.json\`: Verifies behavior when the fuel budget is constrained tightly to 15L. It becomes infeasible to run the normal load without breaching the budget or consecutive dark hour rules for normal shops.
