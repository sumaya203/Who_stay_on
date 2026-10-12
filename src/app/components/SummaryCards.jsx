"use client";

import {
  Store,
  Zap,
  PowerOff,
  Gauge,
  Fuel,
  ShieldCheck,
  Hourglass,
  CircleAlert,
} from 'lucide-react';
import { StatCard } from './ui';
import { fmtLitres, fmtNumber, fmtPct } from './analytics';

const peakFuel = (model) =>
  (model?.outageHours || []).reduce((best, h) => {
    const v = h.fuelLitres ?? 0;
    return best === null || v > best.v ? { v, label: h.label } : best;
  }, null);

/**
 * Colorful executive summary — six cards, six meanings:
 *   blue   total shops          · green  powered shops
 *   red    shops without power  · teal   generator usage
 *   amber  fuel consumption     · purple scheduling status
 * Every figure is read from the API response (`value_total`,
 * `fuel_total_litres`, `roster`, `dark_hours`) or from the configuration the
 * user actually submitted — nothing is mocked or invented.
 */
export default function SummaryCards({ model, phase, errorCount, result }) {
  const summary = model?.summary || {};
  const m = model?.metrics || {};
  const shopStats = model?.shopStats || [];
  const solved = model?.solved;
  const infeasible = phase === 'infeasible';
  const invalid = phase === 'invalid' || phase === 'network' || phase === 'parse';
  const running = phase === 'running';
  const unproven = infeasible && result?.proven === false;

  const shopCount = summary.shopCount ?? null;
  const poweredShops = solved ? shopStats.filter((s) => !s.darkHours).length : null;
  const darkShops = solved ? shopStats.filter((s) => s.darkHours > 0).length : null;
  const outageHours = summary.outageHours ?? 0;

  const statusValue = running
    ? 'Solving…'
    : infeasible
      ? unproven
        ? 'Unproven'
        : 'Infeasible'
      : invalid
        ? 'Rejected'
        : phase === 'ok' || solved
          ? 'Solved'
          : 'Awaiting run';

  const statusIcon = running
    ? Hourglass
    : infeasible || invalid
      ? CircleAlert
      : phase === 'ok' || solved
        ? ShieldCheck
        : Hourglass;

  const statusFoot = infeasible
    ? unproven
      ? 'Search window closed before infeasibility could be proven.'
      : 'No schedule satisfies every hard constraint.'
    : invalid
      ? `${fmtNumber(errorCount ?? 0)} input issue${errorCount === 1 ? '' : 's'} — fix the contract fields.`
      : running
        ? 'Branch & bound search in progress…'
        : phase === 'ok' || solved
          ? `Limits respected across ${fmtNumber(m.outageHourCount)} outage hour${m.outageHourCount === 1 ? '' : 's'}.`
          : 'Run the optimizer to populate this view.';

  const pf = peakFuel(model);

  return (
    <div className="summary-grid">
      <StatCard
        accent="blue"
        label="Total shops"
        icon={Store}
        value={shopCount}
        unit={shopCount === 1 ? 'shop' : 'shops'}
        foot={
          <>
            <span className="num">{fmtNumber(summary.mandatoryCount)}</span> mandatory ·{' '}
            <span className="num">{fmtNumber(summary.normalCount)}</span> normal ·{' '}
            <span className="num">{fmtNumber(summary.totalDemandKw)}</span> kW demand
          </>
        }
      />

      <StatCard
        accent="green"
        label="Powered shops"
        icon={Zap}
        value={poweredShops}
        foot={
          solved ? (
            outageHours > 0 ? (
              <>
                never shed across <span className="num">{fmtNumber(outageHours)}</span> outage hour
                {outageHours === 1 ? '' : 's'}
              </>
            ) : (
              'all-grid day — every shop stayed on mains'
            )
          ) : (
            'shops with zero dark hours after a run'
          )
        }
      />

      <StatCard
        accent="red"
        label="Shops without power"
        icon={PowerOff}
        value={darkShops}
        foot={
          solved ? (
            m.totalDarkHours ? (
              <>
                <span className="num">{fmtNumber(m.totalDarkHours)}</span> shed hour
                {m.totalDarkHours === 1 ? '' : 's'} explained by the engine
              </>
            ) : (
              'nothing was shed'
            )
          ) : (
            'shops with at least one dark hour after a run'
          )
        }
      />

      <StatCard
        accent="teal"
        label="Generator usage"
        icon={Gauge}
        meterTone="teal"
        value={solved ? fmtPct(m.avgLoadPct) : null}
        meter={solved ? m.avgLoadPct : null}
        foot={
          solved ? (
            <>
              peak <span className="num">{fmtNumber(m.peakLoadKw)}</span> kW ({fmtPct(m.peakLoadPct)}) at {m.peakLoadHour} ·{' '}
              <span className="num">{fmtNumber(summary.capacityKw)}</span> kW cap
            </>
          ) : (
            <>
              <span className="num">{fmtNumber(summary.totalDemandKw)}</span> kW demand vs{' '}
              <span className="num">{fmtNumber(summary.capacityKw)}</span> kW capacity
            </>
          )
        }
      />

      <StatCard
        accent="amber"
        label="Fuel consumption"
        icon={Fuel}
        meterTone={m.budgetUsedPct >= 0.85 ? 'rose' : 'amber'}
        value={solved ? fmtLitres(m.fuelTotal) : null}
        unit={solved ? 'L' : undefined}
        meter={solved ? m.budgetUsedPct : null}
        foot={
          solved ? (
            <>
              <span className="num">{fmtPct(m.budgetUsedPct, 1)}</span> of{' '}
              <span className="num">{fmtLitres(m.budget)}</span> L
              {pf ? (
                <>
                  {' '}· peak <span className="num">{fmtLitres(pf.v)}</span> L at {pf.label}
                </>
              ) : null}
            </>
          ) : (
            <>
              budget <span className="num">{fmtLitres(summary.fuelBudget)}</span> L configured
            </>
          )
        }
      />

      <StatCard
        accent="purple"
        label="Scheduling status"
        icon={statusIcon}
        value={<span className={phase === 'ok' || solved ? 'text-ok' : unproven || running ? 'text-amber' : infeasible || invalid ? 'text-rose' : 'text-ink-muted'}>{statusValue}</span>}
        foot={statusFoot}
      />
    </div>
  );
}
