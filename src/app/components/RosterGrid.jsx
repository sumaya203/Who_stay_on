"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, X, Table2, Info } from 'lucide-react';
import { Panel, Badge, clsx } from './ui';
import { fmtNumber, reasonTag } from './analytics';

const CELL = {
  grid: {
    cls: 'rc rc-grid',
    sr: (label) => `Mains available at ${label} — shop runs on grid power, no diesel burned.`,
  },
};

function RosterCell({ hour, shop, onOpenReason, active }) {
  if (hour.gridAvailable) {
    return (
      <td key={shop.id} className="td-slot">
        <span className={CELL.grid.cls} title={CELL.grid.sr(hour.label)}>
          GRID
          <span className="sr-only">{` — ${CELL.grid.sr(hour.label)}`}</span>
        </span>
      </td>
    );
  }

  const powered = hour.powered.includes(shop.id);
  if (powered) {
    return (
      <td key={shop.id} className="td-slot">
        <span
          className="rc rc-on"
          title={`Powered at ${hour.label} — ${shop.kw} kW on the generator`}
        >
          <Check size={13} strokeWidth={3} aria-hidden="true" />
          <span className="sr-only">{`Powered at ${hour.label}`}</span>
        </span>
      </td>
    );
  }

  const reason = shop.reasons.find((r) => r.t === hour.t)?.reason || '';
  return (
    <td key={shop.id} className="td-slot">
      <button
        type="button"
        className="rc rc-off"
        data-reason-trigger
        aria-haspopup="dialog"
        aria-expanded={active}
        aria-label={`Dark at ${hour.label} — ${shop.id}. Show the engine's explanation.`}
        title={reason ? `${hour.label} · ${reason}` : `Dark at ${hour.label}`}
        onClick={(event) => onOpenReason(event.currentTarget, { shopId: shop.id, shop, hour, reason })}
      >
        <X size={12} strokeWidth={3} aria-hidden="true" />
        <span className="sr-only">{`Dark at ${hour.label}`}</span>
      </button>
    </td>
  );
}

/**
 * The roster: one row per shop, ten hourly columns, three real states.
 * Dark cells stay interactive (hover title for mouse, click/tap and keyboard
 * for everyone else) and open the engine's own explanation text.
 */
