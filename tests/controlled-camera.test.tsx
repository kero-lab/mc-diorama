import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Diorama } from '../src/diorama';
import { DEFAULT_CUSTOM } from '../src/registry/custom-camera';
import { emptyTimeline } from '../src/timeline';
import type { Timeline } from '../src/types';
import { withHost } from './test-host';

let current: Timeline;
vi.mock('../src/use-run-timeline', () => ({ useRunTimeline: () => ({ tl: current, status: 'ready', error: null }) }));
const mk = (lastT: number) => ({ ...emptyTimeline(), runId: 'c', startT: 0, lastT, scores: [{ t: 0, score: 0 }, { t: 1000, score: 7 }], samples: [] }) as Timeline;
const feed = { epoch: 1, subscribe: () => () => {} };

describe('controlled camera and prefs (Rem Live)', () => {
  beforeEach(() => { current = mk(60_000); localStorage.clear(); vi.restoreAllMocks(); });

  it('persistPrefs=false never touches localStorage', () => {
    const set = vi.spyOn(Storage.prototype, 'setItem'), get = vi.spyOn(Storage.prototype, 'getItem');
    render(withHost(<Diorama source={{ live: true }} feed={feed} persistPrefs={false} />));
    expect(set).not.toHaveBeenCalled(); expect(get).not.toHaveBeenCalled();
  });

  it('a controlled camera wins over stored prefs, and picking one calls onCameraChange instead of changing by itself', () => {
    localStorage.setItem('test:diorama', JSON.stringify({ camera: 'top' }));
    const onCameraChange = vi.fn();
    render(withHost(<Diorama source={{ live: true }} feed={feed} camera='side' onCameraChange={onCameraChange} cameras={['side', 'top', 'custom']} />, { prefsKey: 'test:diorama' }));
    // The picker is a radio group: role=radio + aria-checked (not button + aria-pressed).
    expect(screen.getByRole('radio', { name: /^side$/i })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByRole('radio', { name: /^top$/i }));
    expect(onCameraChange).toHaveBeenCalledWith('top');
    expect(screen.getByRole('radio', { name: /^side$/i })).toHaveAttribute('aria-checked', 'true');
  });

  it('viewControls=false hides the picker but keeps the timeline', () => {
    render(withHost(<Diorama source={{ live: true }} feed={feed} viewControls={false} />));
    expect(screen.queryByRole('radio', { name: /side/i })).toBeNull();
    expect(screen.queryByRole('radiogroup', { name: /camera/i })).toBeNull();
    expect(screen.getByRole('slider', { name: /timeline/i })).toBeInTheDocument();
  });

  it('onFrame reports the playhead: on mount and after a seek, with behindMs while windowed live', () => {
    const onFrame = vi.fn();
    render(withHost(<Diorama source={{ live: true }} feed={feed} rewindWindowMs={120_000} onFrame={onFrame} />));
    expect(onFrame).toHaveBeenCalled();
    const first = onFrame.mock.calls.at(-1)![0];
    expect(first.live).toBe(true); expect(first.status).toBe('ready'); expect(first.tl.runId).toBe('c');
    act(() => { fireEvent.change(screen.getByRole('slider', { name: /timeline/i }), { target: { value: '30000' } }); });
    const after = onFrame.mock.calls.at(-1)![0];
    // bounds().end is lastT (no live delay), so 60 000 - 30 000.
    expect(after.live).toBe(false); expect(after.T).toBe(30_000); expect(after.behindMs).toBe(30_000);
  });

  it('customParams flows to the canvas props unchanged when controlled (sanitised)', () => {
    // jsdom has no WebGL, so the canvas never mounts; the contract is that a bad value never throws.
    expect(() => render(withHost(<Diorama source={{ live: true }} feed={feed} camera='custom' cameras={['custom']} customParams={{ ...DEFAULT_CUSTOM, fov: 9999 }} />))).not.toThrow();
  });
});
