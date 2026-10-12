export function getFuelForLoad(loadKw, fuelTable) {
  if (loadKw === 0) return 0;
  
  for (const entry of fuelTable) {
    if (entry.load_kw >= loadKw) {
      // Return integer hundredths for precision to prevent floating-point boundary errors
      return Math.round(entry.litres_per_hour * 100);
    }
  }
  
  // Should not happen if fuel table covers up to capacity and load <= capacity
  return Infinity;
}
