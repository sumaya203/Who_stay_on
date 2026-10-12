"use client";

import { useRef, useState } from 'react';
import { FileUp, FileJson, Trash2, Play, CircleCheck, CircleAlert, Clock } from 'lucide-react';
import { Panel, Badge, Spinner, Alert } from './ui';
import { clsx } from './ui';
import { fmtNumber } from './analytics';

/**
 * Configuration workspace: upload dropzone, editable JSON textarea, sample
 * loader, clear/reset, live client-side parse feedback and the run action.
 * All state and network work stays in the page — this component only reads and
 * writes the existing `jsonInput` / submit / sample / upload handlers.
 */
export default function ConfigPanel({
  jsonInput,
  onChange,
  onFile,
  onLoadSample,
  onClear,
  onRun,
  running,
  parse,
  summary,
  apiErrors,
  serverNote,
  stale,
}) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const handleDrop = (event) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => onChange(typeof evt.target.result === 'string' ? evt.target.result : '');
    reader.readAsText(file);
  };

  const lines = jsonInput ? jsonInput.split('\n').length : 0;
  const canRun = Boolean(jsonInput.trim()) && !running;

  const statusBadge = running ? (
    <Badge tone="amber" icon={Spinner}>
      Working
    </Badge>
  ) : parse.ok ? (
    <Badge tone="volt" icon={CircleCheck}>
      Valid JSON
    </Badge>
  ) : parse.empty ? (
    <Badge tone="mute">Empty</Badge>
  ) : (
    <Badge tone="rose" icon={CircleAlert}>
      Parse error
    </Badge>
  );

  return (
    <Panel
      id="configuration"
      title="Input Configuration"
      subtitle="POSTed unchanged to /api/roster"
      icon={FileJson}
      bodyClass="space-y-3.5"
      meta={
        <>
          {stale ? <Badge tone="amber">modified since run</Badge> : null}
          {statusBadge}
        </>
      }
      footer={
        <>
          <span className="num">
            {lines} {lines === 1 ? 'line' : 'lines'} · {fmtNumber(jsonInput.length)} chars
          </span>
          <span className="num text-right">
            {parse.ok
              ? `${summary.shopCount} shops · ${summary.fuelTableSteps} fuel steps · ${fmtNumber(jsonInput.length, 0)} B payload`
              : 'JSON must parse before the solver is called'}
          </span>
        </>
      }
    >
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-stretch">
        {/* Upload dropzone */}
        <label
          className="dropzone"
          data-dragging={dragging ? 'true' : 'false'}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
        >
          <span className="dz-icon" aria-hidden="true">
            <FileUp size={15} strokeWidth={1.9} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[12.5px] font-semibold text-ink">Upload configuration</span>
            <span className="block text-[11px] text-ink-faint">
              Drop a <span className="mono">.json</span> file here or click to browse
            </span>
          </span>
          <input
            ref={inputRef}
            type="file"
            accept=".json,application/json"
            className="sr-only"
            onChange={(event) => {
              onFile(event);
              if (inputRef.current) inputRef.current.value = '';
            }}
          />
        </label>

        <div className="flex gap-2 lg:w-[188px] lg:flex-col">
          <button type="button" className="btn flex-1" onClick={onLoadSample} title="Load the bundled 3-shop sample scenario">
            <Clock size={13} strokeWidth={2} aria-hidden="true" />
            Load sample
          </button>
          <button
            type="button"
            className="btn flex-1"
            onClick={onClear}
            disabled={!jsonInput.length && !running}
            title="Clear the editor"
          >
            <Trash2 size={13} strokeWidth={2} aria-hidden="true" />
            Clear
          </button>
        </div>
      </div>

      <div>
        <div className="mb-1.5 flex items-baseline justify-between gap-3">
          <label className="field-label" htmlFor="json-editor">
            JSON configuration
          </label>
          <span className="help-text">grid_available · capacity · fuel budget · shops</span>
        </div>
        <div className="editor-surface">
          <textarea
            id="json-editor"
            className="text-area w-full resize-y font-mono"
            style={{ height: 'clamp(240px, 38vh, 460px)', border: 'none', borderRadius: 0 }}
            placeholder='{"grid_available": [true, false, ...], "shops": [...]}'
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            aria-describedby="json-feedback"
            value={jsonInput}
            onChange={(event) => onChange(event.target.value)}
          />
        </div>
        <div className="editor-meta" id="json-feedback" aria-live="polite">
          {parse.ok ? (
            <>
              <span className="inline-flex items-center gap-1.5 text-ok">
                <CircleCheck size={12} strokeWidth={2.2} aria-hidden="true" />
                Parses cleanly
              </span>
              <span className="num">{summary.shopCount} shops</span>
              <span className="num">{summary.outageHours} outage hrs</span>
              <span className="num">{fmtNumber(summary.capacityKw)} kW cap</span>
              <span className="num">{fmtNumber(summary.fuelBudget, 2)} L budget</span>
            </>
          ) : (
            <span className={clsx('inline-flex items-center gap-1.5', parse.empty ? 'text-ink-faint' : 'text-rose')}>
              {parse.empty ? (
                <Clock size={12} strokeWidth={2.2} aria-hidden="true" />
              ) : (
                <CircleAlert size={12} strokeWidth={2.2} aria-hidden="true" />
              )}
              {parse.error}
            </span>
          )}
        </div>
      </div>

      {apiErrors ? (
        <Alert tone="rose" icon={CircleAlert} title="The API rejected this configuration">
          <ul className="space-y-0.5">
            {apiErrors.map((line, i) => (
              <li key={i} className="mono text-[11.5px] leading-relaxed">
                {line}
              </li>
            ))}
          </ul>
        </Alert>
      ) : null}

      {serverNote ? (
        <Alert tone="amber" icon={CircleAlert} title="Request did not complete">
          {serverNote}
        </Alert>
      ) : null}

      <div className="flex flex-col-reverse items-stretch gap-2.5 border-t border-hairline pt-3.5 sm:flex-row sm:items-center sm:justify-between">
        <p className="help-text max-w-sm sm:order-first">
          Validation is enforced server-side; the dashboard never edits your numbers.
        </p>
        <button type="button" className="btn btn-primary btn-lg" onClick={onRun} disabled={!canRun}>
          {running ? <Spinner size={15} /> : <Play size={15} strokeWidth={2.2} aria-hidden="true" />}
          {running ? 'Optimizing…' : 'Run Optimizer'}
        </button>
      </div>
    </Panel>
  );
}
