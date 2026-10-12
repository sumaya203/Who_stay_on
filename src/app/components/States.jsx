"use client";

import {
  CircleAlert,
  CircleCheck,
  Download,
  FileUp,
  Fuel,
  Grid3x3,
  Hourglass,
  Info,
  Play,
  PlugZap,
  Printer,
  ShieldCheck,
  TriangleAlert,
  WifiOff,
} from 'lucide-react';
import { Panel, Badge, Button, clsx, EmptyState, Alert, KeyValue, Spinner } from './ui';
import { fmtLitres, fmtNumber, fmtPct, slotLabel } from './analytics';

/* ------------------------------------------------------------------ states */

const STEPS = [
  { id: 'parse', label: 'Parse & validate configuration', hint: 'strict schema check' },
  { id: 'solve', label: 'Search the ten-slot schedule', hint: 'capacity · fuel · dark limits' },
  { id: 'build', label: 'Build roster, totals & dark reasons', hint: 'response builder' },
];

function StatusRow({ state = 'pending', title, hint }) {
  const Icon = state === 'done' ? CircleCheck : state === 'active' ? Spinner : state === 'failed' ? CircleAlert : Hourglass;
  return (
    <div className="progress-step" data-state={state}>
      <span
        className={clsx(
          'grid h-5 w-5 shrink-0 place-items-center rounded-full border',
          state === 'done' && 'border-volt/40 bg-volt/10 text-volt',
          state === 'active' && 'border-amber/45 bg-amber/10 text-amber',
          state === 'failed' && 'border-rose/45 bg-rose/10 text-rose',
          state === 'pending' && 'border-hairline bg-surface-3 text-ink-faint'
        )}
        aria-hidden="true"
      >
        <Icon size={11} strokeWidth={2.4} />
      </span>
      <span className="min-w-0">
        <span className="block text-[12px] font-medium leading-tight text-ink-muted">{title}</span>
        {hint ? <span className="block text-[10.5px] text-ink-faint">{hint}</span> : null}
      </span>
    </div>
  );
}

