import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Diorama } from '../src/diorama';
import { emptyTimeline } from '../src/timeline';
import type { Timeline } from '../src/types';
import { withHost } from './test-host';

let current: Timeline;
vi.mock('../src/use-run-timeline', () => ({ useRunTimeline: () => ({ tl: current, status: 'ready', error: null }) }));
const mk = (lastT: number) => ({ ...emptyTimeline(), runId: 'w', startT: 0, lastT, scores: [{ t: 0, score: 0 }], samples: [] }) as Timeline;
const feed = { epoch: 1, subscribe: () => () => {} };
const ui = () => withHost(<Diorama source={{ live: true }} feed={feed} connected rewindWindowMs={120_000} />);
const slider = () => screen.getByRole('slider', { name: /timeline/i }) as HTMLInputElement;
const readout = () => screen.queryByText(/^−\d+:\d\d\.\d$/)?.textContent;

describe('rewind window in the component (Review Focus 3)', () => {
  beforeEach(() => { current = mk(600_000); });
  it('a paused viewer stays put inside the window, then lands on the window start, never live', () => {
    const { rerender } = render(ui());
    fireEvent.change(slider(), { target: { value: '500000' } });
    expect(screen.getByRole('button', { name: /back to live/i })).toBeEnabled();
    expect(readout()).toBe('−1:40.0');
    current = mk(610_000);                       // floor 490 s: 500 s is still inside
    rerender(ui());
    expect(readout()).toBe('−1:50.0');
    current = mk(640_000);                       // floor 520 s passed her T
    rerender(ui());
    expect(screen.getByRole('button', { name: /back to live/i })).toBeEnabled();   // live not re-engaged
    expect(readout()).toBe('−2:00.0');            // on the window start, never beyond the window
    current = mk(700_000);
    rerender(ui());
    expect(readout()).toBe('−2:00.0');
  });
});
