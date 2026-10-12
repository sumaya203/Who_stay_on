"use client";

import { BarChart3, Fuel, TrendingUp, BatteryCharging, Zap } from 'lucide-react';
import { Badge, clsx, KeyValue } from './ui';
import { fmtLitres, fmtNumber, fmtPct } from './analytics';

const CHART_H = 128;

/** 10-hour genset load vs capacity, with mains hours kept visually separate. */
function LoadChart({ model }) {
  const { hours, capacity, metrics } = model;
  return (
    <div className="card card-raise rise lg:col-span-8">
      <div className="card-head">
        <BarChart3 size={15} strokeWidth={1.9} className="text-ink-faint" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h2 className="card-title">Generator Load vs Capacity</h2>
          <p className="card-sub">Share of {fmtNumber(capacity)} kW drawn in every hour of the day</p>
        </div>
        <div className="toolbar justify-end">
          <Badge tone="volt">peak {fmtPct(metrics.peakLoadPct)}</Badge>
        </div>
      </div>

      <div className="px-3 pb-3 pt-4 sm:px-4">
        <div className="relative flex items-end gap-1 sm:gap-1.5" style={{ height: CHART_H + 20 }}>
          {/* capacity rail */}
          <div className="pointer-events-none absolute inset-x-0 top-0" style={{ height: CHART_H }}>
            <div className="h-full w-full rounded-lg border border-hairline bg-surface-2" />
            <span className="absolute right-0 -top-2 rounded bg-surface-3/90 px-1 text-[9px] font-semibold text-ink-faint">
              cap {fmtNumber(capacity)} kW
            </span>
            {metrics.avgLoadPct ? (
              <div
                className="absolute inset-x-0 border-t border-dashed border-volt/35"
                style={{ bottom: `${Math.min(100, metrics.avgLoadPct * 100)}%` }}
                title={`Average genset load across ${metrics.outageHourCount} outage hours`}
              >
                <span className="absolute -top-2 right-0 rounded bg-surface-3 px-1 text-[9px] font-semibold text-volt">
                  avg {fmtPct(metrics.avgLoadPct)}
                </span>
              </div>
            ) : null}
          </div>

          {hours.map((h) => {
            const pct = h.gridAvailable ? 100 : Math.max(h.loadPct * 100, h.loadKw > 0 ? 4 : 0);
            return (
              <div
                key={h.t}
                className="hour-col group relative flex min-w-0 flex-1 flex-col justify-end"
                data-grid={h.gridAvailable ? 'true' : 'false'}
                tabIndex={0}
                aria-label={`${h.label}: ${
                  h.gridAvailable
                    ? 'mains available, generator idle'
                    : `${fmtNumber(h.loadKw)} kW of ${fmtNumber(capacity)} kW capacity (${fmtPct(h.loadPct)}), ${fmtLitres(h.fuelLitres)} L burned, ${h.powered.length} of ${model.shopStats.length} shops powered`
                }`}
              >
                <div className="relative w-full" style={{ height: CHART_H }}>
                  <div className="bar-fill absolute inset-x-0 bottom-0" style={{ height: `${pct}%` }}>
                    {h.gridAvailable ? (
                      <span className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-[8.5px] font-bold tracking-[0.06em] text-grid-on">
                        GRID
                      </span>
                    ) : null}
                  </div>
                  {!h.gridAvailable ? (
                    <span className="num absolute inset-x-0 -bottom-0 text-center text-[9.5px] font-semibold text-ink opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100" style={{ bottom: `calc(${pct}% + 3px)` }}>
                      {fmtPct(h.loadPct)}
                    </span>
                  ) : null}
                </div>
                <div className="mt-1.5 text-center">
                  <p className="num text-[9.5px] font-semibold text-ink-muted">
                    {10 + h.t}
                    <span className="hidden min-[480px]:inline">:00</span>
                  </p>
                  <p
                    className={clsx(
                      'num text-[9.5px] font-medium leading-4',
                      h.gridAvailable ? 'text-grid-on' : h.dark.length ? 'text-ink-muted' : 'text-volt/85'
                    )}
                  >
                    {h.gridAvailable ? 'mains' : `${fmtNumber(h.loadKw)} kW`}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-hairline pt-2.5">
          <span className="legend-item">
            <span className="h-3 w-3 rounded-[3px] bg-volt" aria-hidden="true" />
            Genset load (share of capacity)
          </span>
          <span className="legend-item">
            <span
              className="h-3 w-3 rounded-[3px] border border-grid-on/35 bg-grid-on/20"
              aria-hidden="true"
            />
            Mains available — generator idle, no diesel burned
          </span>
          <span className="legend-item">
            {metrics.darkSlots
              ? `${metrics.poweredSlots} shop-hours powered · ${metrics.darkSlots} shed of ${metrics.totalSlots} scheduled`
              : `${metrics.poweredSlots} shop-hours powered, none shed`}
          </span>
        </div>
      </div>
    </div>
  );
}

/** Remaining-diesel gauge built from the engine's own fuel total. */
function BudgetGauge({ model }) {
  const m = model.metrics;
  const used = m.fuelTotal ?? 0;
  const budget = m.budget ?? 0;
  const pct = m.budgetUsedPct ?? 0;
  const avgBurn = m.outageHourCount ? used / m.outageHourCount : 0;
  const remaining = m.fuelRemaining ?? 0;
  const hoursAtAvg = avgBurn > 0 ? remaining / avgBurn : null;

  const R = 52;
  const C = Math.PI * R; // semicircle length
  const offset = C * (1 - Math.min(1, pct));

  return (
    <div className="card card-raise rise lg:col-span-4">
      <div className="card-head">
        <BatteryCharging size={15} strokeWidth={1.9} className="text-ink-faint" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h2 className="card-title">Diesel Budget</h2>
          <p className="card-sub">Committed against the configured allowance</p>
        </div>
        {pct >= 1 ? <Badge tone="rose">committed</Badge> : pct >= 0.85 ? <Badge tone="amber">tight</Badge> : <Badge tone="ok">headroom</Badge>}
      </div>

      <div className="card-body">
        <div className="flex items-center gap-4">
          <svg viewBox="0 0 128 74" className="h-[74px] w-[128px] shrink-0" role="img" aria-hidden="true">
            <path
              d="M 12 66 A 52 52 0 0 1 116 66"
              fill="none"
              stroke="var(--color-surface-3)"
              strokeWidth="9"
              strokeLinecap="round"
            />
            <path
              d="M 12 66 A 52 52 0 0 1 116 66"
              fill="none"
              stroke={pct >= 1 ? 'var(--color-rose)' : 'var(--color-amber)'}
              strokeWidth="9"
              strokeLinecap="round"
              strokeDasharray={`${C} ${C}`}
              strokeDashoffset={offset}
              style={{ transition: 'stroke-dashoffset 520ms var(--ease-smooth)' }}
            />
          </svg>
          <div className="min-w-0">
            <p className="stat-value">
              {fmtPct(pct, 1)}
              <span className="stat-unit">used</span>
            </p>
            <p className="mt-1 text-[11.5px] leading-snug text-ink-faint">
              <span className="num text-ink-muted">{fmtLitres(used)} L</span> of{' '}
              <span className="num text-ink-muted">{fmtLitres(budget)} L</span>
            </p>
          </div>
        </div>

        <KeyValue
          className="mt-3.5 border-t border-hairline pt-3.5"
          items={[
            { label: 'Remaining', value: `${fmtLitres(remaining)} L`, tone: remaining > 0 ? 'volt' : 'rose' },
            { label: 'Burn per outage hour (avg)', value: `${fmtLitres(avgBurn)} L`, mono: true },
            {
              label: 'Equivalent extra hours',
              value: hoursAtAvg === null ? '—' : `${fmtNumber(hoursAtAvg, 1)} h`,
              mono: true,
            },
            { label: 'Outage hours scheduled', value: fmtNumber(m.outageHourCount), mono: true },
          ]}
        />
      </div>
    </div>
  );
}

/** Fuel burned in each hour — grid hours kept in the axis for context. */
function HourlyFuelChart({ model }) {
  const max = Math.max(...model.hours.map((h) => (h.gridAvailable ? 0 : h.fuelLitres || 0)), 0.0001);
  const m = model.metrics;
  return (
    <div className="card card-raise rise lg:col-span-5">
      <div className="card-head">
        <Fuel size={15} strokeWidth={1.9} className="text-ink-faint" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h2 className="card-title">Fuel per Outage Hour</h2>
          <p className="card-sub">Step-table burn for the load actually scheduled</p>
        </div>
        <Badge tone="mute">{fmtNumber(model.fuelTable.length)} steps</Badge>
      </div>
      <div className="space-y-1 px-4 py-3">
        {model.hours.map((h) => (
          <div key={h.t} className="flex items-center gap-2.5">
            <span className="num w-11 shrink-0 text-[10.5px] font-semibold text-ink-muted">{h.label}</span>
            {h.gridAvailable ? (
              <>
                <span className="h-2 flex-1 rounded-full border border-grid-on/20 bg-grid-on/10" aria-hidden="true" />
                <span className="w-16 shrink-0 text-right text-[10px] font-semibold uppercase tracking-[0.06em] text-grid-on/80">
                  mains
                </span>
              </>
            ) : (
              <>
                <span className="meter h-2 flex-1">
                  <span style={{ width: `${((h.fuelLitres || 0) / max) * 100}%` }} />
                </span>
                <span className="num w-16 shrink-0 text-right text-[10.5px] font-semibold text-ink">
                  {fmtLitres(h.fuelLitres)} L
                </span>
                <span className="num hidden w-20 shrink-0 text-right text-[10px] text-ink-faint sm:block">
                  {fmtNumber(h.loadKw)} kW · {h.powered.length} on
                </span>
              </>
            )}
          </div>
        ))}
      </div>
      <div className="legend-row justify-between gap-3">
        <span className="text-ink-faint">Bars scaled to the busiest hour ({fmtLitres(max)} L)</span>
        <span className="num text-ink-muted">
          Σ {fmtLitres(m.fuelSum)} L {m.reconciles ? '· matches engine total' : ''}
        </span>
      </div>
    </div>
  );
}

/** Cumulative burn vs the budget line, drawn from the schedule itself. */
function CumulativeChart({ model }) {
  const { hours, metrics } = model;
  const W = 560;
  const H = 168;
  const pad = { l: 38, r: 12, t: 14, b: 24 };
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;
  const maxY = Math.max(metrics.budget || 0, metrics.fuelSum || 0, 1) * 1.06;
  const x = (i) => pad.l + (innerW / (hours.length - 1)) * i;
  const y = (v) => pad.t + innerH - (Math.min(v, maxY) / maxY) * innerH;

  const line = hours.map((h, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(h.cumulativeLitres).toFixed(1)}`).join(' ');
  const area = `${line} L ${x(hours.length - 1).toFixed(1)} ${(pad.t + innerH).toFixed(1)} L ${x(0).toFixed(1)} ${(
    pad.t + innerH
  ).toFixed(1)} Z`;
  const budgetY = metrics.budget ? y(metrics.budget) : null;

  return (
    <div className="card card-raise rise lg:col-span-7">
      <div className="card-head">
        <TrendingUp size={15} strokeWidth={1.9} className="text-ink-faint" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h2 className="card-title">Cumulative Diesel Usage</h2>
          <p className="card-sub">Running total across the day against the {fmtLitres(metrics.budget)} L ceiling</p>
        </div>
        <Badge tone="mute">
          <Zap size={11} strokeWidth={2.2} aria-hidden="true" />
          {fmtLitres(metrics.fuelTotal)} L burned
        </Badge>
      </div>

      <div className="card-body">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Cumulative diesel consumption across the ten hourly slots, with the configured budget shown as a dashed ceiling.">
          <defs>
            <linearGradient id="fuelArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-amber)" stopOpacity="0.34" />
              <stop offset="100%" stopColor="var(--color-amber)" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {/* mains-available bands */}
          {hours.map((h, i) =>
            h.gridAvailable ? (
              <rect
                key={`band-${h.t}`}
                x={x(Math.max(0, i - 0.5))}
                y={pad.t - 6}
                width={innerW / (hours.length - 1)}
                height={innerH + 6}
                fill="color-mix(in oklab, var(--color-grid-on) 9%, transparent)"
              />
            ) : null
          )}

          {[0, 0.25, 0.5, 0.75, 1].map((f) => {
            const v = maxY * f;
            return (
              <g key={f}>
                <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} className="chart-grid-line" />
                <text x={pad.l - 6} y={y(v) + 3} textAnchor="end" className="chart-axis-text">
                  {fmtNumber(v, maxY < 12 ? 1 : 0)}
                </text>
              </g>
            );
          })}

          {budgetY !== null ? (
            <g>
              <line
                x1={pad.l}
                x2={W - pad.r}
                y1={budgetY}
                y2={budgetY}
                stroke="var(--color-rose)"
                strokeWidth="1.25"
                strokeDasharray="5 4"
              />
              <text x={W - pad.r} y={budgetY - 5} textAnchor="end" className="chart-axis-text" fill="color-mix(in oklab, var(--color-rose) 82%, white)">
                budget {fmtLitres(metrics.budget)} L
              </text>
            </g>
          ) : null}

          <path d={area} fill="url(#fuelArea)" />
          <path d={line} fill="none" stroke="var(--color-amber)" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />

          {hours.map((h, i) => (
            <g key={`pt-${h.t}`}>
              <circle
                cx={x(i)}
                cy={y(h.cumulativeLitres)}
                r={h.gridAvailable ? 2 : 3.2}
                fill={h.gridAvailable ? 'color-mix(in oklab, var(--color-grid-on) 60%, var(--color-surface))' : 'var(--color-amber)'}
                stroke="var(--color-surface-2)"
                strokeWidth="1.2"
              >
                <title>{`${h.label} · ${h.gridAvailable ? 'mains available' : `${fmtLitres(h.fuelLitres)} L this hour`} · ${fmtLitres(h.cumulativeLitres)} L cumulative`}</title>
              </circle>
              <text x={x(i)} y={H - 6} textAnchor="middle" className="chart-axis-text">
                {10 + h.t}
              </text>
            </g>
          ))}
        </svg>

        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-hairline pt-2.5">
          <span className="legend-item">
            <span className="h-0.5 w-4 rounded-full bg-amber" aria-hidden="true" /> cumulative litres
          </span>
          <span className="legend-item">
            <span className="h-0.5 w-4 rounded-full" style={{ background: 'repeating-linear-gradient(90deg, var(--color-rose) 0 5px, transparent 5px 9px)' }} aria-hidden="true" />
            configured budget
          </span>
          <span className="legend-item">
            <span className="h-3 w-3 rounded-[3px] bg-grid-on/20" aria-hidden="true" /> grid hours (flat)
          </span>
          <span className="ml-auto num text-[10.5px] text-ink-faint">
            final {fmtLitres(metrics.fuelSum)} L · {fmtLitres(metrics.fuelRemaining)} L unused
          </span>
        </div>
      </div>
    </div>
  );
}

export default function EnergyAnalytics({ model }) {
  return (
    <section id="analytics" className="section-anchor rise">
      <div className="mb-2.5 flex flex-wrap items-center gap-2.5 px-0.5">
        <h2 className="text-[15px] font-semibold tracking-[-0.02em] text-ink">Hourly Energy Analytics</h2>
        <span className="text-[11.5px] text-ink-faint">
          derived from the returned roster and the submitted configuration
        </span>
        <Badge tone="mute" className="ml-auto">
          {fmtNumber(model.outageHours.length)} outage · {fmtNumber(model.gridHours.length)} grid hours
        </Badge>
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        <LoadChart model={model} />
        <BudgetGauge model={model} />
        <HourlyFuelChart model={model} />
        <CumulativeChart model={model} />
      </div>
    </section>
  );
}
