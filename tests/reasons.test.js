import { describe, it, expect } from 'vitest';
import { generateDarkReason } from '../src/lib/reasons.js';

const call = (overrides = {}) =>
  generateDarkReason({
    shop: { id: 'B', kw: 40, type: 'normal' },
    currentLoadKw: 20,
    remainingFuelHundredths: 1000,
    fuelCostIfPoweredHundredths: 170,
    maxCapacityKw: 100,
    slotValue: 15,
    ...overrides,
  });

describe('dark-reason explanations', () => {
  it('flags a mandatory shop as an impossibility, not a choice', () => {
    const text = call({ shop: { id: 'A', kw: 20, type: 'mandatory' } });
    expect(text).toMatch(/Mandatory shop/);
  });

  it('explains a capacity-bound shed with the real kW figures', () => {
    const text = call({ currentLoadKw: 70, maxCapacityKw: 100, shop: { id: 'B', kw: 40, type: 'normal' } });
    expect(text).toBe("Powering it would take this hour to 110 kW, past the generator's 100 kW capacity.");
  });

  it('does not call a shed capacity-bound when the load exactly fits', () => {
    const text = call({ currentLoadKw: 60, maxCapacityKw: 100, shop: { id: 'B', kw: 40, type: 'normal' } });
    expect(text).not.toMatch(/capacity/);
  });

  it('explains a zero-value shed without blaming diesel or capacity', () => {
    const text = call({ slotValue: 0 });
    expect(text).toMatch(/0 value/);
    expect(text).not.toMatch(/diesel|capacity/);
  });

  it('explains a fuel-bound shed with the marginal and remaining litres', () => {
    const text = call({ remainingFuelHundredths: 40, fuelCostIfPoweredHundredths: 320 });
    expect(text).toBe(
      "The day's diesel budget is the binding constraint: powering it here needs 3.20 L more, and only 0.40 L is unspent."
    );
  });

  it('treats a marginal cost exactly equal to the leftover budget as affordable', () => {
    const text = call({ remainingFuelHundredths: 170, fuelCostIfPoweredHundredths: 170 });
    expect(text).toMatch(/maximise the day's total value/);
  });

  it('falls back to the value trade-off wording when nothing else binds', () => {
    const text = call();
    expect(text).toMatch(/maximise the day's total value/);
    expect(text).toMatch(/15 value on offer here/);
  });

  it('never renders NaN or undefined into the explanation', () => {
    const text = call({ remainingFuelHundredths: Number.NaN, fuelCostIfPoweredHundredths: Number.NaN });
    expect(text).not.toMatch(/NaN|undefined/);
  });

  it('formats whole litres without trailing decimals', () => {
    const text = call({ remainingFuelHundredths: 0, fuelCostIfPoweredHundredths: 500 });
    expect(text).toMatch(/needs 5 L more/);
    expect(text).toMatch(/only 0 L is unspent/);
  });
});
