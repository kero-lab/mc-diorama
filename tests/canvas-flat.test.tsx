// Vanilla does no tone mapping: the diorama Canvas must be `flat` (R3F 9.5 sets gl.toneMapping = flat ? NoToneMapping
// : ACESFilmicToneMapping when it creates the renderer). jsdom has no WebGL, so this asserts the prop DioramaCanvas
// actually passes to R3F's Canvas; a removed `flat` fails here.
import { render } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import DioramaCanvas, { type DioramaCanvasProps } from '../src/canvas';

const seen: Record<string, unknown>[] = [];
vi.mock('@react-three/fiber', async importOriginal => ({ ...(await importOriginal<object>()), Canvas: (p: Record<string, unknown>) => { seen.push(p); return null; } }));

it('the diorama Canvas is flat (NoToneMapping)', () => {
  render(<DioramaCanvas {...({ frame: { rem: null, entities: [], blocks: [] }, layer: { Scene: () => null } } as unknown as DioramaCanvasProps)} />);
  expect(seen.at(-1)?.flat).toBe(true);
});
