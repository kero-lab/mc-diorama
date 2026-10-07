import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatClock, markerLeft } from '../src/controls';
import { PARKOUR_ACTIVITY } from '../src/activity';
import { Diorama, hasWebGL } from '../src/diorama';
import { lastChangeBefore } from '../src/frame';
import { moveKindOf, parkourMarkers, publicParkourMarkers } from '../src/layers/parkour/derive';
import { visibleBlocks } from '../src/scene/blocks-field';
import { emptyTimeline, timelineReducer } from '../src/timeline';
import type { PasteRec, WorldBlock } from '../src/types';
import type { LiveFeed } from '../src/live-feed';
import { DEBUG_LAYERS } from '../src/debug';
import type { DioramaHost } from '../src/host';
import { recordingResponse } from './recording-stub';
import { withHost } from './test-host';
import { SYNTH_RUN, syntheticRun, tAt } from './fixtures/rem-mc/synthetic-p8';

const tl = timelineReducer(emptyTimeline(), syntheticRun().map(e => ({ e })));
let load: DioramaHost['loadRecording'] = recordingResponse(404);   // the host's loader (was a global.fetch stub)
const respond = (status: number, body: unknown, headers: Record<string, string> = {}) => { load = recordingResponse(status, body, headers); };
const hosted = (el: ReactElement) => withHost(el, { loadRecording: (...a) => load(...a) });
/** A feed that is open and quiet: the seed is all the Diorama gets. */
const quietFeed: LiveFeed = { epoch: 1, subscribe: () => () => {} };
const liveHeaders = { 'x-recording-last-id': '500', 'x-recording-run': SYNTH_RUN, 'x-recording-truncated': 'false' };
const region = () => screen.getByRole('region', { name: /run diorama/i });

describe('hasWebGL', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
  it('probes once per page and releases the probe context (browsers cap live WebGL contexts)', async () => {
    vi.resetModules();
    const { hasWebGL: probe } = await import('../src/diorama');   // a fresh module: no memo yet
    const loseContext = vi.fn();
    const getContext = vi.fn(() => ({ getExtension: (n: string) => (n === 'WEBGL_lose_context' ? { loseContext } : null) }));
    vi.stubGlobal('WebGLRenderingContext', function WebGLRenderingContext() {});
    const make = vi.spyOn(document, 'createElement').mockImplementation(() => ({ getContext }) as never);
    expect(probe()).toBe(true);
    expect(probe()).toBe(true);
    expect(probe()).toBe(true);
    expect(make).toHaveBeenCalledTimes(1);
    expect(getContext).toHaveBeenCalledTimes(1);
    expect(loseContext).toHaveBeenCalledTimes(1);
  });
});

