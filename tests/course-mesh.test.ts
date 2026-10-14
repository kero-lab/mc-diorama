import { describe, expect, it } from 'vitest';
import { buildCourseMesh, RENDER_PASS } from '../src/vanilla/course-mesh';
import { vanillaMesh, vanillaQuads } from '../src/scene/vanilla-blocks';
import type { WorldBlock } from '../src/types';

const b = (x: number, y: number, z: number, name = 'red_wool', state: WorldBlock['state'] = null): WorldBlock => ({ at: [x, y, z], name, state, order: null });
// colours are stored linear (three's vertex colours); compare in sRGB, the space vanilla multiplies in
const srgb = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
const brightness = (m: ReturnType<typeof buildCourseMesh>) => [...new Set(m.parts.flatMap(p => Array.from(p.colors)).map(v => Math.round(srgb(v) * 100) / 100))].sort();

describe('course mesh', () => {
  it('vanillaMesh is unchanged by the quad refactor', () => {
    const q = vanillaQuads('red_wool', null);
    expect(q).toHaveLength(6);
    expect(vanillaMesh('red_wool', null)!.geometry.getAttribute('position').count).toBe(36);
  });
  it('onBoundary: an inset quad of a full-collision block counts, an inset quad of a non-full block does not', () => {
    const slime = vanillaQuads('slime_block', null);
    const inner = slime.filter(q => q.pts.every(p => p.every(c => c > 0.1 && c < 0.9 || Math.abs(c - 3 / 16) < 1e-6 || Math.abs(c - 13 / 16) < 1e-6)));
    expect(inner.length).toBe(6);
    expect(slime.every(q => q.onBoundary)).toBe(true);
    expect(vanillaQuads('smooth_quartz_slab', { type: 'bottom' }).filter(q => q.face === 'up').every(q => !q.onBoundary)).toBe(true);
    expect(vanillaQuads('smooth_quartz_slab', { type: 'double' }).every(q => q.onBoundary)).toBe(true);
  });
  it('an isolated cube: six faces, vanilla face shades, no AO darkening', () => {
    const m = buildCourseMesh([b(0, 0, 0)]);
    expect(m.parts.reduce((n, p) => n + p.positions.length / 9, 0)).toBe(12);
    expect(brightness(m)).toEqual([0.5, 0.6, 0.8, 1]);
  });
  it('culls the faces two opaque cubes share', () => {
    const m = buildCourseMesh([b(0, 0, 0), b(1, 0, 0)]);
    expect(m.parts.reduce((n, p) => n + p.positions.length / 9, 0)).toBe(20);
  });
  it('darkens the top face toward a raised neighbour', () => {
    const m = buildCourseMesh([b(0, 0, 0), b(1, 1, 0)]);
    expect(brightness(m)).toContain(0.8);
  });
  it('ladders, panes and doors get face shade only; ladders are unshaded', () => {
    const m = buildCourseMesh([b(0, 0, 0, 'ladder', { facing: 'north' }), b(0, 0, 1, 'red_wool')]);
    const ladder = m.parts.find(p => p.texture === 'block/ladder')!;
    expect(new Set(Array.from(ladder.colors).map(v => Math.round(srgb(v) * 100) / 100))).toEqual(new Set([1]));
  });
  it('assigns render passes', () => {
    expect(RENDER_PASS.red_stained_glass).toBe('translucent');
    expect(RENDER_PASS.ladder).toBe('cutout');
    expect(RENDER_PASS.red_wool ?? 'opaque').toBe('opaque');
  });
  it('maps every triangle to its block', () => {
    const m = buildCourseMesh([b(0, 0, 0), b(5, 0, 0)]);
    const keys = new Set(m.parts.flatMap(p => p.blockOfTriangle));
    expect(keys).toEqual(new Set(['0,0,0', '5,0,0']));
  });
  it('unknown block falls back and is counted', () => {
    const m = buildCourseMesh([b(0, 0, 0, 'not_a_block')]);
    expect(m.fallback.map(x => x.name)).toEqual(['not_a_block']);
  });
  it('same blocks array, same parts object', () => {
    const blocks = [b(0, 0, 0)];
    expect(buildCourseMesh(blocks)).toBe(buildCourseMesh(blocks));
  });
  it('empty course', () => expect(buildCourseMesh([]).parts).toEqual([]));
});
