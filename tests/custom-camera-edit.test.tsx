import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CUSTOM_LIMITS, DEFAULT_CUSTOM, orbit } from '../src/registry/custom-camera';
import { CustomCameraPanel } from '../src/custom-camera-panel';
import { OrbitSurface } from '../src/orbit-surface';

describe('orbit()', () => {
  it('drags turn yaw and pitch; pitch is clamped', () => {
    const o = orbit(DEFAULT_CUSTOM, { dx: 100, dy: 1e6 });
    expect(o.yaw).toBeCloseTo(DEFAULT_CUSTOM.yaw + 1);
    expect(o.pitch).toBe(CUSTOM_LIMITS.pitch[1]);
  });
  it('zoom multiplies distance and respects the limits', () => {
    expect(orbit(DEFAULT_CUSTOM, { zoomSteps: 1 }).distance).toBeCloseTo(DEFAULT_CUSTOM.distance * 1.15);
    expect(orbit(DEFAULT_CUSTOM, { zoomSteps: -100 }).distance).toBe(CUSTOM_LIMITS.distance[0]);
  });
  it('NaN deltas leave the params unchanged', () => {
    expect(orbit(DEFAULT_CUSTOM, { dx: Number.NaN, zoomSteps: Number.NaN })).toEqual(DEFAULT_CUSTOM);
  });
});

describe('CustomCameraPanel', () => {
  it('every field has a labelled control; changing one emits sanitised params', () => {
    const onChange = vi.fn();
    render(<CustomCameraPanel value={DEFAULT_CUSTOM} onChange={onChange} />);
    for (const label of [/anchor/i, /yaw/i, /pitch/i, /distance/i, /height/i, /field of view/i, /smoothing/i, /look ahead/i, /lock roll/i, /projection/i]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    fireEvent.change(screen.getByLabelText(/field of view/i), { target: { value: '90' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_CUSTOM, fov: 90 });
  });
});

describe('OrbitSurface', () => {
  it('a drag orbits, the wheel zooms, arrow keys orbit and +/- zoom', () => {
    const onChange = vi.fn();
    render(<OrbitSurface value={DEFAULT_CUSTOM} onChange={onChange} />);
    const s = screen.getByRole('application', { name: /camera/i });
    fireEvent.pointerDown(s, { clientX: 0, clientY: 0, pointerId: 1 });
    fireEvent.pointerMove(s, { clientX: 50, clientY: 0, pointerId: 1 });
    expect(onChange.mock.calls.at(-1)![0].yaw).toBeCloseTo(DEFAULT_CUSTOM.yaw + 0.5);
    fireEvent.wheel(s, { deltaY: 100 });
    expect(onChange.mock.calls.at(-1)![0].distance).toBeCloseTo(DEFAULT_CUSTOM.distance * 1.15);
    fireEvent.keyDown(s, { key: 'ArrowLeft' });
    expect(onChange.mock.calls.at(-1)![0].yaw).toBeCloseTo(DEFAULT_CUSTOM.yaw - 0.1);
    fireEvent.keyDown(s, { key: '-' });
    expect(onChange.mock.calls.at(-1)![0].distance).toBeCloseTo(DEFAULT_CUSTOM.distance * 1.15);
  });
});

describe('OrbitSurface browser integration', () => {
  it('the wheel is a non-passive native listener that cancels page scroll', () => {
    const onChange = vi.fn();
    render(<OrbitSurface value={DEFAULT_CUSTOM} onChange={onChange} />);
    const s = screen.getByRole('application', { name: /camera/i });
    const ev = new WheelEvent('wheel', { deltaY: 100, cancelable: true, bubbles: true });
    s.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(onChange.mock.calls.at(-1)![0].distance).toBeCloseTo(DEFAULT_CUSTOM.distance * 1.15);
  });
  it('Ctrl/Cmd/Alt chords are left to the browser', () => {
    const onChange = vi.fn();
    render(<OrbitSurface value={DEFAULT_CUSTOM} onChange={onChange} />);
    const s = screen.getByRole('application', { name: /camera/i });
    for (const init of [{ key: '-', ctrlKey: true }, { key: '=', metaKey: true }, { key: 'ArrowLeft', altKey: true }]) {
      const ev = new KeyboardEvent('keydown', { ...init, cancelable: true, bubbles: true });
      s.dispatchEvent(ev);
      expect(ev.defaultPrevented).toBe(false);
    }
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('review fixes', () => {
  it('wheel zoom scales by delta: tiny trackpad deltas are tiny, huge ones clamp at 3 steps, line mode is scaled', () => {
    const onChange = vi.fn();
    render(<OrbitSurface value={DEFAULT_CUSTOM} onChange={onChange} />);
    const s = screen.getByRole('application', { name: /camera/i });
    fireEvent.wheel(s, { deltaY: 4 });
    expect(onChange.mock.calls.at(-1)![0].distance).toBeCloseTo(DEFAULT_CUSTOM.distance * 1.15 ** 0.04, 5);
    fireEvent.wheel(s, { deltaY: 10000 });
    expect(onChange.mock.calls.at(-1)![0].distance).toBeCloseTo(DEFAULT_CUSTOM.distance * 1.15 ** 3, 5);
    fireEvent.wheel(s, { deltaY: -10000 });
    expect(onChange.mock.calls.at(-1)![0].distance).toBeCloseTo(DEFAULT_CUSTOM.distance * 1.15 ** -3, 5);
    fireEvent.wheel(s, { deltaY: 3, deltaMode: 1 });
    expect(onChange.mock.calls.at(-1)![0].distance).toBeCloseTo(DEFAULT_CUSTOM.distance * 1.15 ** 0.99, 5);
  });

  it('orbit wraps yaw into [-pi, pi] without changing the direction', () => {
    const o = orbit(DEFAULT_CUSTOM, { dx: (10 * Math.PI) / 0.01 });
    expect(o.yaw).toBeGreaterThanOrEqual(-Math.PI); expect(o.yaw).toBeLessThanOrEqual(Math.PI);
    const raw = DEFAULT_CUSTOM.yaw + 10 * Math.PI;
    expect(Math.cos(o.yaw)).toBeCloseTo(Math.cos(raw), 6); expect(Math.sin(o.yaw)).toBeCloseTo(Math.sin(raw), 6);
  });

  it('the panel offers "Fixed point" only when a world point is set', () => {
    const { rerender } = render(<CustomCameraPanel value={DEFAULT_CUSTOM} onChange={vi.fn()} />);
    expect(screen.queryByRole('option', { name: /fixed point/i })).toBeNull();
    rerender(<CustomCameraPanel value={{ ...DEFAULT_CUSTOM, anchor: 'world', world: [1, 2, 3] }} onChange={vi.fn()} />);
    expect(screen.getByRole('option', { name: /fixed point/i })).toBeInTheDocument();
  });
});
