import { describe, expect, it } from 'vitest';
import { blockDef, boxesOf, shapeOf } from '../src/registry/blocks';
import { entityDef } from '../src/registry/entities';
import { commonMarkers, GENERIC_LAYER, layerFor } from '../src/registry/layers';
import { emptyTimeline, timelineReducer } from '../src/timeline';
import type { BlockStateProps } from '../src/model';
import { syntheticRun, tAt } from './fixtures/rem-mc/synthetic-p8';

const COURSE = ['red_wool', 'red_terracotta', 'red_concrete', 'red_stained_glass', 'packed_ice', 'smooth_quartz_slab', 'glass_pane', 'oak_fence'];
const PASTE = ['lime_wool', 'red_wool', 'slime_block', 'honey_block', 'ladder', 'oak_door', 'scaffolding', 'quartz_block'];
const inUnit = (b: { size: number[]; center: number[] }) => b.size.every(s => s > 0) && [0, 1, 2].every(j => b.center[j] - b.size[j] / 2 >= -1e-9 && b.center[j] + b.size[j] / 2 <= 1 + 1e-9);

describe('block registry', () => {
  it('knows every course and paste block the spec lists, each with a shape and a material', () => {
    for (const n of [...COURSE, ...PASTE]) expect(blockDef(n), n).toMatchObject({ known: true, name: n });
  });

  it('Review Focus 5: an unknown block is a neutral labelled cube, never a throw', () => {
    expect(blockDef('mystery_block')).toMatchObject({ known: false, shape: 'cube', label: 'mystery block' });
    expect(boxesOf(blockDef('mystery_block'), null)).toHaveLength(1);
  });

  it('family fallbacks keep the shape of an unlisted variant', () => {
    expect(blockDef('birch_slab').shape).toBe('slab-bottom');
    expect(blockDef('spruce_door').shape).toBe('door');
    expect(blockDef('blue_carpet').shape).toBe('carpet');
  });

  it('slabs, doors and ladders read their state; every box stays inside the block', () => {
    const slab = blockDef('smooth_quartz_slab');
    expect(shapeOf(slab, { type: 'top' })).toBe('slab-top');
    expect(shapeOf(slab, { type: 'double' })).toBe('cube');
    const door = blockDef('oak_door');
    const closedE = boxesOf(door, { facing: 'east', open: false, hinge: 'left', half: 'lower' })[0];
    expect(closedE.size[0]).toBeCloseTo(3 / 16);                       // thin along x
    const openE = boxesOf(door, { facing: 'east', open: true, hinge: 'left', half: 'lower' })[0];
    expect(openE.size[2]).toBeCloseTo(3 / 16);                         // swung: thin along z
    expect(openE.center[2]).toBeLessThan(0.5);
    const openR = boxesOf(door, { facing: 'east', open: true, hinge: 'right', half: 'lower' })[0];
    expect(openR.center[2]).toBeGreaterThan(0.5);
    for (const n of [...COURSE, ...PASTE]) for (const st of [null, { facing: 'north' }, { facing: 'west', open: true, hinge: 'right' }, { type: 'top' }] as (BlockStateProps | null)[])
      for (const b of boxesOf(blockDef(n), st)) expect(inUnit(b), `${n} ${JSON.stringify(st)}`).toBe(true);
  });
});

describe('entity and layer registries', () => {
  it('rem is the figure; an unknown kind is a labelled box', () => {
    expect(entityDef('rem')).toMatchObject({ model: 'rem', known: true });
    expect(entityDef('tnt_minecart')).toMatchObject({ model: 'box', known: false, label: 'tnt minecart' });
  });

  it('an activity without a layer falls back to the generic one', () => {
    expect(layerFor('mace', {})).toBe(GENERIC_LAYER);
    expect(GENERIC_LAYER.markers(emptyTimeline())).toEqual([]);
  });

  it('common markers: the gap, the reset, the end; a truncated recording says where it ends', () => {
    const tl = timelineReducer(emptyTimeline(), syntheticRun().map(e => ({ e })));
    expect(commonMarkers(tl).map(m => [m.kind, m.t])).toEqual([['gap', tAt(40)], ['reset', tAt(52)], ['end', tAt(64)]]);
    const cut = timelineReducer(emptyTimeline(), syntheticRun().slice(0, 30).map(e => ({ e })));
    expect(commonMarkers({ ...cut, truncated: true }).at(-1)).toMatchObject({ kind: 'truncated', t: cut.lastT, label: 'recording ends here' });
  });
});

describe('own-key lookups (final review M1)', () => {
  it('names that are Object.prototype keys fall back to the unknown/generic defs', () => {
    expect(blockDef('constructor')).toMatchObject({ known: false, shape: 'cube', label: 'constructor' });
    expect(boxesOf(blockDef('oak_door'), { facing: 'constructor', open: false })).toHaveLength(1);
    expect(boxesOf(blockDef('oak_door'), { facing: 'toString', open: true, hinge: 'right' })[0].size.every(s => s > 0)).toBe(true);
    expect(boxesOf(blockDef('ladder'), { facing: 'hasOwnProperty' })[0].size.every(s => s > 0)).toBe(true);
    expect(entityDef('toString')).toMatchObject({ known: false, model: 'box', label: 'toString' });
    expect(layerFor('constructor', {})).toBe(GENERIC_LAYER);
  });
});
