"use client";

import { Play, Zap } from 'lucide-react';
import { Badge, Spinner, StatusDot } from './ui';
import { NAV_ITEMS } from './nav';

/**
 * Sticky top navigation: brand, live section tabs (every entry scrolls to a
 * real section), solver engine status, last-run metadata and the primary
 * Run Optimizer action wired to the page's submit handler. There is no
 * sidebar — this bar is the only navigation on the dashboard.
 */
export default function TopBar({
  activeId,
  chips,
  onNavigate,
  solver,
  lastRun,
  status,
  onRun,
  running,
  canRun,
  stale,
  version,
}) {
  return (
    <header className="topbar no-print">
      <div className="topbar-main">
        <a
          href="#overview"
          className="brand-mark"
          aria-label="Who Stays On? — jump to summary"
          onClick={(event) => {
            event.preventDefault();
            onNavigate('overview');
          }}
        >
          <Zap size={17} strokeWidth={2.3} />
        </a>

        <div className="min-w-0">
          <p className="brand-kicker">
            Who Stays On?
            <span className="brand-version mono">v{version}</span>
          </p>
          <h1 className="topbar-title">Generator Schedule</h1>
        </div>

        <div className="toolbar topbar-badges">
          {status === 'ok' ? <Badge tone="ok">Scheduled</Badge> : null}
          {status === 'infeasible' ? <Badge tone="amber">Infeasible</Badge> : null}
          {stale && status === 'ok' ? <Badge tone="amber">editor changed since this run</Badge> : null}
        </div>

        <div className="topbar-actions">
          <div className="engine-pill" title="Solver engine status">
            <StatusDot state={solver.tone} pulse={solver.busy} />
            <span className="engine-label">{solver.label}</span>
          </div>

          {lastRun ? (
            <div className="last-run">
              <span className="last-run-label">Last run</span>
              <span className="num last-run-value">
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
      </div>

      <nav className="topnav-tabs" aria-label="Dashboard sections">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = activeId === item.id;
          const chip = chips?.[item.id];
          return (
            <a
              key={item.id}
              href={`#${item.id}`}
              className="topnav-tab"
              data-active={active ? 'true' : 'false'}
              aria-current={active ? 'true' : undefined}
              onClick={(event) => {
                event.preventDefault();
                onNavigate(item.id);
              }}
            >
              <Icon size={13} strokeWidth={2} aria-hidden="true" />
              <span>{item.label}</span>
              {chip ? <span className="nav-tick">{chip}</span> : null}
            </a>
          );
        })}
      </nav>
    </header>
  );
}
