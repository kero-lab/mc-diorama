import { render, screen } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Diorama } from '../src/diorama';
import { DEFAULT_CUSTOM } from '../src/registry/custom-camera';
import { emptyTimeline } from '../src/timeline';
import type { Timeline } from '../src/types';
import { withHost } from './test-host';

const seen: { custom?: unknown; camera?: unknown }[] = [];
vi.mock('../src/canvas', () => ({ default: (p: { custom: unknown; camera: unknown }) => { seen.push({ custom: p.custom, camera: p.camera }); return <div data-testid='canvas-stub' />; } }));
// jsdom has no layout/WebGL to tell the parkour Panels apart, so the layer's Panels component is replaced by a marker.
vi.mock('../src/layers/parkour/panels', () => ({ ParkourPanels: () => <div data-testid='layer-panels' /> }));

let current: Timeline;
vi.mock('../src/use-run-timeline', () => ({ useRunTimeline: () => ({ tl: current, status: 'ready', error: null }) }));
const feed = { epoch: 1, subscribe: () => () => {} };

beforeAll(() => {
  (window as unknown as { WebGLRenderingContext: unknown }).WebGLRenderingContext = function () {};
  HTMLCanvasElement.prototype.getContext = ((id: string) => (id === 'webgl2' || id === 'webgl' ? { getExtension: () => null } : null)) as never;
});
beforeEach(() => {
  current = { ...emptyTimeline(), runId: 'c', startT: 0, lastT: 60_000, scores: [{ t: 0, score: 0 }], samples: [] } as Timeline;
  seen.length = 0; localStorage.clear();
});

describe('Diorama host contracts (WebGL stubbed, canvas mocked)', () => {
  it('the canvas receives sanitised custom params', async () => {
    render(withHost(<Diorama source={{ live: true }} feed={feed} camera='custom' cameras={['custom']} customParams={{ ...DEFAULT_CUSTOM, fov: 9999 }} />));
    await screen.findByTestId('canvas-stub');
    const last = seen.at(-1)!;
    expect(last.camera).toBe('custom');
    expect((last.custom as { fov: number }).fov).toBe(110);
  });

  it('the orbit surface exists only for camera=custom with onCustomParamsChange', async () => {
    const base = { source: { live: true as const }, feed, cameras: ['side', 'custom'] as never };
    const { unmount } = render(withHost(<Diorama {...base} camera='custom' onCustomParamsChange={vi.fn()} />));
    await screen.findByTestId('canvas-stub');
    expect(screen.getByRole('application')).toBeInTheDocument();
    unmount();
    const b = render(withHost(<Diorama {...base} camera='custom' />));
    await screen.findByTestId('canvas-stub');
    expect(screen.queryByRole('application')).toBeNull();
    b.unmount();
    render(withHost(<Diorama {...base} camera='side' onCustomParamsChange={vi.fn()} />));
    await screen.findByTestId('canvas-stub');
    expect(screen.queryByRole('application')).toBeNull();
  });

  it('panels={false} removes the layer panels', async () => {
    const a = render(withHost(<Diorama source={{ live: true }} feed={feed} />));
    await screen.findByTestId('canvas-stub');
    expect(screen.getByTestId('layer-panels')).toBeInTheDocument();
    a.unmount();
    render(withHost(<Diorama source={{ live: true }} feed={feed} panels={false} />));
    await screen.findByTestId('canvas-stub');
    expect(screen.queryByTestId('layer-panels')).toBeNull();
  });
});
