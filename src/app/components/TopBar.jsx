"use client";

import { Play, Zap } from 'lucide-react';
import { Badge, Spinner, StatusDot } from './ui';

/**
 * Sticky header: page identity, live solver status, last-run metadata (only
 * when a run actually happened) and the primary Run Optimizer action that is
 * wired to the page's existing submit handler.
 */
export default function TopBar({
  solver,
  lastRun,
  status,
  onRun,
  running,
  canRun,
  stale,
}) {
  return (
    <header className="topbar no-print">
      <div className="topbar-brand" aria-hidden="true"><Zap size={21} fill="currentColor" /></div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h1 className="truncate text-[16px] font-semibold tracking-[-0.02em] text-ink sm:text-[18px]">
            Generator Schedule
          </h1>
          {status === 'ok' ? <Badge tone="volt">Scheduled</Badge> : null}
          {status === 'infeasible' ? <Badge tone="amber">Infeasible</Badge> : null}
          {stale && status === 'ok' ? <Badge tone="amber">editor changed since this run</Badge> : null}
        </div>
        <p className="mt-0.5 hidden truncate text-[11.5px] text-ink-muted sm:block">
          WHO STAYS ON? · ENERGY OPTIMIZATION STUDIO
        </p>
      </div>

      <div className="flex items-center gap-2 sm:gap-2.5">
        <div
          className="hidden items-center gap-2 rounded-[10px] border border-hairline bg-surface-2 px-2.5 py-1.5 md:flex"
          title="Solver engine status"
        >
          <StatusDot state={solver.tone} pulse={solver.busy} />
          <span className="text-[11px] font-medium text-ink-muted">{solver.label}</span>
        </div>

        {lastRun ? (
          <div className="hidden flex-col items-end lg:flex">
            <span className="text-[9.5px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
              Last run
            </span>
            <span className="num text-[11.5px] font-medium text-ink-muted">
              {lastRun.at} · {lastRun.ms} ms
            </span>
          </div>
        ) : null}

        <button
          type="button"
          className="btn btn-primary"
          onClick={onRun}
          disabled={!canRun}
          aria-describedby="run-hint"
        >
          {running ? <Spinner size={14} /> : <Play size={14} strokeWidth={2.2} />}
          {running ? 'Optimizing…' : 'Run Optimizer'}
        </button>
        <span id="run-hint" className="sr-only">
          {canRun
            ? 'Sends the current JSON configuration to POST /api/roster and renders the schedule.'
            : 'Add a valid JSON configuration first.'}
        </span>
      </div>
    </header>
  );
}
