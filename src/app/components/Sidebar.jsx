"use client";

import { Zap } from 'lucide-react';
import { NAV_GROUPS } from './nav';
import { StatusDot } from './ui';

/**
 * Sidebar: brand, in-page navigation (every entry targets a real section),
 * run metadata and engine status. Rendered once — a fixed drawer below 1024px
 * and a sticky rail above it (see `.sidebar` in globals.css).
 */
export default function Sidebar({ activeId, chips, solver, onNavigate, version }) {
  return (
    <nav className="flex h-full min-h-0 flex-col gap-4" aria-label="Dashboard sections">
      <div className="flex items-center gap-2.5 px-1">
        <span className="brand-mark" aria-hidden="true">
          <Zap size={17} strokeWidth={2.3} />
        </span>
        <div className="min-w-0">
          <p className="truncate text-[13.5px] font-semibold tracking-tight text-ink">Who Stays On?</p>
          <p className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
            Load-shedding console
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="nav-group-label">{group.label}</p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = activeId === item.id;
                const chip = chips?.[item.id];
                return (
                  <li key={item.id}>
                    <a
                      href={`#${item.id}`}
                      className="nav-item"
                      data-active={active ? 'true' : 'false'}
                      aria-current={active ? 'true' : undefined}
                      onClick={(event) => {
                        event.preventDefault();
                        onNavigate(item.id);
                      }}
                    >
                      <Icon className="nav-icon" size={14} strokeWidth={1.9} aria-hidden="true" />
                      <span className="truncate">{item.label}</span>
                      {chip ? <span className="nav-tick">{chip}</span> : null}
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <div className="mt-auto space-y-2">
        <div className="rounded-[11px] border border-hairline bg-surface-2 p-3">
          <p className="nav-group-label" style={{ padding: 0, margin: '0 0 8px' }}>
            Solver engine
          </p>
          <div className="flex items-center gap-2">
            <StatusDot state={solver.tone} pulse={solver.busy} />
            <span className="text-[11.5px] font-medium text-ink">{solver.label}</span>
          </div>
          <p className="mt-1.5 text-[10.5px] leading-relaxed text-ink-faint">{solver.detail}</p>
        </div>

        <p className="mono px-1 text-[10px] leading-relaxed text-ink-faint">
          v{version} · branch &amp; bound
        </p>
      </div>
    </nav>
  );
}
