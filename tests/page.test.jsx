// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import Page from '../src/app/page.jsx';
import { solve } from '../src/lib/solver.js';
import { buildResponse } from '../src/lib/responseBuilder.js';

// vitest runs from the repository root, so the bundled sample is a plain path.
const sample = JSON.parse(readFileSync('public/sample_input.json', 'utf8'));

/** The engine's real answer for the sample — used instead of a hand-written fixture. */
const sampleResponse = buildResponse(sample, solve(sample));

/** A budget-tight variant so the roster really contains dark cells. */
const tightInput = {
  ...sample,
  fuel_budget_litres: 8,
  shops: [
    sample.shops[0],
    { ...sample.shops[1], kw: 60 },
    { ...sample.shops[2], kw: 45 },
  ],
};
const tightResponse = buildResponse(tightInput, solve(tightInput));
const tightDarkCells = Object.values(tightResponse.roster).reduce((n, slot) => n + slot.dark.length, 0);

const jsonRes = (body, status = 200) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

/** Minimal router-backed fetch stub; records every call it answers. */
function stubFetch(routes) {
  const calls = [];
  const fn = vi.fn(async (url, options = {}) => {
    calls.push({ url: String(url), options });
    const route = routes[String(url)];
    if (!route) throw new TypeError(`Unhandled fetch to ${url}`);
    return typeof route === 'function' ? route(options) : route;
  });
  vi.stubGlobal('fetch', fn);
  return calls;
}

const typeIntoEditor = async (user, text) => {
  const editor = screen.getByLabelText('JSON configuration');
  await user.clear(editor);
  await user.click(editor);
  await user.paste(text);
  return editor;
};

beforeEach(() => {
  // jsdom has no blob URL implementation; the download path needs one.
  URL.createObjectURL = vi.fn(() => 'blob:stub');
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('page wiring: configuration controls', () => {
  it('starts empty, keeps Run disabled and renders no results', async () => {
    stubFetch({ '/api/health': jsonRes({ status: 'ok' }) });
    render(<Page />);

    expect(screen.getByRole('heading', { level: 1, name: 'Generator Schedule' })).toBeInTheDocument();
    expect(screen.getByText('No roster to display')).toBeInTheDocument();
    expect(screen.getByText('No configuration loaded')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Run Optimizer/ }).every((b) => b.disabled)).toBe(true);
    await waitFor(() => expect(screen.getByText(/\/api\/health online/)).toBeInTheDocument());
  });

  it('loads the bundled sample into the editor', async () => {
    const user = userEvent.setup();
    stubFetch({
      '/api/health': jsonRes({ status: 'ok' }),
      '/sample_input.json': jsonRes(sample),
    });
    render(<Page />);

    await user.click(screen.getByRole('button', { name: /Load sample/ }));

    const editor = await screen.findByLabelText('JSON configuration');
    await waitFor(() => expect(editor.value).toContain('A_MANDATORY'));
    await waitFor(() => expect(screen.getByText('Valid JSON')).toBeInTheDocument());
    expect(screen.getByText('Submitted Day — Constraint Preview')).toBeInTheDocument();
  });

  it('clears the editor and every rendered result', async () => {
    const user = userEvent.setup();
    stubFetch({
      '/api/health': jsonRes({ status: 'ok' }),
      '/api/roster': jsonRes(sampleResponse),
    });
    render(<Page />);

    await typeIntoEditor(user, JSON.stringify(sample));
    await user.click(screen.getAllByRole('button', { name: /Run Optimizer/ })[0]);
    await waitFor(() => expect(screen.getByText('Optimization complete')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /Clear/ }));
    expect(screen.getByLabelText('JSON configuration').value).toBe('');
    expect(screen.queryByText('Optimization complete')).not.toBeInTheDocument();
    expect(screen.getByText('No roster to display')).toBeInTheDocument();
    expect(screen.getByText('No configuration loaded')).toBeInTheDocument();
  });

  it('reads an uploaded .json file and reports an unreadable one', async () => {
    const user = userEvent.setup();
    stubFetch({ '/api/health': jsonRes({ status: 'ok' }) });
    const { container } = render(<Page />);

    const fileInput = container.querySelector('input[type="file"]');
    await user.upload(fileInput, new File([JSON.stringify(sample)], 'config.json', { type: 'application/json' }));
    await waitFor(() => expect(screen.getByLabelText('JSON configuration').value).toContain('A_MANDATORY'));

    // A file the browser cannot read must surface as an upload error, not silence.
    const original = FileReader.prototype.readAsText;
    FileReader.prototype.readAsText = function fail() {
      setTimeout(() => this.onerror?.(new ProgressEvent('error')), 0);
    };
    await user.upload(fileInput, new File(['{'], 'broken.json', { type: 'application/json' }));
    expect(await screen.findByText('Upload failed')).toBeInTheDocument();
    FileReader.prototype.readAsText = original;
  });
});

