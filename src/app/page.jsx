"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import TopBar from './components/TopBar';
import SummaryCards from './components/SummaryCards';
import ConfigPanel from './components/ConfigPanel';
import RosterGrid from './components/RosterGrid';
import EnergyAnalytics from './components/EnergyAnalytics';
import ShopStats from './components/ShopStats';
import DarkReasons from './components/DarkReasons';
import {
  InputPreview,
  InfeasibleState,
  OptimizerProgress,
  RosterEmpty,
  PendingSections,
  RunPanel,
  SuccessStrip,
  ErrorState,
} from './components/States';
import { Panel, Badge } from './components/ui';
import { buildModel, errorLines, fmtLitres, fmtNumber, parseConfig } from './components/analytics';
import { scrollToSection, SECTION_IDS, useActiveSection, NAV_GROUPS } from './components/nav';

const APP_VERSION = '1.0.0';

/* Fallback copy of public/sample_input.json, used only if the static file
   cannot be fetched (e.g. opened without the Next.js server). */
const SAMPLE_FALLBACK = {
  grid_available: [true, false, false, true, false, false, true, true, false, true],
  generator_capacity_kw: 100,
  fuel_budget_litres: 50.0,
  max_consecutive_dark: 2,
  fuel_table: [
    { load_kw: 30, litres_per_hour: 1.5 },
    { load_kw: 70, litres_per_hour: 3.2 },
    { load_kw: 100, litres_per_hour: 5.0 },
  ],
  shops: [
    {
      id: 'A_MANDATORY',
      kw: 20,
      type: 'mandatory',
      value_per_slot: [10, 10, 10, 10, 10, 10, 10, 10, 10, 10],
    },
    {
      id: 'B_NORMAL',
      kw: 40,
      type: 'normal',
      value_per_slot: [5, 15, 25, 5, 20, 10, 5, 5, 30, 5],
    },
    {
      id: 'C_NORMAL',
      kw: 30,
      type: 'normal',
      value_per_slot: [10, 5, 10, 15, 5, 25, 10, 10, 5, 10],
    },
  ],
};

const REQUEST_TIMEOUT_MS = 30000;
const EMPTY_RUN = { at: null, ms: null, http: null, bytes: 0 };
const clock = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

/**
 * Guards against a backend that answers with something the dashboard cannot
 * read — a wrong shape must surface as an error, never as a rendered result.
 */
function describeShapeProblem(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return 'The server did not return a JSON object.';
  }
  if (data.status === 'ok' && (!data.roster || typeof data.roster !== 'object')) {
    return 'The response is missing its roster.';
  }
  if (data.status === 'infeasible' && typeof data.reason !== 'string') {
    return 'The infeasible response carries no reason.';
  }
  if (data.status !== 'ok' && data.status !== 'infeasible') {
    return `Unexpected response status "${String(data.status)}".`;
  }
  return null;
}