describe('Diorama shell (no WebGL in jsdom: the DOM fallback)', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('replays a stored run: says 3D is unavailable, still shows the score and the run', async () => {
    respond(200, syntheticRun());
    render(hosted(<Diorama source={{ runId: 'r1' }} />));
    expect(hasWebGL()).toBe(false);
    await waitFor(() => expect(region()).toHaveAttribute('data-status', 'ready'));
    expect(screen.getByText(/3D view unavailable/i)).toBeInTheDocument();
    expect(screen.getByTestId('diorama-score').textContent).toMatch(/^\d+$/);
  });
  it('seekToProgress pauses the replay at the first moment the progress is reached (compact hides the controls)', async () => {
    respond(200, syntheticRun());
    render(hosted(<Diorama source={{ runId: 'r1' }} seekToProgress={{ value: 2, activity: PARKOUR_ACTIVITY }} compact />));
    await waitFor(() => expect(region()).toHaveAttribute('data-status', 'ready'));
    await waitFor(() => expect(screen.getByTestId('diorama-score').textContent).toBe('2'));
    expect(screen.queryByRole('slider')).toBeNull();
  });
  it('a truncated recording says it was cut short', async () => {
    respond(200, syntheticRun().slice(0, 30), { 'x-recording-truncated': 'true' });
    render(hosted(<Diorama source={{ runId: 'r1' }} />));
    await waitFor(() => expect(screen.getByText(/recording ends early/i)).toBeInTheDocument());
  });
  it('live, a capped open run still folding is not called cut short (M2); once it has ended it is', async () => {
    respond(200, syntheticRun().slice(0, 40), { ...liveHeaders, 'x-recording-truncated': 'true' });
    const { unmount } = render(hosted(<Diorama source={{ live: true }} feed={quietFeed} connected />));
    await waitFor(() => expect(region()).toHaveAttribute('data-status', 'ready'));
    expect(screen.queryByText(/recording ends early/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /recording ends here/i })).toBeNull();
    unmount();
    respond(200, syntheticRun(), { ...liveHeaders, 'x-recording-truncated': 'true' });
    render(hosted(<Diorama source={{ live: true }} feed={quietFeed} connected />));
    await waitFor(() => expect(screen.getByText(/recording ends early/i)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /recording ends here/i })).toBeInTheDocument();
  });
  it('a run without a recording says so', async () => {
    respond(404, { error: 'no recording for that run' });
    render(hosted(<Diorama source={{ runId: 'r1' }} />));
    await waitFor(() => expect(screen.getByText(/no recording for this run/i)).toBeInTheDocument());
  });
  it('live without a feed waits for it and fetches nothing', () => {
    const f = vi.fn(); load = f;
    render(hosted(<Diorama source={{ live: true }} />));
    expect(screen.getByText(/waiting for the live feed/i)).toBeInTheDocument();
    expect(f).not.toHaveBeenCalled();
  });
  it('live, connection dropped (Ruling 9): holds the last frame and says it is reconnecting; back up, the notice goes', async () => {
    respond(200, syntheticRun().slice(0, 40), liveHeaders);
    const { rerender } = render(hosted(<Diorama source={{ live: true }} feed={quietFeed} connected />));
    await waitFor(() => expect(region()).toHaveAttribute('data-status', 'ready'));
    expect(screen.queryByText(/reconnecting/i)).toBeNull();
    rerender(hosted(<Diorama source={{ live: true }} feed={quietFeed} connected={false} />));
    expect(screen.getByText(/Reconnecting: holding the last state/i)).toBeInTheDocument();
    expect(screen.getByText(/3D view unavailable/i)).toBeInTheDocument();          // the held frame stays on screen
    expect(screen.getByTestId('diorama-score')).toBeInTheDocument();
    rerender(hosted(<Diorama source={{ live: true }} feed={quietFeed} connected />));
    expect(screen.queryByText(/reconnecting/i)).toBeNull();
  });
  it('a re-seed failing while live (status error) still holds the frame and says so', async () => {
    let calls = 0;
    load = vi.fn(async (...a: Parameters<DioramaHost['loadRecording']>) => (++calls === 1
      ? recordingResponse(200, syntheticRun().slice(0, 40), liveHeaders)(...a)
      : recordingResponse(502, { error: 'controller unreachable' })(...a)));
    const { rerender } = render(hosted(<Diorama source={{ live: true }} feed={quietFeed} connected />));
    await waitFor(() => expect(region()).toHaveAttribute('data-status', 'ready'));
    rerender(hosted(<Diorama source={{ live: true }} feed={{ ...quietFeed, epoch: 2 }} connected />));   // a reconnect re-seeds
    await waitFor(() => expect(region()).toHaveAttribute('data-status', 'error'));
    expect(screen.getByText(/controller unreachable/i)).toBeInTheDocument();
    expect(screen.getByTestId('diorama-score')).toBeInTheDocument();
  });
  it('a live run that has ended shows the run-end card to live viewers (Ruling 27)', async () => {
    respond(200, syntheticRun(), liveHeaders);
    render(hosted(<Diorama source={{ live: true }} feed={quietFeed} connected />));
    await waitFor(() => expect(screen.getByText(/Run over/)).toBeInTheDocument());
    expect(screen.getByText(/Run over/).textContent).toMatch(/Run over · 10 · death \(no_solution\) · 3 s/);
  });
  it('without WebGL the thinking strip and the death card are still there, with every number as text', async () => {
    respond(200, syntheticRun());
    render(hosted(<Diorama source={{ runId: 'r1' }} layers={DEBUG_LAYERS} />));
    const strip = await screen.findByRole('region', { name: /thinking strip/i });
    expect(strip).toHaveTextContent('#2');
    expect(screen.getByLabelText(/jump 2: planned at tick 14, ready at 27.*late/i)).toBeInTheDocument();
    expect(screen.getByText(/no jump possible from a standstill/i)).toBeInTheDocument();
  });
});

