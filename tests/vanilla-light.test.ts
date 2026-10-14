// tests/vanilla-light.test.ts: values worked by hand from ModelBlockRenderer / AmbientOcclusionRenderStorage and
// ClientLevel#getShade (VANILLA-RENDER.md §6).
import { describe, expect, it } from 'vitest';
import { FACE_SHADE, aoAt, aoVertex, faceCornerAO, hidesFace, shadeBrightness } from '../src/vanilla/light';

const wool = { name: 'red_wool', state: null };
const world = (solid: string[]) => (x: number, y: number, z: number) => solid.includes(`${x},${y},${z}`) ? 0.2 : 1;

describe('vanilla light', () => {
  it('face shade per direction', () => expect(FACE_SHADE).toEqual({ down: 0.5, up: 1, north: 0.8, south: 0.8, west: 0.6, east: 0.6 }));
  it('shade brightness: full collision 0.2, glass family and partial shapes 1.0', () => {
    expect(shadeBrightness(wool)).toBe(0.2);
    expect(shadeBrightness({ name: 'slime_block', state: null })).toBe(0.2);
    expect(shadeBrightness({ name: 'packed_ice', state: null })).toBe(0.2);
    for (const name of ['red_stained_glass', 'honey_block', 'glass_pane', 'ladder', 'oak_fence', 'scaffolding', 'oak_door']) expect(shadeBrightness({ name, state: null }), name).toBe(1);
    expect(shadeBrightness({ name: 'smooth_quartz_slab', state: { type: 'bottom' } })).toBe(1);
    expect(shadeBrightness({ name: 'smooth_quartz_slab', state: { type: 'double' } })).toBe(0.2);
    expect(shadeBrightness(undefined)).toBe(1);
  });
  it('culling: opaque cubes hide neighbours; the glass family hides only itself', () => {
    expect(hidesFace('east', 'red_wool', wool)).toBe(true);
    expect(hidesFace('east', 'red_stained_glass', { name: 'red_stained_glass', state: null })).toBe(true);
    expect(hidesFace('east', 'red_wool', { name: 'red_stained_glass', state: null })).toBe(false);
    expect(hidesFace('up', 'red_wool', { name: 'smooth_quartz_slab', state: { type: 'bottom' } })).toBe(true);   // slab's full bottom above
    expect(hidesFace('east', 'red_wool', { name: 'smooth_quartz_slab', state: { type: 'bottom' } })).toBe(false);
    expect(hidesFace('up', 'red_wool', undefined)).toBe(false);
  });
  it('AO vertex: four-sample mean; a corner behind two occluding sides copies a side', () => {
    expect(aoVertex(1, 1, 1, 1)).toBe(1);
    expect(aoVertex(0.2, 1, 1, 1)).toBeCloseTo(0.8);
    expect(aoVertex(0.2, 0.2, 1, 1)).toBeCloseTo(0.4);       // corner ignored, copies side: (0.2+0.2+0.2+1)/4
    expect(aoVertex(1, 1, 0.2, 1)).toBeCloseTo(0.8);
  });
  it('a top face next to a raised block darkens only the corners toward it', () => {
    // Block at 0,0,0; another at 1,1,0 (east, one up): the top face's layer is y=1.
    const ao = faceCornerAO([0, 0, 0], 'up', true, world(['1,1,0']));
    expect(aoAt(ao, [0, 1, 0.5])).toBeCloseTo(1);           // west edge: untouched
    expect(aoAt(ao, [1, 1, 0])).toBeCloseTo(0.8);           // east corners: one occluding side
    expect(aoAt(ao, [1, 1, 1])).toBeCloseTo(0.8);
    expect(aoAt(ao, [0.5, 1, 0.5])).toBeCloseTo(0.9);       // bilinear between them
  });

  it('vanilla: a side only counts as walled in when the cell beyond it also blocks (ModelBlockRenderer corner rule)', () => {
    // Two one-high walls meeting at an inside corner of the top face: sides occlude, but nothing sits above them.
    const solid = ['1,1,0', '0,1,1'];
    const open = faceCornerAO([0, 0, 0], 'up', true, world(solid));
    expect(aoAt(open, [1, 1, 1])).toBeCloseTo((0.2 + 0.2 + 1 + 1) / 4);   // diagonal (1) is used, not copied
    // Same walls, but each has a block on top: walled in, so the corner copies corners[0] (up face: east, 0.2).
    const walled = faceCornerAO([0, 0, 0], 'up', true, world([...solid, '1,2,0', '0,2,1']));
    expect(aoAt(walled, [1, 1, 1])).toBeCloseTo((0.2 + 0.2 + 0.2 + 1) / 4);
  });
  it('vanilla: the copied value is the face\'s first adjacency cell, even when it is not one of the vertex sides', () => {
    // Up face copies EAST. Vertex (-x,+z) has sides west and south; only west/south are walled, east is open (1).
    const solid = ['-1,1,0', '0,1,1', '-1,2,0', '0,2,1'];
    const ao = faceCornerAO([0, 0, 0], 'up', true, world(solid));
    expect(aoAt(ao, [0, 1, 1])).toBeCloseTo((0.2 + 0.2 + 1 + 1) / 4);
  });
  it('vanilla: slime is walled in (view-blocking, light block > 0), so it triggers the corner copy with the default', () => {
    const slime = (x: number, y: number, z: number) => ['1,1,0', '0,1,1', '1,2,0', '0,2,1'].includes(`${x},${y},${z}`) ? shadeBrightness({ name: 'slime_block', state: null }) : 1;
    expect(aoAt(faceCornerAO([0, 0, 0], 'up', true, slime), [1, 1, 1])).toBeCloseTo((0.2 + 0.2 + 0.2 + 1) / 4);
  });
});