describe('page wiring: running the optimizer', () => {
  it('posts the editor content unchanged and renders the engine response', async () => {
    const user = userEvent.setup();
    const calls = stubFetch({
      '/api/health': jsonRes({ status: 'ok' }),
      '/api/roster': jsonRes(sampleResponse),
    });
    render(<Page />);

    const raw = JSON.stringify(sample, null, 2);
    await typeIntoEditor(user, raw);
    await user.click(screen.getAllByRole('button', { name: /Run Optimizer/ })[0]);

    await waitFor(() => expect(screen.getByText('Optimization complete')).toBeInTheDocument());

    const post = calls.find((c) => c.url === '/api/roster');
    expect(post.options.method).toBe('POST');
    expect(JSON.parse(post.options.body)).toEqual(sample);

    // roster: five outage columns carry the engine's powered list, grid columns stay GRID
    const table = within(document.getElementById('roster')).getByRole('table');
    expect(within(table).getAllByText('GRID')).toHaveLength(15); // 5 grid hours × 3 shops
    expect(within(table).getAllByText(/Powered at \d\d:00/)).toHaveLength(15);
    expect(screen.getAllByText(`${sampleResponse.value_total}`).length).toBeGreaterThan(0);
    expect(screen.getByText('totals reconcile')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Download JSON/ })).toBeEnabled();
  });

  it('ignores repeated clicks while a run is in flight', async () => {
    const user = userEvent.setup();
    let resolveRun;
    const calls = stubFetch({
      '/api/health': jsonRes({ status: 'ok' }),
      '/api/roster': () => new Promise((resolve) => { resolveRun = () => resolve(jsonRes(sampleResponse)); }),
    });
    render(<Page />);

    await typeIntoEditor(user, JSON.stringify(sample));
    await user.click(screen.getAllByRole('button', { name: /Run Optimizer/ })[0]);
    await screen.findAllByText('Optimizing…');
    const runButtons = screen.getAllByRole('button', { name: /Optimizing…/ });
    expect(runButtons.every((b) => b.disabled)).toBe(true);
    await user.click(runButtons[0]);
    expect(calls.filter((c) => c.url === '/api/roster')).toHaveLength(1);

    resolveRun();
    await waitFor(() => expect(screen.getByText('Optimization complete')).toBeInTheDocument());
  });

  it('marks the roster as stale once the editor changes', async () => {
    const user = userEvent.setup();
    stubFetch({ '/api/health': jsonRes({ status: 'ok' }), '/api/roster': jsonRes(sampleResponse) });
    render(<Page />);

    await typeIntoEditor(user, JSON.stringify(sample));
    await user.click(screen.getAllByRole('button', { name: /Run Optimizer/ })[0]);
    await waitFor(() => expect(screen.getByText('Optimization complete')).toBeInTheDocument());

    const editor = screen.getByLabelText('JSON configuration');
    await user.type(editor, ' ');
    await waitFor(() => expect(screen.getAllByText('editor changed since this run').length).toBeGreaterThan(0));
  });

  it('downloads the raw response and calls the print dialog', async () => {
    const user = userEvent.setup();
    stubFetch({ '/api/health': jsonRes({ status: 'ok' }), '/api/roster': jsonRes(sampleResponse) });
    const printSpy = vi.fn();
    vi.stubGlobal('print', printSpy);
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<Page />);

    await typeIntoEditor(user, JSON.stringify(sample));
    await user.click(screen.getAllByRole('button', { name: /Run Optimizer/ })[0]);
    await waitFor(() => expect(screen.getByText('Optimization complete')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /Download JSON/ }));
    expect(clickSpy).toHaveBeenCalled();
    expect(URL.createObjectURL).toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /Print A4/ }));
    expect(printSpy).toHaveBeenCalled();
  });
});