export default function RosterGrid({ model, stale }) {
  const { hours = [], shopStats = [], capacity, solved } = model || {};
  const [pop, setPop] = useState(null);
  const popRef = useRef(null);
  const triggerRef = useRef(null);

  const openReason = useCallback((el, payload) => {
    const rect = el.getBoundingClientRect();
    const width = Math.min(340, window.innerWidth - 24);
    const half = width / 2;
    const x = Math.min(Math.max(rect.left + rect.width / 2, half + 12), window.innerWidth - half - 12);
    const below = rect.bottom + 10;
    const flip = below + 210 > window.innerHeight;
    triggerRef.current = el;
    setPop({
      x,
      y: flip ? rect.top - 10 : below,
      placement: flip ? 'above' : 'below',
      width,
      ...payload,
    });
  }, []);

  const closeReason = useCallback((restoreFocus = true) => {
    setPop(null);
    if (restoreFocus && triggerRef.current) {
      triggerRef.current.focus?.();
      triggerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!pop) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        closeReason();
      }
    };
    const onPointer = (event) => {
      if (popRef.current?.contains(event.target)) return;
      if (event.target?.closest?.('[data-reason-trigger]')) return;
      setPop(null);
      triggerRef.current = null;
    };
    const onReflow = () => setPop(null);
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    window.addEventListener('resize', onReflow);
    window.addEventListener('scroll', onReflow, true);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('resize', onReflow);
      window.removeEventListener('scroll', onReflow, true);
    };
  }, [pop, closeReason]);

  useEffect(() => {
    if (pop) popRef.current?.focus?.();
  }, [pop]);

  const totalDark = shopStats.reduce((sum, s) => sum + (s.darkHours || 0), 0);

  return (
    <Panel
      id="roster"
      title="Generator Roster"
      subtitle={`${hours.length} hourly slots · ${shopStats.length} shop${shopStats.length === 1 ? '' : 's'} · 10:00–19:00`}
      icon={Table2}
      bodyClass="p-0"
      meta={
        <>
          {solved ? <Badge tone={totalDark ? 'amber' : 'volt'}>{totalDark} dark slot{totalDark === 1 ? '' : 's'}</Badge> : null}
          {stale ? <Badge tone="amber">from an earlier run</Badge> : null}
          <Badge tone="mute">{capacity ? `${fmtNumber(capacity)} kW cap` : 'no capacity set'}</Badge>
        </>
      }
      footer={
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            <span className="legend-item">
              <span className="rc rc-on" style={{ width: 22, height: 17 }}>
                <Check size={10} strokeWidth={3.2} aria-hidden="true" />
              </span>
              <span className="text-ink">Powered</span> — on the generator
            </span>
            <span className="legend-item">
              <span className="rc rc-off" style={{ width: 22, height: 17 }}>
                <X size={10} strokeWidth={3.2} aria-hidden="true" />
              </span>
              <span className="text-ink">Dark</span> — shed; open for the reason
            </span>
            <span className="legend-item">
              <span className="rc rc-grid" style={{ width: 30, height: 17, fontSize: 8 }}>
                GRID
              </span>
              <span className="text-ink">GRID</span> — mains available
            </span>
          </div>
        </>
      }
    >
      <div className="table-wrap">
        <table className="dtable">
          <caption className="sr-only">
            Generator roster: for each shop and hour, whether it was powered, dark, or running on grid power.
          </caption>
          <thead>
            <tr>
              <th scope="col" className="col-sticky">
                Shop
              </th>
              <th scope="col">Type</th>
              {hours.map((h) => (
                <th key={h.t} scope="col" className="th-slot" data-outage={h.outage ? 'true' : 'false'}>
                  {h.label}
                </th>
              ))}
              <th scope="col" className="text-right">
                Dark
              </th>
            </tr>
          </thead>
          <tbody>
            {shopStats.map((shop) => (
              <tr key={shop.id} className={clsx(shop.darkHours > 0 && 'row-flag')}>
                <th scope="row" className="col-sticky">
                  <span className="shop-cell">
                    <span
                      aria-hidden="true"
                      className={clsx(
                        'h-6 w-[2px] shrink-0 rounded-full',
                        shop.type === 'mandatory' ? 'bg-volt' : 'bg-hairline-strong'
                      )}
                    />
                    <span className="min-w-0">
                      <span className="shop-name block">{shop.id}</span>
                      <span className="shop-kw">{fmtNumber(shop.kw)} kW</span>
                    </span>
                  </span>
                </th>
                <td>
                  {shop.type === 'mandatory' ? (
                    <Badge tone="volt">Mandatory</Badge>
                  ) : (
                    <Badge tone="mute">Normal</Badge>
                  )}
                </td>
                {hours.map((h) => (
                  <RosterCell
                    key={h.t}
                    hour={h}
                    shop={shop}
                    onOpenReason={openReason}
                    active={Boolean(pop) && pop.shopId === shop.id && pop.hour.t === h.t}
                  />
                ))}
                <td className="text-right">
                  <span
                    className={clsx(
                      'num inline-flex min-w-[26px] justify-center rounded-md px-1.5 py-0.5 text-[11.5px] font-semibold',
                      shop.darkHours > 0 ? 'bg-amber/10 text-amber' : 'text-ink-faint'
                    )}
                    title={
                      shop.darkHours > 0
                        ? `${shop.darkHours} dark hour${shop.darkHours === 1 ? '' : 's'} across ${model.outageHours.length} outage hours`
                        : 'Never shed during an outage'
                    }
                  >
                    {shop.darkHours === null ? '—' : shop.darkHours}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
          {solved ? (
            <tfoot>
              <tr>
                <th scope="row" className="col-sticky">
                  <span className="shop-cell">
                    <span className="shop-name block">Genset load</span>
                    <span className="shop-kw">per hour, of {fmtNumber(capacity)} kW</span>
                  </span>
                </th>
                <td aria-hidden="true" />
                {hours.map((h) => (
                  <td key={h.t} className="td-slot">
                    {h.gridAvailable ? (
                      <span className="text-[10px] font-semibold text-grid-on">—</span>
                    ) : (
                      <span className="num text-[10.5px] font-semibold text-ink">{fmtNumber(h.loadKw)}</span>
                    )}
                  </td>
                ))}
                <td className="text-right num">{totalDark}</td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>

      {pop ? (
        <div
          ref={popRef}
          role="dialog"
          aria-label={`Why ${pop.shopId} is dark at ${pop.hour.label}`}
          tabIndex={-1}
          className="popover outline-none"
          style={{
            left: pop.x,
            top: pop.y,
            width: pop.width,
            transform: pop.placement === 'above' ? 'translate(-50%, -100%)' : 'translateX(-50%)',
          }}
        >
          <div className="popover-title">
            <span className="legend-swatch rc-off">
              <X size={9} strokeWidth={3.4} aria-hidden="true" />
            </span>
            <span className="mono">{pop.shopId}</span>
            <span className="text-ink-faint">·</span>
            <span className="num text-ink-muted">{pop.hour.range}</span>
            <button
              type="button"
              className="btn btn-ghost btn-sm ml-auto"
              onClick={() => closeReason()}
              aria-label="Close explanation"
            >
              <X size={12} aria-hidden="true" />
            </button>
          </div>
          <p className="popover-body">{pop.reason || 'The engine returned this shop as dark without a specific reason.'}</p>
          <div className="popover-meta">
            <Badge tone={reasonTag(pop.reason).tone}>{reasonTag(pop.reason).label}</Badge>
            <span className="chip">
              {fmtNumber(pop.shop?.kw ?? 0)} kW shed
            </span>
            <span className="chip">{fmtNumber(pop.hour.shedKw)} kW total shed</span>
            <span className="inline-flex items-center gap-1 text-[10px] text-ink-faint">
              <Info size={11} aria-hidden="true" /> engine output, unedited
            </span>
          </div>
        </div>
      ) : null}
    </Panel>
  );
}
