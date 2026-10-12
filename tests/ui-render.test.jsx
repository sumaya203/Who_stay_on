import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import SummaryCards from '../src/app/components/SummaryCards.jsx';
import RosterGrid from '../src/app/components/RosterGrid.jsx';
import EnergyAnalytics from '../src/app/components/EnergyAnalytics.jsx';
import ShopStats from '../src/app/components/ShopStats.jsx';
import DarkReasons from '../src/app/components/DarkReasons.jsx';
import ConfigPanel from '../src/app/components/ConfigPanel.jsx';
import TopBar from '../src/app/components/TopBar.jsx';
import {
  ErrorState,
  InfeasibleState,
  InputPreview,
  OptimizerProgress,
  PendingSections,
  RosterEmpty,
  RunPanel,
  SuccessStrip,
} from '../src/app/components/States.jsx';

import { solve } from '../src/lib/solver.js';
import { buildResponse } from '../src/lib/responseBuilder.js';
import { buildModel, deriveContract, parseConfig, summarizeConfig } from '../src/app/components/analytics.js';

const input = {
  grid_available: [true, false, false, true, false, false, true, true, false, true],
  generator_capacity_kw: 100,
  fuel_budget_litres: 15,
  max_consecutive_dark: 2,
  fuel_table: [
    { load_kw: 30, litres_per_hour: 1.5 },
    { load_kw: 70, litres_per_hour: 3.2 },
    { load_kw: 100, litres_per_hour: 5.0 },
  ],
  shops: [
    { id: 'A_MANDATORY', kw: 20, type: 'mandatory', value_per_slot: Array(10).fill(10) },
    { id: 'B_NORMAL', kw: 40, type: 'normal', value_per_slot: [5, 15, 25, 5, 20, 10, 5, 5, 30, 5] },
    { id: 'C_NORMAL', kw: 30, type: 'normal', value_per_slot: [10, 5, 10, 15, 5, 25, 10, 10, 5, 10] },
  ],
};

const response = buildResponse(input, solve(input));
const solvedModel = buildModel(input, response);
const preRunModel = buildModel(input, null);
const raw = JSON.stringify(input, null, 2);
const parse = parseConfig(raw);
const summary = summarizeConfig(input);
const contract = deriveContract(parse);

const render = (element) => renderToStaticMarkup(element);
const clean = (html) => {
  expect(html).not.toMatch(/NaN/);
  expect(html).not.toMatch(/undefined/);
  expect(html).not.toMatch(/>null</);
  return html;
};

