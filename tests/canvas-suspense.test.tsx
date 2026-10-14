// A texture that is still loading (or never loads) must never blank the scene. R3F 9.5's Canvas wraps its children in a
// Suspense whose fallback is `Block`: a suspension that reaches it makes the DOM <Canvas> throw a never-resolving promise,
// the page's Suspense (diorama.tsx) hides it, R3F unmounts the root and forceContextLoss() kills the WebGL context. The
// 0.4.0 sun (VanillaSky's useLoader, no Suspense of its own) did exactly that (#2184 Task 11). jsdom has no WebGL, so this
// renders the tree DioramaCanvas hands to R3F's Canvas into the DOM with a stand-in Canvas whose Suspense fallback records
// an escaped suspension, and every useLoader suspends forever (or fails, for the sun).
import { render } from '@testing-library/react';
import { Suspense, type ReactNode } from 'react';
import * as THREE from 'three';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import DioramaCanvas, { type DioramaCanvasProps } from '../src/canvas';
import { DioramaHostProvider, type DioramaHost } from '../src/host';

const loader = vi.hoisted(() => ({ mode: 'pending' as 'pending' | 'fail-sun' }));
vi.mock('@react-three/fiber', async importOriginal => {
  const THREE = await import('three');
  const state = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), invalidate: () => {}, size: { width: 800, height: 450 }, viewport: { width: 800, height: 450 } };
  const never = new Promise(() => {});
  return {
    ...(await importOriginal<object>()),
    // The real Canvas's root boundary: its fallback rendering means a suspension escaped to it (context loss in a browser).
    Canvas: ({ children }: { children: ReactNode }) => <Suspense fallback={<i data-testid='canvas-root-suspended' />}>{children}</Suspense>,
    useThree: (sel?: (s: typeof state) => unknown) => (sel ? sel(state) : state),
    useFrame: () => {},
    useLoader: (_l: unknown, url: string | string[]) => {
      if (loader.mode === 'fail-sun' && String(url).includes('environment/sun')) throw new Error(`404 ${String(url)}`);
      throw never;
    },
  };
});
vi.mock('../src/scene/camera-rig', () => ({ CameraRig: () => null }));

const host = { assetBase: '/mc', prefsKey: 'k', loadRecording: async () => 'missing', schematicLabel: () => null, schematicName: () => '', Button: () => null } as unknown as DioramaHost;
const rem = { p: [0, 64, 0], yaw: 0, pitch: 0 };
const sample = (t: number, x: number) => ({ t, tick: null, p: [x, 64, 0], v: null, yaw: 0, pitch: 0, c: 'stand', held: null, ride: null, g: true, reset: false });
const samples = [sample(0, 0), sample(1000, 1)];
const props = {
  tl: { samples }, camera: 'shoulder', rotation: 0, xray: false, reducedMotion: false, selected: null, active: false, timeScale: { current: 1 }, renderFrame: { current: null },
  frame: { T: 500, rem, entities: [{ id: 1, kind: 'zombie', pose: { p: [2, 64, 2], yaw: 0 } }], blocks: [{ at: [0, 63, 0], name: 'stone', state: null, order: 0 }] },
  layer: { Scene: () => <mesh data-part='layer-scene' /> },
} as unknown as DioramaCanvasProps;

let sunLoads: number;
beforeEach(() => {
  sunLoads = 0;
  vi.spyOn(console, 'error').mockImplementation(() => {});   // react-dom warns about three's props on unknown tags
  // A non-suspending sun loader goes through TextureLoader#load: never answer (pending) or fail (fail-sun).
  vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation(function (url, _onLoad, _onProgress, onError) {
    if (url.includes('environment/sun')) sunLoads++;
    if (loader.mode === 'fail-sun') queueMicrotask(() => onError?.(new Error(`404 ${url}`)));
    return new THREE.Texture();
  });
});
afterEach(() => { loader.mode = 'pending'; vi.restoreAllMocks(); });

const mount = () => render(<DioramaHostProvider host={host}><DioramaCanvas {...props} /></DioramaHostProvider>);

it('a texture still loading never suspends the Canvas root: sky, layer scene and entities stay mounted', async () => {
  const { container, queryByTestId } = mount();
  await Promise.resolve();
  expect(queryByTestId('canvas-root-suspended')).toBeNull();
  expect(container.querySelector('spheregeometry')).not.toBeNull();   // the sky dome
  expect(container.querySelector('[data-part="layer-scene"]')).not.toBeNull();
  expect(container.querySelector('boxgeometry')).not.toBeNull();       // the entity
});

it('a sun texture that fails to load leaves the sky drawn, without the sun, and throws nothing', async () => {
  loader.mode = 'fail-sun';
  const { container, queryByTestId } = mount();
  await new Promise(r => setTimeout(r, 0));
  expect(queryByTestId('canvas-root-suspended')).toBeNull();
  expect(container.querySelector('spheregeometry')).not.toBeNull();
  expect(container.querySelector('planegeometry')).toBeNull();          // no sun quad without its texture
  expect(sunLoads).toBe(1);
});
