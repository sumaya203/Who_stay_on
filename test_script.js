import { validateRequest } from './src/lib/validation.js';
import { solve } from './src/lib/solver.js';
import { buildResponse } from './src/lib/responseBuilder.js';

const sample = {
  "grid_available": [true, false, false, true, false, false, true, true, false, true],
  "generator_capacity_kw": 100,
  "fuel_budget_litres": 50.0,
  "max_consecutive_dark": 2,
  "fuel_table": [
    {"load_kw": 30, "litres_per_hour": 1.5},
    {"load_kw": 70, "litres_per_hour": 3.2},
    {"load_kw": 100, "litres_per_hour": 5.0}
  ],
  "shops": [
    {
      "id": "A_MANDATORY",
      "kw": 20,
      "type": "mandatory",
      "value_per_slot": [10, 10, 10, 10, 10, 10, 10, 10, 10, 10]
    },
    {
      "id": "B_NORMAL",
      "kw": 40,
      "type": "normal",
      "value_per_slot": [5, 15, 25, 5, 20, 10, 5, 5, 30, 5]
    },
    {
      "id": "C_NORMAL",
      "kw": 30,
      "type": "normal",
      "value_per_slot": [10, 5, 10, 15, 5, 25, 10, 10, 5, 10]
    }
  ]
};

const v = validateRequest(sample);
console.log("Valid?", v);

const s = solve(sample);
console.log("Solve status:", s.status, "Optimal?", s.isOptimal);
console.log("Value:", s.valueTotal, "Fuel:", s.fuelTotalHundredths / 100);

const resp = buildResponse(sample, s);
import fs from 'fs';
fs.writeFileSync('evidence/sample_output.json', JSON.stringify(resp, null, 2));
fs.writeFileSync('evidence/regression_input.json', JSON.stringify(sample, null, 2));
fs.writeFileSync('evidence/regression_output.json', JSON.stringify(resp, null, 2));
const boundarySample = JSON.parse(JSON.stringify(sample));
boundarySample.fuel_budget_litres = 15.0; // tighter boundary
const bs = solve(boundarySample);
const bresp = buildResponse(boundarySample, bs);
fs.writeFileSync('evidence/boundary_input.json', JSON.stringify(boundarySample, null, 2));
fs.writeFileSync('evidence/boundary_output.json', JSON.stringify(bresp, null, 2));
console.log("Evidence files written.");
