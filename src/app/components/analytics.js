/**
 * Presentation-only derivation of dashboard analytics.
 *
 * Nothing here re-solves or re-judges anything: every number is either read
 * straight from the parsed input config, straight from the API response, or a
 * sum/percentage of those values. The one piece of engine logic reused is
 * `getFuelForLoad` (imported from the solver's own calculations module) so the
 * per-hour fuel bars are guaranteed to agree with the engine's fuel model.
 */
import { getFuelForLoad } from '@/lib/calculations.js';

export const SLOT_COUNT = 10;
export const FIRST_HOUR = 10;

export const slotLabel = (t) => `${FIRST_HOUR + t}:00`;
export const slotRange = (t) => `${FIRST_HOUR + t}:00–${FIRST_HOUR + t + 1}:00`;

export function fmtNumber(value, digits = 0) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return Number(value).toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function fmtLitres(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const rounded = Math.round(Number(value) * 100) / 100;
  return Number.isInteger(rounded)
    ? fmtNumber(rounded)
    : fmtNumber(rounded, 2);
}

export function fmtPct(value, digits = 0) {
  if (value === null || value === undefined || Number.isNaN(value) || !Number.isFinite(value)) return '—';
  return `${fmtNumber(value * 100, digits)}%`;
}

export function parseConfig(raw) {
  if (!raw || !raw.trim()) {
    return { ok: false, empty: true, error: 'No input yet — paste, upload or load the sample config.' };
  }
  try {
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return { ok: false, error: 'Configuration must be a JSON object.' };
    }
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: `Invalid JSON syntax — ${err.message}` };
  }
}

const asArray = (v) => (Array.isArray(v) ? v : []);

/** Compact structural summary of the config, used for the pre-run readouts. */
export function summarizeConfig(input) {
  if (!input) return null;
  const grid = asArray(input.grid_available);
  const shops = asArray(input.shops);
  const outageHours = grid.filter((g) => g === false).length;
  return {
    shopCount: shops.length,
    mandatoryCount: shops.filter((s) => s?.type === 'mandatory').length,
    normalCount: shops.filter((s) => s?.type === 'normal').length,
    outageHours,
    gridHours: grid.filter((g) => g === true).length,
    capacityKw: Number.isFinite(input.generator_capacity_kw) ? input.generator_capacity_kw : null,
    fuelBudget: Number.isFinite(input.fuel_budget_litres) ? input.fuel_budget_litres : null,
    maxConsecutiveDark: Number.isInteger(input.max_consecutive_dark) ? input.max_consecutive_dark : null,
    fuelTableSteps: asArray(input.fuel_table).length,
    totalDemandKw: shops.reduce((sum, s) => sum + (Number(s?.kw) || 0), 0),
  };
}

/**
 * Builds the full view-model consumed by the roster, chart and table sections.
 * `result` may be null (pre-run / failed run) — the model then describes only
 * the real configuration, with every result-dependent metric left as null.
 */
