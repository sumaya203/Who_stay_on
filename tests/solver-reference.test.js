import { describe, it, expect } from 'vitest';
import { solve } from '../src/lib/solver.js';
import { makeRandom, randomInput, referenceSolve } from './helpers/reference.js';

/**
 * Cross-check the production branch-and-bound solver against an independent
 * memoised reference on randomised inputs. This is the strongest available
 * evidence that the pruning in `solver.js` does not hide a better schedule.
 */
describe('solver vs independent reference (randomised)', () => {
  const seeds = Array.from({ length: 60 }, (_, i) => i + 1);

  it('agrees on the optimal value for 60 randomised scenarios', () => {
    const mismatches = [];
    let feasibleCases = 0;

    for (const seed of seeds) {
      const rand = makeRandom(seed);
      const input = randomInput(rand);
      const mine = solve(input);
      const ref = referenceSolve(input);

      expect(mine.status).toBe(ref.status);
      if (ref.status !== 'ok') continue;

      feasibleCases += 1;
      if (mine.valueTotal !== ref.valueTotal) {
        mismatches.push({ seed, mine: mine.valueTotal, ref: ref.valueTotal, input });
      }
    }

    expect(feasibleCases).toBeGreaterThan(20);
    expect(mismatches).toEqual([]);
  });

  it('never exceeds the reference fuel for an equal-value optimum', () => {
    const violations = [];
    for (const seed of seeds) {
      const input = randomInput(makeRandom(seed));
      const mine = solve(input);
      const ref = referenceSolve(input);
      if (mine.status !== 'ok' || ref.status !== 'ok') continue;
      if (mine.valueTotal !== ref.valueTotal) continue;
      if (mine.fuelTotalHundredths > ref.fuelTotalHundredths) {
        violations.push({ seed, mine: mine.fuelTotalHundredths, ref: ref.fuelTotalHundredths });
      }
    }
    expect(violations).toEqual([]);
  });
});
