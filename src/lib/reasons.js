export function generateDarkReason(shop, currentLoad, currentFuelRemainingHundredths, fuelCostIfPowered, maxCapacity, fuelTable) {
  if (shop.type === 'mandatory') {
    return 'Mandatory shop (should never be dark in a feasible solution)';
  }
  
  if (currentLoad + shop.kw > maxCapacity) {
    return `Powering this shop (${shop.kw} kW) along with the scheduled load (${currentLoad} kW) would exceed the generator capacity of ${maxCapacity} kW.`;
  }
  
  if (shop.value === 0) {
    return `Shop provides 0 value in this slot and was kept dark to conserve fuel.`;
  }

  if (fuelCostIfPowered > currentFuelRemainingHundredths) {
    return `Powering this shop would require more fuel than the remaining budget across the day.`;
  }

  return `Shop was kept dark to conserve the shared diesel budget and maximize global value across the day's schedule trade-offs.`;
}