describe('scene helpers', () => {
  const at = (x: number): WorldBlock => ({ at: [x, 99, 0], name: 'red_wool', state: null, order: x });
  it('hides blocks more than 30 behind her and fades the 20-30 band; ahead stays', () => {
    const v = visibleBlocks([at(-40), at(-25), at(-5), at(10)], [0.5, 100, 0.5], { x: 1, z: 0 });   // distances from block centres
    expect(v.map(b => [b.block.at[0], b.fade])).toEqual([[-25, 0.5], [-5, 1], [10, 1]]);
    expect(visibleBlocks([at(-40)], null, { x: 1, z: 0 })).toHaveLength(1);       // nothing to measure from: show all
  });
  it('names the move kind from the paste itself', () => {
    const p = (over: Partial<PasteRec>): PasteRec => ({ ...tl.layers.parkour.pastes[0], ...over });
    expect(moveKindOf(p({}))).toBe('Door climb');
    expect(moveKindOf(p({ route: null, cells: [{ at: [0, 0, 0], name: 'slime_block' }] }))).toBe('Bounce');
    expect(moveKindOf(p({ route: null, cells: [{ at: [0, 0, 0], name: 'ladder' }] }))).toBe('Ladder jump');
    expect(moveKindOf(p({ route: null, cells: [{ at: [0, 0, 0], name: 'scaffolding' }, { at: [0, 1, 0], name: 'ladder' }] }))).toBe('Scaffold climb');
    expect(moveKindOf(p({ route: null, cells: [{ at: [0, 0, 0], name: 'honey_block' }] }))).toBe('Land');
  });
  it('finds when a block last changed (the door swing starts there)', () => {
    expect(lastChangeBefore(tl, '8,99,0', tAt(42))!.t).toBe(tAt(41));
    expect(lastChangeBefore(tl, '8,99,0', tAt(40))!.t).toBe(tAt(20));             // the paste wrote its closed state
    expect(lastChangeBefore(tl, 'nope', tAt(40))).toBeNull();
  });
});

describe('controls', () => {
  afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });
  it('formats the clock and places markers on the track', () => {
    expect(formatClock(64_200)).toBe('1:04.2');
    expect(formatClock(0)).toBe('0:00.0');
    expect(markerLeft(150, { start: 100, end: 300 })).toBe(25);
    expect(markerLeft(-5, { start: 100, end: 300 })).toBe(0);
  });
  it('the camera picker and the X-ray switch change the view and are remembered', async () => {
    respond(200, syntheticRun());
    const { unmount } = render(hosted(<Diorama source={{ runId: 'r1' }} layers={DEBUG_LAYERS} />));
    await screen.findByRole('radiogroup', { name: /camera/i });
    fireEvent.click(screen.getByRole('radio', { name: /side/i }));
    expect(screen.getByRole('radio', { name: /side/i })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByRole('switch', { name: /x-ray/i }));
    expect(screen.getByRole('switch', { name: /x-ray/i })).toHaveAttribute('aria-checked', 'true');
    unmount();
    respond(200, syntheticRun());
    render(hosted(<Diorama source={{ runId: 'r1' }} layers={DEBUG_LAYERS} />));
    expect(await screen.findByRole('radio', { name: /side/i })).toHaveAttribute('aria-checked', 'true');
  });
  it('the scrubber seeks, pauses and leaves live; markers seek too; speed is a choice', async () => {
    respond(200, syntheticRun());
    render(hosted(<Diorama source={{ runId: 'r1' }} />));
    const scrub = await screen.findByRole('slider', { name: /timeline/i });
    // Controls can appear while the recording is still folding. Wait for its
    // ready transition so replay initialization cannot overwrite this seek.
    await waitFor(() => expect(region()).toHaveAttribute('data-status', 'ready'));
    fireEvent.change(scrub, { target: { value: String(tAt(64)) } });
    expect(await screen.findByText(/run over/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^play$/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /door climb · c086c587/i }));
    expect((scrub as HTMLInputElement).value).toBe(String(tAt(20)));
    fireEvent.change(screen.getByRole('combobox', { name: /speed/i }), { target: { value: '0.25' } });
    expect(screen.getByRole('combobox', { name: /speed/i })).toHaveValue('0.25');
  });
  it('the landing list selects a landing (kept while playing) and shows its exact values', async () => {
    respond(200, syntheticRun());
    render(hosted(<Diorama source={{ runId: 'r1' }} layers={DEBUG_LAYERS} />));
    const item = await screen.findByRole('button', { name: /landing 2/i });
    fireEvent.click(item);
    expect(item).toHaveAttribute('aria-pressed', 'true');
    const values = screen.getByRole('group', { name: /landing 2 values/i });
    expect(values).toHaveTextContent('0.050 b');
    expect(values).toHaveTextContent('640 ms');
  });
});

