const litres = (hundredths) => {
  if (!Number.isFinite(hundredths)) return '∞';
  const rounded = Math.round(hundredths) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
};

/**
 * Explains why a shop is dark in one specific hour, using only the numbers the
 * schedule itself produced. Every branch is reachable:
 *
 * 1. mandatory — a mandatory shop can never be dark in a feasible schedule;
 * 2. capacity  — adding it to this hour would break the generator limit;
 * 3. zero value — the shop is worth nothing in this hour;
 * 4. fuel      — the marginal diesel would break the shared budget;
 * 5. otherwise — the hour's value was traded away for higher-value hours.
 *
 * The strings double as machine-readable tags for the dashboard badges, so the
 * wording of each branch deliberately keeps its distinguishing phrase.
 */
export function generateDarkReason({
  shop,
  currentLoadKw,
  remainingFuelHundredths,
  fuelCostIfPoweredHundredths,
  maxCapacityKw,
  slotValue = 0,
}) {
  if (shop.type === 'mandatory') {
    return 'Mandatory shop (should never be dark in a feasible solution)';
  }

  if (currentLoadKw + shop.kw > maxCapacityKw) {
    return (
      `Powering it would take this hour to ${currentLoadKw + shop.kw} kW, ` +
      `past the generator's ${maxCapacityKw} kW capacity.`
    );
  }

  if (slotValue === 0) {
    return 'It offers 0 value in this slot, so it stayed dark to leave headroom for higher-value hours.';
  }

  if (
    Number.isFinite(fuelCostIfPoweredHundredths) &&
    fuelCostIfPoweredHundredths > remainingFuelHundredths
  ) {
    return (
      `The day's diesel budget is the binding constraint: powering it here needs ` +
      `${litres(fuelCostIfPoweredHundredths)} L more, and only ${litres(remainingFuelHundredths)} L is unspent.`
    );
  }

  return (
    `Kept dark to maximise the day's total value: the shared budget earns more in other hours ` +
    `(${slotValue} value on offer here).`
  );
}
