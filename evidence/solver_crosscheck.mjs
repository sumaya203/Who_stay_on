/**
 * Larger randomised cross-check of the production solver against the
 * independent reference oracle in `tests/helpers/reference.js`.
 *
 *   node evidence/solver_crosscheck.mjs [seeds] [startSeed]
 *
 * Reports, for every seed: status mismatches, optimal-value mismatches and
 * fuel tie-break differences (same optimal value, more diesel than the
 * reference found). The first two must be zero; the third is reported because
 * the production search prunes value-ties and is allowed to pick a different
 * equally-good schedule.
 */
import { solve } from '../src/lib/solver.js';
import { auditSchedule, makeRandom, randomInput, referenceSolve } from '../tests/helpers/reference.js';

const seeds = Number(process.argv[2] ?? 500);
const start = Number(process.argv[3] ?? 1);

const report = {
  seeds,
  feasiblePairs: 0,
  statusMismatches: [],
  valueMismatches: [],
  auditFailures: [],
  fuelTieBreakDiffs: [],
  slowestMs: 0,
};

for (let seed = start; seed < start + seeds; seed += 1) {
  const input = randomInput(makeRandom(seed));
  const started = Date.now();
  const mine = solve(input);
  const ms = Date.now() - started;
  if (ms > report.slowestMs) report.slowestMs = ms;
  const ref = referenceSolve(input);

  if (mine.status !== ref.status) {
    report.statusMismatches.push({ seed, mine: mine.status, ref: ref.status });
    continue;
  }
  if (ref.status !== 'ok') continue;

  report.feasiblePairs += 1;

  // Independent constraint check of the returned schedule against the raw input.
  const audit = auditSchedule(input, mine.schedule);
  if (!audit.feasible) report.auditFailures.push({ seed, problems: audit.reasons });
  else if (audit.value !== mine.valueTotal || audit.fuelHundredths !== mine.fuelTotalHundredths) {
    report.auditFailures.push({
      seed,
      problems: [`totals disagree: solver ${mine.valueTotal}/${mine.fuelTotalHundredths} vs audit ${audit.value}/${audit.fuelHundredths}`],
    });
  }

  if (mine.valueTotal !== ref.valueTotal) {
    report.valueMismatches.push({ seed, mine: mine.valueTotal, ref: ref.valueTotal });
  } else if (mine.fuelTotalHundredths > ref.fuelTotalHundredths) {
    report.fuelTieBreakDiffs.push({
      seed,
      value: mine.valueTotal,
      mineHundredths: mine.fuelTotalHundredths,
      refHundredths: ref.fuelTotalHundredths,
    });
  }
}

console.log(JSON.stringify(report, null, 2));
const hardFailures = report.statusMismatches.length + report.valueMismatches.length + report.auditFailures.length;
console.log(
  `\nseeds ${start}..${start + seeds - 1}: ${report.feasiblePairs} mutually feasible, ` +
    `${hardFailures} hard mismatches, ${report.fuelTieBreakDiffs.length} fuel tie-break differences, ` +
    `slowest solve ${report.slowestMs} ms`
);
process.exit(hardFailures === 0 ? 0 : 1);