export function OptimizerProgress({ summary }) {
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-center">
      <div className="space-y-3.5">
        <div className="flex items-center gap-2.5">
          <span className="stat-icon text-amber" style={{ width: 34, height: 34 }}>
            <Hourglass size={16} strokeWidth={2} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-[14px] font-semibold tracking-tight text-ink">Optimizing…</p>
            <p className="text-[11.5px] text-ink-faint">
              {fmtNumber(summary?.shopCount)} shops · {fmtNumber(summary?.outageHours)} outage hours ·{' '}
              {fmtNumber(summary?.capacityKw)} kW / {fmtLitres(summary?.fuelBudget)} L
            </p>
          </div>
        </div>
        <div className="progress-steps">
          <StatusRow state="done" title={STEPS[0].label} hint={STEPS[0].hint} />
          <StatusRow state="active" title={STEPS[1].label} hint={STEPS[1].hint} />
          <StatusRow state="pending" title={STEPS[2].label} hint={STEPS[2].hint} />
        </div>
      </div>

      <div aria-hidden="true" className="space-y-1.5">
        {Array.from({ length: 5 }).map((_, r) => (
          <div key={r} className="flex gap-1.5">
            {Array.from({ length: 10 }).map((__, c) => (
              <span key={c} className="skeleton h-6 flex-1" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ErrorState({ kind = 'invalid', message, lines }) {
  const network = kind === 'network';
  const api = kind === 'api';
  const title = network
    ? 'The optimizer request failed'
    : api
      ? 'No schedule was produced'
      : 'Invalid input — nothing was solved';

  return (
    <Alert tone="rose" icon={network ? WifiOff : TriangleAlert} title={title}>
      <p className="text-[12px]">{message}</p>
      {lines?.length ? (
        <ol className="mono mt-2 space-y-1 rounded-[10px] border border-hairline bg-surface-2 p-2.5 text-[11px] leading-relaxed">
          {lines.map((line, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-rose/75">{String(i + 1).padStart(2, '0')}</span>
              <span className="min-w-0 break-words text-ink-muted">{line}</span>
            </li>
          ))}
        </ol>
      ) : null}
    </Alert>
  );
}

export function InfeasibleState({ result, model }) {
  const overCapacity = (model?.summary?.totalDemandKw || 0) > (model?.capacity ?? Infinity);
  const unproven = result?.proven === false;
  return (
    <div className="card rise" data-tone="bad">
      <div className="card-head">
        <TriangleAlert size={15} strokeWidth={1.9} className="text-rose" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h2 className="card-title">{unproven ? 'No Feasible Schedule Found' : 'Infeasible'}</h2>
          <p className="card-sub">
            {unproven
              ? 'The search window closed before infeasibility could be proven — no schedule was returned'
              : 'No schedule satisfies every hard constraint for this configuration'}
          </p>
        </div>
        <Badge tone={unproven ? 'amber' : 'rose'}>{unproven ? 'unproven' : 'proven'}</Badge>
      </div>
      <div className="card-body space-y-3.5">
        <p className="rounded-[10px] border border-rose/30 bg-rose/8 px-3 py-2.5 text-[12.5px] leading-relaxed text-ink">
          {result?.reason || 'No feasible schedule found.'}
        </p>
        <KeyValue
          className="sm:grid-cols-2 lg:grid-cols-3"
          items={[
            { label: 'Shops in scenario', value: fmtNumber(model?.summary?.shopCount) },
            { label: 'Outage hours', value: fmtNumber(model?.summary?.outageHours) },
            {
              label: 'Combined demand',
              value: `${fmtNumber(model?.summary?.totalDemandKw)} kW`,
              tone: overCapacity ? 'rose' : 'volt',
            },
            { label: 'Generator capacity', value: `${fmtNumber(model?.capacity)} kW`, mono: true },
            { label: 'Fuel budget', value: `${fmtLitres(model?.summary?.fuelBudget)} L`, mono: true },
            { label: 'Max consecutive dark', value: fmtNumber(model?.summary?.maxConsecutiveDark), mono: true },
          ]}
        />
        <p className="help-text">
          Reported verbatim by <span className="mono">POST /api/roster</span>. The response carries an empty roster, so no
          schedule, totals or charts are rendered.
        </p>
      </div>
    </div>
  );
}

export function SuccessStrip({ model, lastRun, stale }) {
  const m = model.metrics;
  const facts = [
    { icon: CircleCheck, label: `${fmtNumber(m.valueTotal)} value` },
    { icon: Fuel, label: `${fmtLitres(m.fuelTotal)} L burned` },
    { icon: PlugZap, label: `${fmtNumber(m.outageHourCount)} outage hours` },
    { icon: ShieldCheck, label: m.totalDarkHours ? `${fmtNumber(m.totalDarkHours)} dark hours explained` : 'nothing shed' },
  ];
  return (
    <div className="card rise flex flex-wrap items-center gap-x-4 gap-y-2 px-3.5 py-2.5" data-tone="ok">
      <span className="inline-flex items-center gap-2 text-[12.5px] font-semibold tracking-tight text-ink">
        <span className="legend-swatch rc-on">
          <CircleCheck size={11} strokeWidth={2.4} aria-hidden="true" />
        </span>
        Optimization complete
      </span>
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5">
        {facts.map((f) => (
          <span key={f.label} className="inline-flex items-center gap-1.5 text-[11.5px] text-ink-muted">
            <f.icon size={12} strokeWidth={2} className="text-ink-faint" aria-hidden="true" />
            <span className="num">{f.label}</span>
          </span>
        ))}
      </div>
      <span className="toolbar ml-auto justify-end">
        {stale ? <Badge tone="amber">editor changed since this run</Badge> : null}
        {lastRun ? (
          <span className="num text-[10.5px] text-ink-faint">
            run {lastRun.at} · {lastRun.ms} ms
          </span>
        ) : null}
        {m.reconciles ? (
          <Badge tone="ok" icon={Info}>
            totals reconcile
          </Badge>
        ) : null}
      </span>
    </div>
  );
}

/* --------------------------------------------------------------- run panel */

const PHASE = {
  idle: { tone: 'mute', label: 'awaiting run', steps: ['pending', 'pending', 'pending'] },
  running: { tone: 'amber', label: 'solving', steps: ['done', 'active', 'pending'] },
  ok: { tone: 'volt', label: 'solved', steps: ['done', 'done', 'done'] },
  infeasible: { tone: 'amber', label: 'infeasible', steps: ['done', 'failed', 'pending'] },
  invalid: { tone: 'rose', label: 'invalid input', steps: ['failed', 'pending', 'pending'] },
  network: { tone: 'rose', label: 'request failed', steps: ['done', 'failed', 'failed'] },
};

export function RunPanel({ phase, run, result, onDownload, onPrint, model }) {
  const conf = PHASE[phase] || PHASE.idle;
  return (
    <Panel
      title="Run & Deliverables"
      subtitle="Solver pipeline for the current payload"
      icon={Info}
      bodyClass="space-y-3.5"
      meta={<Badge tone={conf.tone}>{conf.label}</Badge>}
      footer={
        <>
          <span className="mono">POST /api/roster</span>
          <span className="num">{fmtNumber(run.bytes)} B payload</span>
        </>
      }
    >
      <div className="progress-steps">
        {STEPS.map((step, i) => (
          <StatusRow key={step.id} state={conf.steps[i]} title={step.label} hint={step.hint} />
        ))}
      </div>

      <KeyValue
        className="border-t border-hairline pt-3.5 sm:grid-cols-2"
        items={[
          { label: 'Submitted', value: run.at ?? '—', mono: true },
          { label: 'Round trip', value: run.ms === null ? '—' : `${run.ms} ms`, mono: true },
          { label: 'HTTP status', value: run.http === null ? '—' : run.http, mono: true },
          { label: 'Roster slots', value: result ? Object.keys(result.roster || {}).length : '—', mono: true },
          {
            label: 'Shops / outage hrs',
            value: `${fmtNumber(model?.summary?.shopCount)} / ${fmtNumber(model?.summary?.outageHours)}`,
            mono: true,
          },
          { label: 'Fuel table steps', value: fmtNumber(model?.fuelTable?.length), mono: true },
        ]}
      />

      <div className="flex flex-wrap items-center gap-2 border-t border-hairline pt-3.5">
        <Button onClick={onDownload} disabled={!result} variant="default" size="sm" icon={Download}>
          Download JSON
        </Button>
        <Button onClick={onPrint} disabled={!result} variant="ghost" size="sm" icon={Printer}>
          Print A4
        </Button>
      </div>

      <p className="help-text">
        Download writes the raw response to <span className="mono text-ink-muted">roster_result.json</span>. Print opens the
        white A4 layout of this view.
      </p>
    </Panel>
  );
}

/* ---------------------------------------------------- pre-run configuration */

export function InputPreview({ model, onLoadSample, onRun, canRun, running }) {
  const s = model?.summary || {};
  const demand = s.totalDemandKw || 0;
  const overCapacity = demand > (model?.capacity ?? Infinity);
  const worstEntry = [...(model?.fuelTable || [])]
    .filter((f) => (f?.load_kw ?? 0) >= demand)
    .sort((a, b) => (a?.load_kw ?? 0) - (b?.load_kw ?? 0))[0];
  const worstBurn =
    worstEntry && model?.outageHours?.length
      ? (worstEntry.litres_per_hour ?? 0) * model.outageHours.length
      : null;

  return (
    <Panel
      id="roster"
      title="Submitted Day — Constraint Preview"
      subtitle="No schedule yet: this is the configuration on screen"
      icon={Grid3x3}
      bodyClass="space-y-3.5"
      meta={<Badge tone="mute">awaiting run</Badge>}
      footer={
        <>
          <span className="inline-flex items-center gap-1.5">
            <FileUp size={11} aria-hidden="true" /> upload, paste or load the sample, then run the solver
          </span>
          <span className="num">{fmtNumber(model?.hours?.length)} hourly slots · 10:00–19:00</span>
        </>
      }
    >
      <div>
        <p className="field-label mb-2">Grid availability across the day</p>
        <div className="flex gap-1">
          {(model?.hours || []).map((h) => (
            <div
              key={h.t}
              className={clsx(
                'flex-1 rounded-[7px] border px-1 py-2 text-center',
                h.gridAvailable ? 'border-grid-on/25 bg-grid-on/10 text-grid-on' : 'border-amber/30 bg-amber/10 text-amber'
              )}
              title={`${h.range} — ${h.gridAvailable ? 'mains available' : 'outage: the generator decides who stays on'}`}
            >
              <p className="num text-[9.5px] font-semibold leading-none">{slotLabel(h.t)}</p>
              <p className="mt-1 text-[8.5px] font-bold uppercase leading-none tracking-[0.06em]">
                {h.gridAvailable ? 'grid' : 'out'}
              </p>
            </div>
          ))}
        </div>
      </div>

      <KeyValue
        className="grid-cols-2 gap-x-5 border-t border-hairline pt-3.5 sm:grid-cols-3"
        items={[
          { label: 'Shops', value: `${fmtNumber(s.shopCount)} (${fmtNumber(s.mandatoryCount)} mandatory)` },
          { label: 'Combined demand', value: `${fmtNumber(demand)} kW`, tone: overCapacity ? 'rose' : 'volt' },
          { label: 'Generator capacity', value: `${fmtNumber(model?.capacity)} kW`, mono: true },
          { label: 'Fuel budget', value: `${fmtLitres(s.fuelBudget)} L`, mono: true },
          { label: 'Max consecutive dark', value: `${fmtNumber(s.maxConsecutiveDark)} h`, mono: true },
          {
            label: 'If every shop ran every outage hour',
            value: worstBurn === null ? '—' : `${fmtLitres(worstBurn)} L`,
            mono: true,
          },
        ]}
      />

      {overCapacity ? (
        <Alert tone="amber" icon={TriangleAlert} title="Demand exceeds the generator">
          All shops together draw {fmtNumber(demand)} kW against {fmtNumber(model?.capacity)} kW of capacity, so shedding is
          unavoidable during outages.
        </Alert>
      ) : (
        <p className="help-text">
          {fmtPct(model?.capacity ? demand / model.capacity : null)} of capacity is requested by {fmtNumber(s.shopCount)}{' '}
          shops; the solver still trades fuel against value hour by hour.
        </p>
      )}

      <div className="flex flex-wrap gap-2 border-t border-hairline pt-3.5">
        <Button onClick={onLoadSample} variant="ghost" size="sm" icon={FileUp}>
          Load sample
        </Button>
        <Button onClick={onRun} disabled={!canRun} variant="primary" size="sm" icon={running ? Spinner : Play}>
          {running ? 'Optimizing…' : 'Run Optimizer'}
        </Button>
      </div>
    </Panel>
  );
}

/**
 * Keeps every sidebar target real before a schedule exists: the analytics,
 * statistics and explanation sections stay on the page as compact pending
 * tiles instead of vanishing (so navigation never points at nothing).
 */
export function PendingSections({ note }) {
  const tiles = [
    {
      id: 'analytics',
      icon: Fuel,
      title: 'Hourly Energy Analytics',
      body: 'Load vs capacity, diesel burn per outage hour, cumulative usage and remaining budget.',
    },
    {
      id: 'shop-stats',
      icon: Grid3x3,
      title: 'Shop Statistics',
      body: 'Lit hours, dark hours and realised value for every shop, totalled against the engine response.',
    },
    {
      id: 'dark-reasons',
      icon: CircleAlert,
      title: 'Dark Hours & Reasons',
      body: 'The engine\'s own explanation for every shed hour, grouped by hour and shop.',
    },
  ];
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {tiles.map((tile) => (
        <section key={tile.id} id={tile.id} className="card section-anchor flex flex-col gap-2 p-3.5 no-print">
          <span className="stat-icon" aria-hidden="true">
            <tile.icon size={14} strokeWidth={1.9} />
          </span>
          <p className="text-[12.5px] font-semibold tracking-tight text-ink">{tile.title}</p>
          <p className="text-[11px] leading-relaxed text-ink-faint">{tile.body}</p>
          <span className="mt-auto pt-1">
            <Badge tone="mute">{note}</Badge>
          </span>
        </section>
      ))}
    </div>
  );
}

export function RosterEmpty() {
  return (
    <Panel id="roster" title="Generator Roster" subtitle="Hour-by-hour schedule" icon={Grid3x3}>
      <EmptyState
        icon={Hourglass}
        title="No roster to display"
        body="Once the optimizer answers, every shop gets a ten-hour row here with powered, dark and grid-on states — and each dark cell opens the engine's explanation."
      />
    </Panel>
  );
}
