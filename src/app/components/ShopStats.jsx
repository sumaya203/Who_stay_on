"use client";

import { Boxes, ShieldCheck } from 'lucide-react';
import { Panel, Badge, clsx } from './ui';
import { fmtLitres, fmtNumber, fmtPct } from './analytics';

/**
 * Shop-level roll-up of the returned roster: how many of the outage hours each
 * shop stayed lit, what it paid in dark hours, and the value it actually
 * realised (summed from the submitted `value_per_slot` for powered hours only).
 */
export default function ShopStats({ model }) {
  const { shopStats, solved, metrics, outageHours } = model;
  const maxDark = Math.max(1, ...shopStats.map((s) => s.darkHours || 0));

  return (
    <Panel
      id="shop-stats"
      title="Shop Statistics"
      subtitle={`${shopStats.length} shops · ${outageHours.length} outage hours`}
      icon={Boxes}
      bodyClass="p-0"
      meta={
        solved ? (
          <Badge tone="mute">
            value Σ {fmtNumber(metrics.valueSum)} {metrics.reconciles ? '· matches value_total' : ''}
          </Badge>
        ) : null
      }
      footer={
        <>
          <span>Dark-hour counts come from the API response; value is summed from your configuration.</span>
          <span className="num">
            {fmtPct(
              metrics.totalSlots ? 1 - (metrics.darkSlots || 0) / metrics.totalSlots : null
            )}{' '}
            of scheduled shop-hours powered
          </span>
        </>
      }
    >
      <div className="table-wrap">
        <table className="dtable">
          <caption className="sr-only">Per-shop statistics for the current optimization result.</caption>
          <thead>
            <tr>
              <th scope="col" className="col-sticky">
                Shop
              </th>
              <th scope="col">Type</th>
              <th scope="col" className="text-right">
                Load
              </th>
              <th scope="col" className="text-right">
                Lit hrs
              </th>
              <th scope="col" className="text-right">
                Dark hrs
              </th>
              <th scope="col" className="text-right">
                Value
              </th>
              <th scope="col" className="w-[168px]">
                Uptime in outages
              </th>
            </tr>
          </thead>
          <tbody>
            {shopStats.map((s) => (
              <tr key={s.id}>
                <th scope="row" className="col-sticky">
                  <span className="shop-cell">
                    <span className="min-w-0">
                      <span className="shop-name block">{s.id}</span>
                      <span className="shop-kw">
                        {s.reasons.length ? `${s.reasons.length} explained dark hr${s.reasons.length === 1 ? '' : 's'}` : 'no dark hours'}
                      </span>
                    </span>
                  </span>
                </th>
                <td>
                  {s.type === 'mandatory' ? (
                    <Badge tone="volt" icon={ShieldCheck}>
                      Mandatory
                    </Badge>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-[11px] text-ink-muted">
                      <span className="h-1.5 w-1.5 rounded-full bg-ink-faint" aria-hidden="true" />
                      Normal
                    </span>
                  )}
                </td>
                <td className="num text-right text-ink">{fmtNumber(s.kw)} kW</td>
                <td className="num text-right">
                  <span className={clsx(s.poweredOutage ? 'text-volt' : 'text-ink-faint')}>
                    {s.poweredOutage === null ? '—' : `${s.poweredOutage}/${outageHours.length}`}
                  </span>
                </td>
                <td className="text-right">
                  <span
                    className={clsx(
                      'num inline-flex min-w-[30px] items-center justify-end gap-1 rounded-md px-1.5 py-0.5 text-[11.5px] font-semibold',
                      s.darkHours > 0 ? 'bg-rose/10 text-rose' : 'text-ink-faint'
                    )}
                    title={s.darkHours > 0 ? `${fmtPct(maxDark ? s.darkHours / maxDark : 0)} of the busiest shed shop` : 'Never shed'}
                  >
                    {s.darkHours === null ? '—' : s.darkHours}
                  </span>
                </td>
                <td className="num text-right text-ink">
                  {s.valueCaptured === null ? (
                    '—'
                  ) : (
                    <>
                      {fmtNumber(s.valueCaptured)}
                      {s.potential ? (
                        <span className="ml-1 text-[10px] font-normal text-ink-faint">
                          /{fmtNumber(s.potential)}
                        </span>
                      ) : null}
                    </>
                  )}
                </td>
                <td>
                  <div className="flex items-center gap-2">
                    <div className="meter h-1.5 flex-1" data-tone={s.type === 'mandatory' ? 'volt' : 'ok'}>
                      <span style={{ width: `${Math.max(0, Math.min(1, s.outageShare ?? 0)) * 100}%` }} />
                    </div>
                    <span className="num w-9 text-right text-[10.5px] text-ink-faint">
                      {s.outageShare === null ? '—' : fmtPct(s.outageShare)}
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          {solved && shopStats.length ? (
            <tfoot>
              <tr>
                <th scope="row" className="col-sticky">
                  <span className="shop-name">Total</span>
                </th>
                <td aria-hidden="true" />
                <td className="num text-right">{fmtNumber(metrics.totalDemandKw)} kW</td>
                <td className="num text-right">{fmtNumber(metrics.poweredSlots)}</td>
                <td className="num text-right">{fmtNumber(metrics.totalDarkHours)}</td>
                <td className="num text-right">{fmtNumber(metrics.valueSum)}</td>
                <td className="text-[10.5px] text-ink-faint">
                  {fmtLitres(metrics.fuelTotal)} L burned to get here
                </td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </Panel>
  );
}