export default function Page() {
  const [jsonInput, setJsonInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  // presentation-only additions: failure kind, upload feedback, run metadata and
  // the exact payload the rendered result belongs to (so editing the textarea
  // never re-labels an older run with newer numbers).
  const [errorKind, setErrorKind] = useState(null);
  const [uploadError, setUploadError] = useState(null);
  const [run, setRun] = useState(EMPTY_RUN);
  const [submitted, setSubmitted] = useState(null);
  const [submittedRaw, setSubmittedRaw] = useState('');
  const [engine, setEngine] = useState('checking');

  const activeId = useActiveSection(SECTION_IDS);

  /* --------------------------------------------------------------- actions */

  const setInputText = useCallback((value) => {
    setJsonInput(typeof value === 'string' ? value : '');
  }, []);

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    const reader = new FileReader();
    reader.onload = (evt) => {
      setInputText(evt.target.result);
      setUploadError(null);
    };
    reader.onerror = () => {
      setUploadError(`Could not read ${file.name}. Try again, or paste the JSON instead.`);
    };
    reader.readAsText(file);
  };

  const handleLoadSample = useCallback(async () => {
    setUploadError(null);
    try {
      const res = await fetch('/sample_input.json', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      JSON.parse(text); // trust the file only if it parses
      setInputText(text);
    } catch {
      setInputText(JSON.stringify(SAMPLE_FALLBACK, null, 2));
    }
  }, [setInputText]);

  const handleClear = () => {
    setJsonInput('');
    setResult(null);
    setError(null);
    setErrorKind(null);
    setUploadError(null);
    setSubmitted(null);
    setSubmittedRaw('');
    setRun(EMPTY_RUN);
  };

  const handleSubmit = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    setErrorKind(null);
    setResult(null);

    let parsed;
    try {
      parsed = JSON.parse(jsonInput);
    } catch (e) {
      setError(`Invalid JSON syntax — ${e.message}`);
      setErrorKind('parse');
      setLoading(false);
      return;
    }

    const payload = JSON.stringify(parsed);
    const startedAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch('/api/roster', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        signal: controller.signal,
      });

      const rawBody = await res.text();
      let data = null;
      try {
        data = JSON.parse(rawBody);
      } catch {
        data = null;
      }

      setRun({ at: clock(), ms: Date.now() - startedAt, http: res.status, bytes: new Blob([payload]).size });

      if (!res.ok) {
        const messages = Array.isArray(data?.errors) && data.errors.length
          ? data.errors
          : [`Request failed with HTTP ${res.status}.`];
        setError(messages.join('\n'));
        setErrorKind('api');
      } else {
        const shapeProblem = describeShapeProblem(data);
        if (shapeProblem) {
          setError(shapeProblem);
          setErrorKind('api');
        } else {
          setSubmitted(parsed);
          setSubmittedRaw(jsonInput);
          setResult(data);
        }
      }
    } catch (err) {
      setRun({ at: clock(), ms: Date.now() - startedAt, http: null, bytes: new Blob([payload]).size });
      if (err?.name === 'AbortError') {
        setError(`The optimizer did not answer within ${REQUEST_TIMEOUT_MS / 1000} s. Check the server and run again.`);
        setErrorKind('api');
      } else {
        setError('Network error communicating with the API.');
        setErrorKind('network');
      }
    } finally {
      clearTimeout(timeout);
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'roster_result.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => window.print();

  /* ---------------------------------------------------- derived view model */

  const parse = useMemo(() => parseConfig(jsonInput), [jsonInput]);
  const inputModel = useMemo(() => buildModel(parse.ok ? parse.data : null, null), [parse]);
  const resultModel = useMemo(() => buildModel(submitted, result), [submitted, result]);

  // Results always describe the run they came from; the live textarea only
  // drives the pre-run preview and the configuration facts.
  const model = submitted ? resultModel : inputModel;

  const apiLines = useMemo(() => errorLines(error), [error]);
  const stale = Boolean(submittedRaw) && jsonInput !== submittedRaw;

  const phase = loading
    ? 'running'
    : result?.status === 'ok'
      ? 'ok'
      : result?.status === 'infeasible'
        ? 'infeasible'
        : errorKind === 'network'
          ? 'network'
          : errorKind
            ? 'invalid'
            : 'idle';

  const solver = useMemo(() => {
    if (loading) {
      return {
        tone: 'warn',
        busy: true,
        label: 'Solving',
        detail: `${fmtNumber(model.outageHours.length)} outage hours · branch & bound`,
      };
    }
    if (engine === 'checking') return { tone: 'idle', busy: false, label: 'Checking engine', detail: 'GET /api/health' };
    if (engine === 'offline') {
      return { tone: 'bad', busy: false, label: 'Engine offline', detail: '/api/health did not answer.' };
    }
    if (errorKind === 'api') {
      return { tone: 'bad', busy: false, label: 'Engine ready', detail: 'The last payload was rejected.' };
    }
    return {
      tone: 'live',
      busy: false,
      label: 'Engine ready',
      detail: run.ms !== null ? `Last response in ${run.ms} ms` : 'Exact search · ≤ 12 shops, 10 slots',
    };
  }, [loading, engine, errorKind, run.ms, model.outageHours.length]);

  const chips = useMemo(
    () => ({
      overview: phase === 'ok' ? `value ${fmtNumber(result?.value_total ?? 0)}` : null,
      roster: result?.status === 'ok' ? `${Object.keys(result.roster || {}).length} slots` : null,
      'dark-reasons': result?.status === 'ok' ? `${resultModel.metrics.totalDarkHours ?? 0} shed` : null,
      analytics: result?.status === 'ok' ? `${resultModel.hours.length} hrs` : null,
      'shop-stats': inputModel.summary?.shopCount ? `${inputModel.summary.shopCount} shops` : null,
      configuration: jsonInput.trim() ? (parse.ok ? 'ready' : 'fix') : null,
    }),
    [phase, result, resultModel, inputModel, jsonInput, parse.ok]
  );

  const onNavigate = useCallback((id) => {
    scrollToSection(id);
  }, []);

  /* ------------------------------------- real solver health from /api/health */

  useEffect(() => {
    let alive = true;
    const check = () => {
      fetch('/api/health', { cache: 'no-store' })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (alive) setEngine(data?.status === 'ok' ? 'online' : 'unknown');
        })
        .catch(() => {
          if (alive) setEngine('offline');
        });
    };
    check();
    const id = setInterval(check, 30000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const canRun = Boolean(jsonInput.trim()) && !loading;
  const lastRun = run.at ? { at: run.at, ms: run.ms } : null;

  const resultsArea = () => {
    if (phase === 'running') {
      return (
        <div className="no-print space-y-3">
          <Panel id="roster" title="Generator Roster" subtitle="Optimization in progress">
            <OptimizerProgress summary={inputModel.summary || model.summary} />
          </Panel>
          <PendingSections note="solving" />
        </div>
      );
    }
    if (phase === 'infeasible') {
      return (
        <div className="space-y-3">
          <div id="roster" className="section-anchor">
            <InfeasibleState result={result} model={resultModel} />
          </div>
          <PendingSections note="no schedule to analyse" />
        </div>
      );
    }
    if (phase === 'ok') {
      return (
        <>
          <RosterGrid model={resultModel} stale={stale} />
          <EnergyAnalytics model={resultModel} />
          <div className="grid items-start gap-3 xl:grid-cols-2">
            <ShopStats model={resultModel} />
            <DarkReasons model={resultModel} onNavigate={onNavigate} />
          </div>
        </>
      );
    }
    if (parse.ok) {
      return (
        <div className="no-print space-y-3">
          <InputPreview
            model={inputModel}
            onLoadSample={handleLoadSample}
            onRun={handleSubmit}
            canRun={canRun}
            running={loading}
          />
          {errorKind ? (
            <Panel id="status" title="Last Request" subtitle="The optimizer did not return a schedule">
              <ErrorState kind={errorKind} message={error} lines={apiLines} />
            </Panel>
          ) : null}
          <PendingSections note={phase === 'running' ? 'solving' : 'awaiting run'} />
        </div>
      );
    }
    if (errorKind === 'parse' || errorKind === 'network' || errorKind === 'api') {
      return (
        <div className="no-print space-y-3">
          <Panel id="roster" title="Generator Roster" subtitle="Nothing was solved">
            <ErrorState kind={errorKind} message={error} lines={apiLines} />
          </Panel>
          <PendingSections note="nothing to show" />
        </div>
      );
    }
    return (
      <div className="no-print space-y-3">
        <RosterEmpty />
        <PendingSections note="awaiting run" />
      </div>
    );
  };

  return (
    <div className="app-shell">
      <div className="app-body">
        <div className="main-col">
          <TopBar
            solver={solver}
            lastRun={lastRun}
            status={result?.status}
            stale={stale}
            onRun={handleSubmit}
            running={loading}
            canRun={canRun}
          />

          <nav className="horizontal-nav no-print" aria-label="Dashboard sections">
            {NAV_GROUPS.flatMap((group) => group.items).map((item) => {
              const Icon = item.icon;
              return <a key={item.id} href={`#${item.id}`} className="horizontal-link" data-active={activeId === item.id ? 'true' : 'false'} aria-current={activeId === item.id ? 'true' : undefined} onClick={(event) => { event.preventDefault(); onNavigate(item.id); }}><Icon size={15} aria-hidden="true" /><span>{item.label}</span>{chips[item.id] ? <small>{chips[item.id]}</small> : null}</a>;
            })}
          </nav>
          <main className="content">
            <div className="dashboard-hero no-print">
              <div className="hero-copy"><span className="hero-eyebrow"><span className="hero-spark" /> INTELLIGENT ENERGY PLANNING</span><h2>Make every watt <em>count.</em></h2><p>Plan smarter through every outage. Optimize your generator schedule, protect your priorities, and see the whole picture at a glance.</p><div className="hero-meta"><span>✦ Exact optimization</span><span>✦ Live energy insights</span><span>✦ Built for resilience</span></div></div>
              <div className="hero-orbit" aria-hidden="true"><div className="orbit-ring orbit-ring-one" /><div className="orbit-ring orbit-ring-two" /><div className="orbit-core">⚡</div><span className="orbit-label orbit-label-a">POWER</span><span className="orbit-label orbit-label-b">OPTIMIZED</span></div>
            </div>
            {/* printed letterhead — screen-hidden */}
            <div className="print-only mb-2">
              <div className="flex items-baseline justify-between gap-4 border-b border-hairline pb-2">
                <div className="min-w-0">
                  <h1 className="text-[16px] font-bold tracking-tight text-ink">Who Stays On? — Generator Schedule</h1>
                  <p className="text-[10.5px] text-ink-faint">
                    {fmtNumber(resultModel.summary?.shopCount)} shops · {fmtNumber(resultModel.summary?.outageHours)} outage
                    hours · {fmtNumber(resultModel.capacity)} kW capacity · {fmtLitres(resultModel.summary?.fuelBudget)} L
                    budget · value {fmtNumber(result?.value_total)} · fuel {fmtLitres(result?.fuel_total_litres)} L
                  </p>
                </div>
                <p className="text-right text-[9.5px] leading-tight text-ink-muted">
                  {run.at ? `Run ${run.at}` : 'No run recorded'}
                  <br />
                  v{APP_VERSION} · 10:00–19:00
                </p>
              </div>
            </div>

            <section id="overview" className="section-anchor space-y-2.5">
              <div className="flex flex-wrap items-center gap-2 px-0.5">
                <h2 className="text-[15px] font-semibold tracking-[-0.02em] text-ink">Summary</h2>
                {stale && phase === 'ok' ? <Badge tone="amber">editor changed since this run</Badge> : null}
                <Badge tone="mute" className="ml-auto">
                  {model.hours.length
                    ? `${model.hours.length} slots · ${fmtNumber(model.summary?.shopCount)} shops`
                    : 'No configuration loaded'}
                </Badge>
              </div>
              <SummaryCards model={model} phase={phase} errorCount={apiLines.length} />
            </section>

            {phase === 'ok' ? <SuccessStrip model={resultModel} lastRun={lastRun} stale={stale} /> : null}

            <div className="no-print grid items-start gap-3 xl:grid-cols-12">
              <div className="min-w-0 xl:col-span-7">
                <ConfigPanel
                  jsonInput={jsonInput}
                  onChange={setInputText}
                  onFile={handleFileUpload}
                  onLoadSample={handleLoadSample}
                  onClear={handleClear}
                  onRun={handleSubmit}
                  running={loading}
                  parse={parse}
                  summary={inputModel.summary || {}}
                  apiErrors={errorKind === 'api' ? apiLines : null}
                  serverNote={errorKind === 'network' ? error : null}
                  uploadError={uploadError}
                  stale={stale}
                />
              </div>
              <div className="min-w-0 xl:col-span-5">
                <RunPanel
                  phase={phase}
                  run={run}
                  result={result}
                  model={submitted ? resultModel : inputModel}
                  onDownload={handleDownload}
                  onPrint={handlePrint}
                />
              </div>
            </div>

            {resultsArea()}

            <footer className="no-print mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-hairline pt-3 text-[10.5px] text-ink-faint">
              <span className="mono">Who Stays On? · v{APP_VERSION}</span>
              <span>Exact branch &amp; bound · step-wise fuel table · integer hundredths arithmetic</span>
              <span className="ml-auto inline-flex items-center gap-1.5">
                <span
                  className={engine === 'online' ? 'dot dot-live' : engine === 'offline' ? 'dot dot-bad' : 'dot dot-idle'}
                  aria-hidden="true"
                />
                /api/health {engine}
              </span>
            </footer>
          </main>
        </div>
      </div>
    </div>
  );
}
