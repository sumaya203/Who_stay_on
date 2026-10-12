"use client";

import { ShieldCheck, TrendingUp, Fuel, BatteryCharging, Gauge, CircleAlert, Hourglass } from 'lucide-react';
import { StatCard } from './ui';
import { fmtLitres, fmtNumber, fmtPct } from './analytics';

const peakFuel = (model) =>
  (model?.outageHours || []).reduce((best, h) => {
    const v = h.fuelLitres ?? 0;
    return best === null || v > best.v ? { v, label: h.label } : best;
  }, null);

/**
 * Executive summary. Every figure is read from the API response
 * (`value_total`, `fuel_total_litres`, `roster`, `dark_hours`) or from the
 * configuration the user actually submitted (capacity, fuel budget).
 */
export default function SummaryCards({ model, phase, errorCount }) {
  const m = model?.metrics || {};
  const solved = model?.solved;
  const infeasible = phase === 'infeasible';
  const invalid = phase === 'invalid' || phase === 'network';
  const running = phase === 'running';
  const summary = model?.summary || {};
  const pf = peakFuel(model);

  const statusValue = running
    ? 'Solving…'
    : solved
      ? 'Solved'
      : infeasible
        ? 'Infeasible'
        : invalid
          ? 'Rejected'
          : 'Awaiting run';

  const statusTone = solved ? 'ok' : infeasible || invalid ? 'bad' : running ? 'warn' : undefined;
  const statusFoot = solved
    ? `Limits respected across ${m.outageHourCount} outage hr${m.outageHourCount === 1 ? '' : 's'}.`
    : infeasible
      ? 'No schedule satisfies every hard constraint.'
      : invalid
        ? `${errorCount ?? 0} issue${errorCount === 1 ? '' : 's'} returned by the API.`
        : 'Run the optimizer to populate this view.';

  return (
    <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      <StatCard
        label="Solver status"
        tone={statusTone}
        icon={solved ? ShieldCheck : running ? Hourglass : CircleAlert}
        value={<span className={solved ? 'text-ok' : infeasible || invalid ? 'text-rose' : 'text-ink-muted'}>{statusValue}</span>}
        foot={statusFoot}
      />

      <StatCard
        label="Value captured"
        icon={TrendingUp}
        tone={solved ? 'ok' : undefined}
        value={solved ? fmtNumber(m.valueTotal) : null}
        foot={
          solved ? (
            <span>
              booked on generator hours · <span className="num">{fmtNumber(m.potentialValueTotal)}</span> was on offer
            </span>
          ) : (
            'Value booked on generator hours only.'
          )
        }
      />

      <StatCard
        label="Total fuel consumed"
        icon={Fuel}
        tone={solved ? 'warn' : undefined}
        value={solved ? fmtLitres(m.fuelTotal) : null}
        unit={solved ? 'L' : undefined}
        meter={solved ? m.budgetUsedPct : null}
        foot={
          solved ? (
            <span>
              <span className="num">{fmtPct(m.budgetUsedPct, 1)}</span> of <span className="num">{fmtLitres(m.budget)}</span> L
              {pf ? (
                <>
                  {' '}· peak <span className="num">{fmtLitres(pf.v)}</span> L at {pf.label}
                </>
              ) : null}
            </span>
          ) : (
            'Step-table burn for the scheduled load.'
          )
        }
      />

      <StatCard
        label="Remaining fuel budget"
        icon={BatteryCharging}
        value={solved ? fmtLitres(m.fuelRemaining) : summary.fuelBudget !== undefined ? fmtLitres(summary.fuelBudget) : null}
        unit="L"
        // the meter tracks the value shown: the share of the budget still unspent
        meter={solved && m.budget > 0 ? m.fuelRemaining / m.budget : null}
        foot={
          solved
            ? `${fmtLitres(m.budget)} L budgeted − ${fmtLitres(m.fuelTotal)} L used${
                m.fuelRemaining === 0 ? ' · fully committed' : ''
              }`
            : `Configured as ${fmtLitres(summary.fuelBudget)} L.`
        }
      />

      <StatCard
        label="Generator capacity"
        icon={Gauge}
        value={summary.capacityKw !== undefined && summary.capacityKw !== null ? fmtNumber(summary.capacityKw) : null}
        unit="kW"
        meter={solved ? m.avgLoadPct : null}
        foot={
          solved ? (
            <span>
              peak <span className="num">{fmtNumber(m.peakLoadKw)}</span> kW ({fmtPct(m.peakLoadPct)}) at {m.peakLoadHour} · avg{' '}
              <span className="num">{fmtPct(m.avgLoadPct)}</span>
            </span>
          ) : (
            <span>
              Combined shop demand <span className="num">{fmtNumber(summary.totalDemandKw)}</span> kW.
            </span>
          )
        }
      />
    </div>
  );
}
