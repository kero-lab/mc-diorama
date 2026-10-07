import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Diorama } from '../src/diorama';
import { landingValues } from '../src/layers/parkour/derive';
import { END_WORDS } from '../src/layers/parkour/activity';
import { emptyTimeline } from '../src/timeline';
import type { Timeline } from '../src/types';
import { withHost } from './test-host';

let current: Timeline;
vi.mock('../src/use-run-timeline', () => ({ useRunTimeline: () => ({ tl: current, status: 'ready', error: null }) }));
const mk = (lastT: number) => ({ ...emptyTimeline(), runId: 'w', startT: 0, lastT, scores: [{ t: 0, score: 0 }], samples: [] }) as Timeline;
const feed = { epoch: 1, subscribe: () => () => {} };
const slider = () => screen.getByRole('slider', { name: /timeline/i }) as HTMLInputElement;

describe('export surface (spec 3.1)', () => {
  it('the public entry hides planner internals; the debug entry has them', async () => {
    const pub = Object.keys(await import('../src/index'));
    for (const k of ['parkourMarkers', 'thinkingRows', 'deathCard', 'planFor', 'sneakTicksAfter', 'SLOW_PLAN_MS']) expect(pub).not.toContain(k);
    expect(pub).toContain('publicParkourMarkers');
    const dbg = Object.keys(await import('../src/debug/index'));
    expect(dbg).toContain('parkourMarkers');
    expect(dbg).toContain('DEBUG_LAYERS');
  });
  it('landingValues is public by default', () => {
    const j = { gap: 1, height: 0, offset: 0, blockType: 'x', predictedMargin: 0.1, entrySpeed: 0.3, plannerMs: 600, waitTicks: 2, corrected: false } as never;
    expect(landingValues(j, undefined).map(([k]) => k)).not.toContain('Planner');
  });
  it('aborted wording is neutral', () => { expect(END_WORDS.aborted).toBe('stopped early'); });
});

describe('behind-live readout (R11) and replay window', () => {
  beforeEach(() => { current = mk(600_000); });
  it('no readout without a window; with one it carries an aria-label', () => {
    const { unmount } = render(withHost(<Diorama source={{ live: true }} feed={feed} connected />));
    fireEvent.change(slider(), { target: { value: '500000' } });
    expect(screen.queryByText(/^−\d+:\d\d\.\d$/)).toBeNull();
    unmount();
    render(withHost(<Diorama source={{ live: true }} feed={feed} connected rewindWindowMs={120_000} />));
    fireEvent.change(slider(), { target: { value: '500000' } });
    expect(screen.getByLabelText('1:40.0 behind live')).toBeInTheDocument();
  });
  it('a replay ignores rewindWindowMs and can seek to its start', () => {
    render(withHost(<Diorama source={{ runId: 'w' }} rewindWindowMs={120_000} />));
    expect(slider().min).toBe('0');
    fireEvent.change(slider(), { target: { value: '0' } });
    expect(slider().value).toBe('0');
  });
  it('cameras=[] falls back to the built-in cameras', () => {
    render(withHost(<Diorama source={{ runId: 'w' }} cameras={[]} />));
    expect(screen.getAllByRole('radio').length).toBeGreaterThan(1);
  });
  it('compact without WebGL drops the panels clause', () => {
    const { container, rerender } = render(withHost(<Diorama source={{ runId: 'w' }} compact />));
    expect(container.textContent).toContain('3D view unavailable (WebGL is off in this browser).');
    expect(container.textContent).not.toContain('Every number');
    rerender(withHost(<Diorama source={{ runId: 'w' }} />));
    expect(container.textContent).toContain('Every number is listed below.');
  });
});