describe('dashboard states render with real data only', () => {
  it('renders the executive summary in every phase', () => {
    for (const phase of ['idle', 'running', 'ok', 'infeasible', 'invalid', 'network']) {
      const html = clean(render(<SummaryCards model={phase === 'idle' ? preRunModel : solvedModel} phase={phase} errorCount={2} />));
      expect(html.length).toBeGreaterThan(200);
    }
    const solved = clean(render(<SummaryCards model={solvedModel} phase="ok" errorCount={0} result={response} />));
    expect(solved).toContain('Solved');
    // the six colorful cards, each backed by real data
    expect(solved).toContain('Total shops');
    expect(solved).toContain('Powered shops');
    expect(solved).toContain('Shops without power');
    expect(solved).toContain('Generator usage');
    expect(solved).toContain('Fuel consumption');
    expect(solved).toContain('Scheduling status');
    expect(solved).toContain(String(summary.shopCount));
    expect(solved).toContain(String(response.fuel_total_litres));
    // an unproven infeasible answer is labelled honestly on the status card too
    const unproven = clean(
      render(<SummaryCards model={solvedModel} phase="infeasible" errorCount={0} result={{ status: 'infeasible', proven: false }} />)
    );
    expect(unproven).toContain('Unproven');
  });

  it('renders the roster with ten hour columns and three real states', () => {
    const html = clean(render(<RosterGrid model={solvedModel} stale={false} />));
    for (let hour = 10; hour <= 19; hour += 1) expect(html).toContain(`${hour}:00`);
    expect(html).toContain('>GRID<');
    expect(html).toContain('rc rc-on');
    expect(html).toContain('rc rc-off');
    expect(html).toContain('Mandatory');
    expect(html).toContain('A_MANDATORY');
    expect(html).toContain('Genset load');
    expect(html).toContain('aria-label');
    expect(html).toContain('legend-item');
  });

  it('renders dark cells as keyboard-reachable buttons with the engine explanation', () => {
    const html = render(<RosterGrid model={solvedModel} stale={false} />);
    expect(html).toContain('data-reason-trigger');
    expect(html).toMatch(/aria-label="Dark at \d\d:00 — [A-Z_]+\. Show the engine&#x27;s explanation\."/);
    expect(html).toContain('title=');
  });

  it('renders the energy analytics from the same numbers as the response', () => {
    const html = clean(render(<EnergyAnalytics model={solvedModel} />));
    expect(html).toContain('14.30 L');
    expect(html).toContain('Generator Load vs Capacity');
    expect(html).toContain('Cumulative Diesel Usage');
    expect(html).toContain('Diesel Budget');
  });

  it('renders shop statistics and dark reasons with per-shop values', () => {
    const stats = clean(render(<ShopStats model={solvedModel} />));
    expect(stats).toContain('A_MANDATORY');
    expect(stats).toContain('Dark hrs');
    const reasons = clean(render(<DarkReasons model={solvedModel} onNavigate={() => {}} />));
    expect(reasons).toContain('Dark Hours &amp; Reasons');
    expect(reasons).toMatch(/binding constraint|capacity|0 value|total value/);
  });

  it('renders the pre-run preview, loading, empty and pending states', () => {
    clean(render(<InputPreview model={preRunModel} onLoadSample={() => {}} onRun={() => {}} canRun running={false} />));
    clean(render(<OptimizerProgress summary={summary} />));
    clean(render(<RosterEmpty />));
    clean(render(<PendingSections note="awaiting run" />));
  });

  it('renders the error, infeasible and success states', () => {
    const error = clean(render(<ErrorState kind="api" message="bad payload" lines={['a', 'b']} />));
    expect(error).toContain('No schedule was produced');
    const network = clean(render(<ErrorState kind="network" message="offline" lines={[]} />));
    expect(network).toContain('The optimizer request failed');

    const unproven = clean(
      render(<InfeasibleState result={{ status: 'infeasible', reason: 'timed out', proven: false }} model={solvedModel} />)
    );
    expect(unproven).toContain('No Feasible Schedule Found');
    expect(unproven).toContain('unproven');
    const proven = clean(
      render(<InfeasibleState result={{ status: 'infeasible', reason: 'no way', proven: true }} model={solvedModel} />)
    );
    expect(proven).toContain('proven');
    expect(proven).toContain('no way');

    clean(render(<SuccessStrip model={solvedModel} lastRun={{ at: '10:00:00', ms: 42 }} stale={false} />));
    clean(render(<RunPanel phase="ok" run={{ at: '10:00:00', ms: 42, http: 200, bytes: 123 }} result={response} model={solvedModel} onDownload={() => {}} onPrint={() => {}} />));
  });

  it('renders the configuration workspace and shell', () => {
    const panel = clean(
      render(
        <ConfigPanel
          jsonInput={raw}
          onChange={() => {}}
          onFile={() => {}}
          onLoadSample={() => {}}
          onClear={() => {}}
          onRun={() => {}}
          running={false}
          parse={parse}
          summary={summary}
          contract={contract}
          apiErrors={null}
          serverNote={null}
          uploadError={null}
          stale={false}
        />
      )
    );
    expect(panel).toContain('Input Configuration');
    expect(panel).toContain('id="json-editor"');
    expect(panel).toContain('Load sample');
    expect(panel).toContain('Run Optimizer');
    expect(panel).toContain('aria-describedby="json-feedback"');
    // the payload contract lists every documented field with its expected type
    expect(panel).toContain('Payload contract');
    for (const field of ['grid_available', 'generator_capacity_kw', 'fuel_budget_litres', 'max_consecutive_dark', 'fuel_table', 'shops']) {
      expect(panel).toContain(field);
    }
    expect(panel).toContain('all fields valid');

    const withErrors = render(
      <ConfigPanel
        jsonInput={raw}
        onChange={() => {}}
        onFile={() => {}}
        onLoadSample={() => {}}
        onClear={() => {}}
        onRun={() => {}}
        running={false}
        parse={parse}
        summary={summary}
        contract={deriveContract({ ok: true, data: { ...input, generator_capacity_kw: '100' } })}
        apiErrors={['fuel_table coverage must end at or above generator_capacity_kw']}
        serverNote={null}
        uploadError="Could not read config.json."
        stale
      />
    );
    expect(withErrors).toContain('The optimizer returned an error');
    expect(withErrors).toContain('Upload failed');
    expect(withErrors).toContain('coverage');
    // field-tagged messages land next to the field that produced them
    expect(withErrors).toContain('generator_capacity_kw must be a positive integer');
    expect(withErrors).toContain('fix before running');

    clean(
      render(
        <TopBar
          activeId="roster"
          chips={{ roster: '5 slots' }}
          onNavigate={() => {}}
          solver={{ tone: 'live', busy: false, label: 'Engine ready', detail: 'ok' }}
          lastRun={{ at: '10:00:00', ms: 42 }}
          status="ok"
          stale={false}
          onRun={() => {}}
          running={false}
          canRun
          version="1.1.0"
        />
      )
    );
  });
});