describe('public layers (no X-ray)', () => {
  afterEach(() => { localStorage.clear(); });
  it('public layers without WebGL still show the landing list and the fallback text', async () => {
    // jsdom has no WebGL: hasWebGL() is false here.
    respond(200, syntheticRun());
    render(hosted(<Diorama source={{ runId: 'r1' }} />));
    expect(await screen.findByText(/3D view unavailable/)).toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: /x-ray/i })).toBeNull();
    expect(await screen.findByRole('list', { name: /landings/i })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /thinking strip/i })).toBeNull();
    expect(screen.queryByText(/Why she fell/)).toBeNull();
  });
  it('a stored X-ray pref is ignored by a layer set without X-ray', async () => {
    localStorage.setItem('remhub:rem-mc:diorama', JSON.stringify({ camera: 'iso', xray: true, rotation: 0 }));
    respond(200, syntheticRun());
    render(hosted(<Diorama source={{ runId: 'r1' }} />));
    await screen.findByRole('list', { name: /landings/i });
    expect(screen.queryByRole('region', { name: /thinking strip/i })).toBeNull();
  });
  it('the camera list is a prop: a host can hand the picker fewer radios', async () => {
    respond(200, syntheticRun());
    render(hosted(<Diorama source={{ runId: 'r1' }} cameras={['iso', 'top']} />));
    await screen.findByRole('radiogroup', { name: /camera/i });
    expect(screen.getAllByRole('radio')).toHaveLength(2);
  });
  it('the public landing list shows no planner ms or waited values; Margin stays', async () => {
    respond(200, syntheticRun());
    render(hosted(<Diorama source={{ runId: 'r1' }} />));
    fireEvent.click(await screen.findByRole('button', { name: /landing 2/i }));
    const values = screen.getByRole('group', { name: /landing 2 values/i });
    expect(values).toHaveTextContent('0.050 b');
    expect(values).not.toHaveTextContent('640 ms');
    expect(values).not.toHaveTextContent(/planner|waited/i);
  });
  it('public timeline markers carry no planner internals; the death marker is cause only', () => {
    const full = parkourMarkers(tl), pub = publicParkourMarkers(tl);
    expect(full.some(m => /slow plan|late plan|server correction/.test(m.label))).toBe(true);   // control: the debug set has them
    expect(pub.some(m => /slow plan|late plan|correction/i.test(m.label))).toBe(false);
    expect(pub.some(m => m.kind === 'slow_plan' || m.kind === 'late_plan' || m.kind === 'correction')).toBe(false);
    const death = pub.find(m => m.kind === 'death')!;
    expect(death.label).toBe('no jump found');
    expect(death.label).not.toMatch(/tick|plan for|→/);
    expect(full.find(m => m.kind === 'death')!.label).toMatch(/plan for/);
  });
  it('a stored camera outside the cameras prop falls back to the first one (a radio is checked)', async () => {
    localStorage.setItem('remhub:rem-mc:diorama', JSON.stringify({ camera: 'cinematic', xray: false, rotation: 0 }));
    respond(200, syntheticRun());
    render(hosted(<Diorama source={{ runId: 'r1' }} cameras={['iso', 'top']} />));
    expect(await screen.findByRole('radio', { name: /isometric/i })).toHaveAttribute('aria-checked', 'true');
  });
});