export function buildModel(input, result) {
  const summary = summarizeConfig(input);
  const grid = asArray(input?.grid_available);
  const shops = asArray(input?.shops).filter((s) => s && typeof s === 'object');
  const capacity = Number(input?.generator_capacity_kw) || 0;
  const fuelTable = asArray(input?.fuel_table);
  const solved = result?.status === 'ok';

  const shopById = new Map(shops.map((s) => [s.id, s]));
  const darkReasonByIdPerSlot = new Map();
  if (solved && result.roster) {
    for (const [slotKey, slot] of Object.entries(result.roster)) {
      const t = Number(slotKey.split('_')[1]);
      if (Number.isNaN(t)) continue;
      for (const d of asArray(slot?.dark)) {
        darkReasonByIdPerSlot.set(`${t}:${d.id}`, d.reason ?? '');
      }
    }
  }

  let cumulativeHundredths = 0;
  const hours = [];
  // With no parsable configuration there is nothing to lay out: keep the day
  // empty instead of inventing ten "outage" hours.
  const hourCount = grid.length > 0 ? SLOT_COUNT : 0;
  for (let t = 0; t < hourCount; t++) {
    const gridAvailable = grid[t] === true;
    const slot = solved ? result.roster?.[`slot_${t}`] : null;
    const powered = asArray(slot?.powered).filter((id) => shopById.has(id));
    const darkEntries = asArray(slot?.dark);
    const dark = darkEntries.map((d) => d.id).filter((id) => shopById.has(id));
    const outage = !gridAvailable;

    // Generator load for this hour: grid hours draw nothing from the genset.
    const loadKw = outage
      ? powered.reduce((sum, id) => sum + (Number(shopById.get(id)?.kw) || 0), 0)
      : 0;
    const fuelHundredths = outage ? getFuelForLoad(loadKw, fuelTable) : 0;
    const fuelLitres = Number.isFinite(fuelHundredths) ? fuelHundredths / 100 : null;
    cumulativeHundredths += Number.isFinite(fuelHundredths) ? fuelHundredths : 0;

    const hourValue = powered.reduce(
      (sum, id) => sum + (Number(shopById.get(id)?.value_per_slot?.[t]) || 0),
      0
    );
    const potentialValue = outage
      ? shops.reduce((sum, s) => sum + (Number(s.value_per_slot?.[t]) || 0), 0)
      : 0;
    const demandIfAllOn = outage
      ? shops.reduce((sum, s) => sum + (Number(s.kw) || 0), 0)
      : 0;

    hours.push({
      t,
      label: slotLabel(t),
      range: slotRange(t),
      gridAvailable,
      outage,
      hasRosterEntry: Boolean(slot),
      powered,
      dark,
      loadKw,
      loadPct: capacity > 0 ? loadKw / capacity : 0,
      fuelLitres,
      cumulativeLitres: cumulativeHundredths / 100,
      hourValue,
      potentialValue,
      demandIfAllOn,
      headroomKw: capacity - loadKw,
      reasonById: Object.fromEntries(darkEntries.map((d) => [d.id, typeof d?.reason === 'string' ? d.reason : ''])),
      shedKw: outage
        ? dark.reduce((sum, id) => sum + (Number(shopById.get(id)?.kw) || 0), 0)
        : 0,
    });
  }

  const outageHours = hours.filter((h) => h.outage);
  const gridHours = hours.filter((h) => h.gridAvailable);
  const peakHour = hours.reduce((best, h) => (!best || h.loadKw > best.loadKw ? h : best), null);
  const fuelSumHundredths = Math.round(
    outageHours.reduce((sum, h) => sum + (h.fuelLitres || 0) * 100, 0)
  );
  const valueSum = outageHours.reduce((sum, h) => sum + h.hourValue, 0);

  const shopStats = shops.map((s) => {
    const darkHours = solved ? Number(result.dark_hours?.[s.id]) || 0 : null;
    let poweredOutage = 0;
    let valueCaptured = 0;
    const reasons = [];
    for (const h of outageHours) {
      const isPowered = h.powered.includes(s.id);
      const isDark = h.dark.includes(s.id);
      if (isPowered) {
        poweredOutage += 1;
        valueCaptured += Number(s.value_per_slot?.[h.t]) || 0;
      }
      if (isDark) reasons.push({ t: h.t, label: h.label, reason: darkReasonByIdPerSlot.get(`${h.t}:${s.id}`) || '' });
    }
    const perHourValue = {};
    for (const h of outageHours) {
      perHourValue[h.t] = Number(s.value_per_slot?.[h.t]) || 0;
    }
    const potential = Object.values(perHourValue).reduce((sum, v) => sum + v, 0);
    return {
      id: s.id,
      type: s.type === 'mandatory' ? 'mandatory' : 'normal',
      kw: Number(s.kw) || 0,
      darkHours,
      poweredOutage: solved ? poweredOutage : null,
      outageShare: outageHours.length > 0 && solved ? poweredOutage / outageHours.length : null,
      valueCaptured: solved ? valueCaptured : null,
      potential,
      reasons: solved ? reasons : [],
      perHourValue,
    };
  });

  const budget = summary?.fuelBudget ?? null;
  const fuelTotal = solved ? Number(result.fuel_total_litres) || 0 : null;

  return {
    summary,
    capacity,
    fuelTable,
    hours,
    shopStats,
    outageHours,
    gridHours,
    solved,
    metrics: {
      outageHourCount: outageHours.length,
      gridHourCount: gridHours.length,
      valueTotal: solved ? Number(result.value_total) || 0 : null,
      valueSum,
      fuelTotal,
      fuelSum: fuelSumHundredths / 100,
      fuelRemaining: fuelTotal === null || budget === null ? null : Math.max(0, Math.round((budget - fuelTotal) * 100) / 100),
      budgetUsedPct: budget > 0 && fuelTotal !== null ? Math.min(1, fuelTotal / budget) : null,
      budget,
      peakLoadKw: solved ? peakHour?.loadKw ?? 0 : null,
      peakLoadPct: solved && capacity > 0 && peakHour ? peakHour.loadKw / capacity : null,
      peakLoadHour: peakHour?.label ?? null,
      avgLoadPct: solved
        ? outageHours.length > 0 && capacity > 0
          ? outageHours.reduce((sum, h) => sum + h.loadKw, 0) / outageHours.length / capacity
          : 0
        : null,
      totalDarkHours: solved
        ? shopStats.reduce((sum, s) => sum + (s.darkHours || 0), 0)
        : null,
      poweredSlots: solved
        ? outageHours.reduce((sum, h) => sum + h.powered.length, 0)
        : null,
      darkSlots: solved ? outageHours.reduce((sum, h) => sum + h.dark.length, 0) : null,
      totalSlots: solved ? outageHours.length * shops.length : null,
      potentialValueTotal: outageHours.reduce((sum, h) => sum + h.potentialValue, 0),
      totalDemandKw: summary?.totalDemandKw ?? 0,
      reconciles:
        solved &&
        Math.round((fuelSumHundredths - Math.round((fuelTotal ?? 0) * 100))) === 0 &&
        valueSum === (Number(result.value_total) || 0),
      cumulativeFuelSeries: hours.map((h) => h.cumulativeLitres),
    },
  };
}

/** Turns the API error payload into a printable list of lines. */
export function errorLines(error) {
  if (!error) return [];
  if (Array.isArray(error)) return error;
  return String(error)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

/** Classifies an engine-supplied dark reason for labelling only (no new logic). */
export function reasonTag(reason) {
  const text = String(reason || '').toLowerCase();
  if (text.includes('capacity')) return { label: 'Capacity-bound', tone: 'grid' };
  if (text.includes('fuel') || text.includes('diesel')) return { label: 'Fuel-bound', tone: 'amber' };
  if (text.includes('0 value')) return { label: 'Low value', tone: 'mute' };
  if (text.includes('mandatory')) return { label: 'Mandatory', tone: 'volt' };
  return { label: 'Value trade-off', tone: 'mute' };
}