describe('page wiring: failure handling', () => {
  it('rejects malformed JSON locally without calling the API', async () => {
    const user = userEvent.setup();
    const calls = stubFetch({ '/api/health': jsonRes({ status: 'ok' }) });
    render(<Page />);

    await typeIntoEditor(user, '{"shops": [}');
    await user.click(screen.getAllByRole('button', { name: /Run Optimizer/ })[0]);

    expect((await screen.findAllByText('Invalid input — nothing was solved')).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Invalid JSON syntax/).length).toBeGreaterThan(0);
    expect(calls.filter((c) => c.url === '/api/roster')).toHaveLength(0);
    expect(screen.queryByText('Optimization complete')).not.toBeInTheDocument();
  });

  it('lists every validation error the API returns', async () => {
    const user = userEvent.setup();
    stubFetch({
      '/api/health': jsonRes({ status: 'ok' }),
      '/api/roster': jsonRes(
        { status: 'invalid_input', errors: ['shops[0].kw must be a positive number', 'fuel_budget_litres must be a nonnegative number'] },
        400
      ),
    });
    render(<Page />);

    await typeIntoEditor(user, JSON.stringify(sample));
    await user.click(screen.getAllByRole('button', { name: /Run Optimizer/ })[0]);

    expect((await screen.findAllByText('The optimizer returned an error')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('shops[0].kw must be a positive number').length).toBeGreaterThan(0);
    expect(screen.getAllByText('fuel_budget_litres must be a nonnegative number').length).toBeGreaterThan(0);
    expect(screen.getByText('No schedule was produced')).toBeInTheDocument();
  });

  it('reports a network failure and allows a retry', async () => {
    const user = userEvent.setup();
    stubFetch({
      '/api/health': jsonRes({ status: 'ok' }),
      '/api/roster': () => Promise.reject(new TypeError('Failed to fetch')),
    });
    render(<Page />);

    await typeIntoEditor(user, JSON.stringify(sample));
    await user.click(screen.getAllByRole('button', { name: /Run Optimizer/ })[0]);

    expect(await screen.findByText('The optimizer request failed')).toBeInTheDocument();
    expect(screen.getAllByText('Network error communicating with the API.').length).toBeGreaterThan(0);

    // recovery: the same button is usable again and a good answer renders
    stubFetch({ '/api/health': jsonRes({ status: 'ok' }), '/api/roster': jsonRes(sampleResponse) });
    const runButtons = screen.getAllByRole('button', { name: /Run Optimizer/ });
    expect(runButtons.every((b) => !b.disabled)).toBe(true);
    await user.click(runButtons[0]);
    await waitFor(() => expect(screen.getByText('Optimization complete')).toBeInTheDocument());
  });

  it('refuses to render a 200 that does not match the response contract', async () => {
    const user = userEvent.setup();
    stubFetch({ '/api/health': jsonRes({ status: 'ok' }), '/api/roster': jsonRes({ status: 'ok' }) });
    render(<Page />);

    await typeIntoEditor(user, JSON.stringify(sample));
    await user.click(screen.getAllByRole('button', { name: /Run Optimizer/ })[0]);

    expect((await screen.findAllByText('The response is missing its roster.')).length).toBeGreaterThan(0);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByText('Optimization complete')).not.toBeInTheDocument();
  });

  it('refuses to render a non-JSON body', async () => {
    const user = userEvent.setup();
    stubFetch({ '/api/health': jsonRes({ status: 'ok' }), '/api/roster': jsonRes('<html>gateway</html>') });
    render(<Page />);

    await typeIntoEditor(user, JSON.stringify(sample));
    await user.click(screen.getAllByRole('button', { name: /Run Optimizer/ })[0]);

    expect((await screen.findAllByText('The server did not return a JSON object.')).length).toBeGreaterThan(0);
  });

  it('shows the engine reason when the instance is infeasible', async () => {
    const user = userEvent.setup();
    stubFetch({
      '/api/health': jsonRes({ status: 'ok' }),
      '/api/roster': jsonRes({
        status: 'infeasible',
        reason: 'Mandatory shops exceed generator capacity.',
        proven: true,
        roster: {},
        value_total: 0,
        fuel_total_litres: 0,
        dark_hours: {},
      }),
    });
    render(<Page />);

    await typeIntoEditor(user, JSON.stringify(sample));
    await user.click(screen.getAllByRole('button', { name: /Run Optimizer/ })[0]);

    expect(await screen.findByText('No schedule satisfies every hard constraint for this configuration')).toBeInTheDocument();
    expect(screen.getByText('Mandatory shops exceed generator capacity.')).toBeInTheDocument();
    expect(screen.getByText('proven')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('flags an unproven infeasible answer instead of claiming a proof', async () => {
    const user = userEvent.setup();
    stubFetch({
      '/api/health': jsonRes({ status: 'ok' }),
      '/api/roster': jsonRes({
        status: 'infeasible',
        reason: 'No feasible schedule was found within the 8.5 s search window.',
        proven: false,
        roster: {},
        value_total: 0,
        fuel_total_litres: 0,
        dark_hours: {},
      }),
    });
    render(<Page />);

    await typeIntoEditor(user, JSON.stringify(sample));
    await user.click(screen.getAllByRole('button', { name: /Run Optimizer/ })[0]);

    expect(await screen.findByText('No Feasible Schedule Found')).toBeInTheDocument();
    expect(screen.getByText('unproven')).toBeInTheDocument();
  });
});

describe('page wiring: dark reasons stay reachable', () => {
  it('opens the engine explanation from a dark cell and closes it on Escape', async () => {
    const user = userEvent.setup();
    stubFetch({ '/api/health': jsonRes({ status: 'ok' }), '/api/roster': jsonRes(tightResponse) });
    render(<Page />);

    await typeIntoEditor(user, JSON.stringify(tightInput));
    await user.click(screen.getAllByRole('button', { name: /Run Optimizer/ })[0]);
    await waitFor(() => expect(screen.getByText('Optimization complete')).toBeInTheDocument());
    expect(tightDarkCells).toBeGreaterThan(0);

    const cells = screen.getAllByRole('button', { name: /^Dark at/ });
    expect(cells).toHaveLength(tightDarkCells);
    expect(cells[0]).toHaveAttribute('aria-expanded', 'false');

    await user.click(cells[0]);
    const dialog = await screen.findByRole('dialog');
    expect(cells[0]).toHaveAttribute('aria-expanded', 'true');
    const shopId = dialog.getAttribute('aria-label').replace(/^Why /, '').split(' ')[0];
    const firstDark = Object.entries(tightResponse.roster)
      .flatMap(([slot, entry]) => entry.dark.map((d) => ({ slot, ...d })))
      .find((d) => d.id === shopId);
    expect(dialog).toHaveTextContent(firstDark.reason);

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(cells[0]).toHaveFocus();
  });
});
