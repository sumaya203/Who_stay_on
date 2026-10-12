"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import Sidebar from './components/Sidebar';
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
import { Panel, Badge, clsx } from './components/ui';
import { buildModel, errorLines, fmtLitres, fmtNumber, parseConfig } from './components/analytics';
import { scrollToSection, SECTION_IDS, useActiveSection } from './components/nav';

const APP_VERSION = '1.0.0';

/* The same demo scenario the dashboard shipped with (mirrors public/sample_input.json). */
const SAMPLE_CONFIG = {
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

const EMPTY_RUN = { at: null, ms: null, http: null, bytes: 0 };
const clock = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

export default function Page() {
  const [jsonInput, setJsonInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  // presentation-only additions: failure kind, run metadata and the exact
  // payload the rendered result belongs to (so editing the textarea never
  // re-labels an older run with newer numbers).
  const [errorKind, setErrorKind] = useState(null);
  const [run, setRun] = useState(EMPTY_RUN);
  const [submitted, setSubmitted] = useState(null);
  const [submittedRaw, setSubmittedRaw] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(null); // null = viewport not measured yet
  const [engine, setEngine] = useState('checking');

  const activeId = useActiveSection(SECTION_IDS);

  /* --------------------------------------------------------------- actions */

  const setInputText = useCallback((value) => {
    setJsonInput(typeof value === 'string' ? value : '');
  }, []);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      setInputText(evt.target.result);
    };
    reader.readAsText(file);
  };

  const handleLoadSample = () => {
    // Generate a basic valid sample for demonstration
    setJsonInput(JSON.stringify(SAMPLE_CONFIG, null, 2));
  };

  const handleClear = () => {
    setJsonInput('');
    setResult(null);
    setError(null);
    setErrorKind(null);
    setSubmitted(null);
    setSubmittedRaw('');
    setRun(EMPTY_RUN);
  };

  const handleSubmit = async () => {
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

    try {
      const res = await fetch('/api/roster', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      });

      const data = await res.json();
      setRun({ at: clock(), ms: Date.now() - startedAt, http: res.status, bytes: new Blob([payload]).size });
      setSubmitted(parsed);
      setSubmittedRaw(jsonInput);

      if (!res.ok) {
        setError(data.errors ? data.errors.join("\n") : "An error occurred.");
        setErrorKind('api');
      } else {
        setResult(data);
      }
    } catch (err) {
      setRun({ at: clock(), ms: Date.now() - startedAt, http: null, bytes: new Blob([payload]).size });
      setError("Network error communicating with the API.");
      setErrorKind('network');
    }
    setLoading(false);
  };

  const handleDownload = () => {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "roster_result.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    window.print();
  };

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
        label: 'Solving…',
        detail: `Branch & bound across ${fmtNumber(model.outageHours.length)} outage hours`,
      };
    }
    if (engine === 'checking') return { tone: 'idle', busy: false, label: 'Checking engine', detail: 'Reading /api/health' };
    if (engine === 'offline') {
      return { tone: 'bad', busy: false, label: 'Engine offline', detail: 'This session could not reach /api/health.' };
    }
    if (errorKind) {
      return { tone: 'bad', busy: false, label: 'Engine ready', detail: 'Last request was rejected before a schedule was produced.' };
    }
    return {
      tone: 'live',
      busy: false,
      label: 'Engine ready',
      detail:
        run.ms !== null
          ? `Last response in ${run.ms} ms · exact for up to 12 shops`
          : 'Exact branch & bound · ≤ 12 shops, 10 slots',
    };
  }, [loading, engine, errorKind, run.ms, model.outageHours.length]);

  const chips = useMemo(
    () => ({
      overview: phase === 'ok' ? `${fmtNumber(result?.value_total ?? 0)} val` : null,
      roster: result?.status === 'ok' ? `${Object.keys(result.roster || {}).length} slots` : null,
      'dark-reasons': result?.status === 'ok' ? `${resultModel.metrics.totalDarkHours ?? 0}` : null,
      analytics: result?.status === 'ok' ? `${resultModel.hours.length} hrs` : null,
      'shop-stats': inputModel.summary?.shopCount ? `${inputModel.summary.shopCount}` : null,
      configuration: jsonInput.trim() ? (parse.ok ? 'ready' : 'fix') : null,
    }),
    [phase, result, resultModel, inputModel, jsonInput, parse.ok]
  );

  const onNavigate = useCallback((id) => {
    setDrawerOpen(false);
    scrollToSection(id);
  }, []);

  /* ------------------------------------------------------ drawer mechanics */

  useEffect(() => {
    if (!drawerOpen) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') setDrawerOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const mq = window.matchMedia('(min-width: 1024px)');
    const sync = () => {
      setIsDesktop(mq.matches);
      if (mq.matches) setDrawerOpen(false);
    };
    sync();
    if (typeof mq.addEventListener === 'function') mq.addEventListener('change', sync);
    return () => {
      if (typeof mq.removeEventListener === 'function') mq.removeEventListener('change', sync);
    };
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
  // `data-open` drives the drawer transform; interactivity additionally stays
  // on for the desktop rail and while the viewport is still unknown (SSR).
  const drawerShown = isDesktop === true || drawerOpen;
  const sidebarReachable = isDesktop !== false || drawerOpen;
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
    if (errorKind === 'parse' || errorKind === 'network') {
      return (
        <div className="no-print space-y-3">
          <Panel id="roster" title="No Results" subtitle="Nothing was solved">
            <ErrorState kind={errorKind} message={error} lines={apiLines} />
          </Panel>
          <PendingSections note="nothing to show" />
        </div>
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
          <PendingSections note={phase === 'running' ? 'solving' : 'awaiting run'} />
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
        <aside
          id="app-sidebar"
          className="sidebar no-print"
          data-open={drawerShown ? 'true' : 'false'}
          aria-label="Primary"
          aria-hidden={sidebarReachable ? undefined : 'true'}
          inert={!sidebarReachable}
        >
          <Sidebar activeId={activeId} chips={chips} solver={solver} onNavigate={onNavigate} version={APP_VERSION} />
        </aside>

        {drawerOpen ? (
          <button
            type="button"
            className="sidebar-backdrop no-print"
            aria-label="Close navigation"
            onClick={() => setDrawerOpen(false)}
            tabIndex={-1}
          />
        ) : null}

        <div className="main-col">
          <TopBar
            drawerOpen={drawerOpen}
            onToggleDrawer={() => setDrawerOpen((v) => !v)}
            solver={solver}
            lastRun={lastRun}
            status={result?.status}
            stale={stale}
            onRun={handleSubmit}
            running={loading}
            canRun={canRun}
          />

          <main className="content">
            {/* printed letterhead — screen-hidden */}
            <div className="print-only mb-2">
              <div className="flex items-baseline justify-between gap-4 border-b border-hairline pb-2">
                <div className="min-w-0">
                  <h1 className="text-[16px] font-bold tracking-tight text-ink">Who Stays On? — Generator Schedule</h1>
                  <p className="text-[10.5px] text-ink-muted">
                    {fmtNumber(resultModel.summary?.shopCount)} shops · {fmtNumber(resultModel.summary?.outageHours)} outage
                    hours · {fmtNumber(resultModel.capacity)} kW capacity · {fmtLitres(resultModel.summary?.fuelBudget)} L
                    budget · value {fmtNumber(result?.value_total)} · fuel {fmtLitres(result?.fuel_total_litres)} L
                  </p>
                </div>
                <p className="text-right text-[9.5px] leading-tight text-ink-faint">
                  {run.at ? `Run ${run.at}` : 'No run recorded'}
                  <br />
                  v{APP_VERSION} · 10:00–19:00
                </p>
              </div>
            </div>

            <section id="overview" className="section-anchor space-y-2.5">
              <div className="flex flex-wrap items-center gap-2 px-0.5">
                <h2 className="text-[15px] font-semibold tracking-[-0.02em] text-ink">Executive Summary</h2>
                <span className="hidden text-[11.5px] text-ink-faint sm:inline">
                  {phase === 'ok'
                    ? 'Totals straight from the latest /api/roster response'
                    : phase === 'running'
                      ? 'Waiting on the solver'
                      : 'Configuration facts — run the optimizer for results'}
                </span>
                {stale && phase === 'ok' ? <Badge tone="amber">editor changed since this run</Badge> : null}
                <Badge tone="mute" className="ml-auto">
                  {model.hours.length} slots · {fmtNumber(model.summary?.shopCount)} shops
                </Badge>
              </div>
              <SummaryCards model={model} phase={phase} errorCount={apiLines.length} />
            </section>

            {phase === 'ok' ? <SuccessStrip model={resultModel} lastRun={lastRun} stale={stale} /> : null}

            <div className="grid items-start gap-3 xl:grid-cols-12">
              <div className="no-print min-w-0 xl:col-span-7">
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
                  stale={stale}
                />
              </div>
              <div className="no-print min-w-0 xl:col-span-5">
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
              <span className="hidden h-1 w-1 rounded-full bg-ink-faint sm:block" aria-hidden="true" />
              <span>Exact branch &amp; bound · step-wise fuel table · integer hundredths arithmetic</span>
              <span className={clsx('ml-auto inline-flex items-center gap-1.5')}>
                <span
                  className={clsx('dot', engine === 'online' ? 'dot-live' : engine === 'offline' ? 'dot-bad' : 'dot-idle')}
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
