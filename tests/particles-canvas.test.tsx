// The canvas mounts <Particles> with the current frame's blocks, and never under reduced motion. jsdom has no WebGL, so
// this walks the element tree DioramaCanvas hands to R3F's Canvas.
import { render } from '@testing-library/react';
import { isValidElement, type ReactNode } from 'react';
import { expect, it, vi } from 'vitest';
import DioramaCanvas, { type DioramaCanvasProps } from '../src/canvas';
import { Particles } from '../src/scene/particles';

const seen: Record<string, unknown>[] = [];
vi.mock('@react-three/fiber', async importOriginal => ({ ...(await importOriginal<object>()), Canvas: (p: Record<string, unknown>) => { seen.push(p); return null; } }));

function find(node: ReactNode, type: unknown): Record<string, unknown> | null {
  if (Array.isArray(node)) { for (const n of node) { const f = find(n, type); if (f) return f; } return null; }
  if (!isValidElement(node)) return null;
  const props = node.props as Record<string, unknown> & { children?: ReactNode };
  return node.type === type ? props : find(props.children, type);
}
const blocks = [{ at: [0, 0, 0], name: 'stone', state: null, order: null }];
const props = (reducedMotion: boolean) => ({ tl: { samples: [] }, reducedMotion, frame: { T: 5, rem: null, entities: [], blocks }, layer: { Scene: () => null } }) as unknown as DioramaCanvasProps;

it('mounts Particles with the frame blocks unless reduced motion', () => {
  render(<DioramaCanvas {...props(false)} />);
  const p = find(seen.at(-1)?.children as ReactNode, Particles);
  expect(p?.blocks).toBe(blocks);
  expect(p?.T).toBe(5);
  render(<DioramaCanvas {...props(true)} />);
  expect(find(seen.at(-1)?.children as ReactNode, Particles)).toBeNull();
});
