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

// Vanilla renders without MSAA (no multisample state anywhere in blaze3d's GL layer). With MSAA a partly covered edge
// pixel is shaded at its centre, outside the triangle: the UV leaves the face's rect in the 64×64 skin net, reads a
// neighbouring (mostly alpha 0) texel and is cut out, and sub-pixel slivers of her limbs' side faces blend in. Both drew
// light seams along her silhouette and between her limbs (#2184 Task 11a).
it('the diorama Canvas has no MSAA, as vanilla', () => {
  render(<DioramaCanvas {...({ frame: { rem: null, entities: [], blocks: [] }, layer: { Scene: () => null } } as unknown as DioramaCanvasProps)} />);
  expect((seen.at(-1)?.gl as { antialias?: boolean }).antialias).toBe(false);
});
