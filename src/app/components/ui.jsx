"use client";

import clsx from 'clsx';
import { Loader2 } from 'lucide-react';

export { clsx };

/** Section shell: title + optional meta on the right, body slot, footer slot. */
export function Panel({ id, title, subtitle, icon: Icon, meta, footer, children, className, bodyClass, tone }) {
  return (
    <section id={id} className={clsx('card card-raise section-anchor rise', className)} data-tone={tone}>
      {(title || meta) && (
        <div className="card-head">
          {Icon ? <Icon size={15} strokeWidth={1.9} className="text-ink-faint shrink-0" aria-hidden="true" /> : null}
          <div className="min-w-0 flex-1">
            <h2 className="card-title truncate">{title}</h2>
            {subtitle ? <p className="card-sub truncate mt-0.5">{subtitle}</p> : null}
          </div>
          {meta ? <div className="toolbar justify-end shrink-0">{meta}</div> : null}
        </div>
      )}
      <div className={clsx('card-body', bodyClass)}>{children}</div>
      {footer ? (
        <div className="legend-row justify-between gap-3 text-[11px] text-ink-faint">{footer}</div>
      ) : null}
    </section>
  );
}

/** Shared button: variants/sizes map 1:1 to the .btn-* classes in globals.css. */
export function Button({
  variant = 'default',
  size = 'md',
  icon: Icon,
  iconRight: IconRight,
  children,
  className,
  type = 'button',
  ...rest
}) {
  return (
    <button
      type={type}
      className={clsx(
        'btn',
        variant === 'primary' && 'btn-primary',
        variant === 'ghost' && 'btn-ghost',
        size === 'sm' && 'btn-sm',
        size === 'lg' && 'btn-lg',
        className
      )}
      {...rest}
    >
      {Icon ? <Icon size={size === 'sm' ? 12 : 14} strokeWidth={2.1} aria-hidden="true" /> : null}
      {children}
      {IconRight ? <IconRight size={size === 'sm' ? 12 : 14} strokeWidth={2.1} aria-hidden="true" /> : null}
    </button>
  );
}

export function Badge({ tone = 'mute', icon: Icon, children, className, ...rest }) {
  return (
    <span className={clsx('badge', `badge-${tone}`, className)} {...rest}>
      {Icon ? <Icon size={11} strokeWidth={2.2} aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

export function PanelHeading({ title, subtitle, count }) {
  return (
    <div className="flex flex-wrap items-center gap-2.5 px-0.5">
      <h2 className="text-[15px] font-semibold tracking-[-0.02em] text-ink">{title}</h2>
      {subtitle ? <span className="text-[11.5px] text-ink-faint">{subtitle}</span> : null}
      {count ? <Badge tone="mute" className="ml-auto">{count}</Badge> : null}
    </div>
  );
}

export function StatusDot({ state = 'idle', pulse = false, className }) {
  const tone = state === 'live' ? 'dot-live' : state === 'warn' ? 'dot-warn' : state === 'bad' ? 'dot-bad' : 'dot-idle';
  return (
    <span
      aria-hidden="true"
      className={clsx('dot', tone, pulse && 'pulse-live', className)}
    />
  );
}

export function Spinner({ size = 14, className }) {
  return <Loader2 size={size} className={clsx('spin', className)} aria-hidden="true" />;
}

/** Numeric readout with unit + optional meter used by the summary row. */
export function StatCard({ label, value, unit, foot, icon: Icon, tone, meter, emphasis, className }) {
  return (
    <article className={clsx('card stat-card card-raise', className)} data-tone={tone}>
      <span className="stat-accent" aria-hidden="true" />
      <div className="stat-top">
        <span className="stat-label">{label}</span>
        {Icon ? (
          <span className="stat-icon">
            <Icon size={14} strokeWidth={1.9} aria-hidden="true" />
          </span>
        ) : null}
      </div>
      <p className={clsx('stat-value', emphasis === 'lg' && 'text-volt')}>
        {value === null || value === undefined || value === '' ? (
          <span className="text-ink-faint">—</span>
        ) : (
          <span className="truncate">{value}</span>
        )}
        {unit ? <span className="stat-unit">{unit}</span> : null}
      </p>
      {meter !== undefined && meter !== null ? (
        <div className="meter" role="presentation">
          <span style={{ width: `${Math.max(0, Math.min(1, meter)) * 100}%` }} />
        </div>
      ) : null}
      {foot ? <p className="stat-foot">{foot}</p> : null}
    </article>
  );
}

export function EmptyState({ icon: Icon, title, body, steps, action }) {
  return (
    <div className="state-panel">
      {Icon ? (
        <span className="state-icon">
          <Icon size={20} strokeWidth={1.7} aria-hidden="true" />
        </span>
      ) : null}
      <div className="space-y-1">
        <h3 className="text-[15px] font-semibold text-ink tracking-tight">{title}</h3>
        {body ? <p className="mx-auto max-w-md text-[12.5px] leading-relaxed text-ink-muted">{body}</p> : null}
      </div>
      {steps?.length ? (
        <ol className="mt-1 grid gap-1.5 text-left w-full max-w-md">
          {steps.map((s, i) => (
            <li key={i} className="flex items-start gap-2.5 text-[12px] text-ink-faint">
              <span className="mono mt-px text-[10px] leading-5 text-ink-muted rounded-md border border-hairline bg-surface-3/60 px-1.5">
                {i + 1}
              </span>
              <span className="leading-5">{s}</span>
            </li>
          ))}
        </ol>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function Alert({ tone = 'rose', icon: Icon, title, children, className }) {
  return (
    <div className={clsx('alert', `alert-${tone}`, className)} role={tone === 'volt' ? 'status' : 'alert'}>
      {Icon ? <Icon size={15} strokeWidth={1.9} className="mt-0.5 shrink-0" aria-hidden="true" /> : null}
      <div className="min-w-0">
        {title ? <p className="text-[12.5px] font-semibold tracking-tight">{title}</p> : null}
        <div className={clsx(title && 'mt-1')}>{children}</div>
      </div>
    </div>
  );
}

export function KeyValue({ items, className }) {
  return (
    <dl className={clsx('grid gap-x-4 gap-y-2', className)}>
      {items.map((item) => (
        <div key={item.label} className="flex items-baseline justify-between gap-3">
          <dt className="text-[11.5px] text-ink-faint">{item.label}</dt>
          <dd
            className={clsx(
              'num text-[12px] font-semibold text-ink',
              item.mono && 'mono text-[11.5px] font-medium',
              item.tone === 'volt' && 'text-volt',
              item.tone === 'amber' && 'text-amber',
              item.tone === 'rose' && 'text-rose'
            )}
          >
            {item.value ?? '—'}
          </dd>
        </div>
      ))}
    </dl>
  );
}
