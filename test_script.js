import { readFileSync, writeFileSync } from 'node:fs';
import { validateRequest } from './src/lib/validation.js';
import { solve } from './src/lib/solver.js';
import { buildResponse } from './src/lib/responseBuilder.js';

/**
 * Regenerates the evidence artifacts in `evidence/` straight from the engine.
 * The sample scenario is read from `public/sample_input.json`, so this script
 * can never drift from the configuration the dashboard loads.
 *
 *   node test_script.js
 */
const sample = JSON.parse(readFileSync('public/sample_input.json', 'utf8'));

const validation = validateRequest(sample);
console.log('Valid?', validation);

const solved = solve(sample);
console.log('Solve status:', solved.status, 'Optimal?', solved.isOptimal);
console.log('Value:', solved.valueTotal, 'Fuel:', solved.fuelTotalHundredths / 100);

const response = buildResponse(sample, solved);
writeFileSync('evidence/sample_output.json', JSON.stringify(response, null, 2));
writeFileSync('evidence/regression_input.json', JSON.stringify(sample, null, 2));
writeFileSync('evidence/regression_output.json', JSON.stringify(response, null, 2));

// Same day, fuel budget cut to 15 L: the engine still finds a schedule, but it
// has to shed normal shops and say why.
const boundarySample = { ...sample, fuel_budget_litres: 15.0 };
const boundarySolution = solve(boundarySample);
const boundaryResponse = buildResponse(boundarySample, boundarySolution);
console.log('Boundary status:', boundarySolution.status, 'Optimal?', boundarySolution.isOptimal);
writeFileSync('evidence/boundary_input.json', JSON.stringify(boundarySample, null, 2));
writeFileSync('evidence/boundary_output.json', JSON.stringify(boundaryResponse, null, 2));

console.log('Evidence files written.');
