import { describe, expect, it } from 'vitest';
import { emptyTimeline, timelineReducer } from '../src/timeline';
import type { Timeline } from '../src/types';
import { loadFixture, SYNTH_RUN, syntheticRun, tAt } from './fixtures/rem-mc/synthetic-p8';

const fold = (events: unknown[], tl: Timeline = emptyTimeline()) => timelineReducer(tl, events.map(e => ({ e })));
const run6b = loadFixture('run-6ba424b2.json');
const run32 = loadFixture('run-a32f2420.json');
const runB3 = loadFixture('run-b344e6d8.json');

describe('timelineReducer on real Plan 7 captures (old format)', () => {
  it('folds capped run 6ba424b2: every jump, its pastes, the door/honey/slime blocks, the end', () => {
    const tl = fold(run6b);
    expect(tl.runId).toMatch(/^6ba424b2/);
    expect(tl.ended).toMatchObject({ reason: 'stopped', score: 250 });
    expect(tl.layers.parkour.jumps).toHaveLength(216);
    expect(tl.layers.parkour.schematics.map(s => s.id)).toEqual(expect.arrayContaining(['c086c587', '47770924']));
    const names = new Set(tl.blockChanges.flatMap(c => (c.block ? [c.block.name] : [])));
    for (const n of ['oak_door', 'honey_block', 'slime_block', 'red_wool']) expect(names.has(n), n).toBe(true);
    const posTs = run6b.filter(e => e.type === 'pos').map(e => e.t as number);
    expect(tl.samples.length).toBe(posTs.filter((t, i) => i === 0 || t > posTs[i - 1]).length);
    expect(tl.samples.every(s => s.v === null)).toBe(true);           // old format: no velocity
    expect(tl.ignored).toBe(0);
    expect(tl.startT).toBeLessThan(tl.endT!);
  });

  it('folds the death run a32f2420 with its no_solution cause and key', () => {
    const tl = fold(run32);
    expect(tl.ended!.death).toMatchObject({ cause: 'no_solution', detail: { key: '332,128,0' } });
    expect(tl.layers.parkour.jumps.at(-1)!.seq).toBe(91);
  });

  it('folds run b344e6d8 (spec §6): both door pastes, each door appearing and leaving with the course', () => {
    const tl = fold(runB3);
    expect(tl.ignored).toBe(0);
    expect(tl.ended).toMatchObject({ reason: 'stopped', score: 60, death: null });
    expect(tl.layers.parkour.jumps).toHaveLength(39);
    expect(tl.layers.parkour.schematics.filter(s => s.id === 'c086c587').map(s => [s.seq, s.ok])).toEqual([[2, true], [16, true]]);
    const doors = tl.blockChanges.filter(c => c.block?.name === 'oak_door');
    expect(doors.map(c => c.key)).toEqual(['28,138,4', '28,139,4', '76,141,1', '76,142,1']);   // two pastes, lower + upper half each
    const doorKeys = new Set(doors.map(c => c.key));
    expect(tl.blockChanges.filter(c => c.block === null && doorKeys.has(c.key))).toHaveLength(4);
    // An old-format capture: no paste/block/action events, so no click to confirm.
    expect(tl.layers.parkour.pastes).toHaveLength(0);
    expect(tl.layers.parkour.actions).toHaveLength(0);
  });

  it('folding in batches equals folding at once (a recording folds like the live stream)', () => {
    const once = fold(run6b);
    for (const size of [1, 7, 333]) {
      let tl = emptyTimeline();
      for (let i = 0; i < run6b.length; i += size) tl = fold(run6b.slice(i, i + size), tl);
      expect(tl).toEqual(once);
    }
  });

  it('never mutates the timeline it was given', () => {
    const a = fold(run32.slice(0, 50));
    const snapshot = JSON.stringify(a);
    fold(run32.slice(50), a);
    expect(JSON.stringify(a)).toBe(snapshot);
  });
});

describe('timelineReducer on the Plan 8 format (synthetic)', () => {
  const tl = fold(syntheticRun());
  const k = tl.layers.parkour;

  it('keeps plan and jump timing, the paste and its route', () => {
    expect(k.plans.find(p => p.key === '6,99,0')).toMatchObject({ requestTick: 14, readyTick: 27, how: 'prefetch', ms: 640 });
    expect(k.jumps.map(j => [j.seq, j.takeoffTick, j.landTick, j.waitTicks])).toEqual([[1, 13, 24, 4], [2, 29, 36, 4]]);
    expect(k.pastes[0]).toMatchObject({ id: 'c086c587', route: { variant: 'ara' } });
    expect(tl.samples.find(s => s.tick === 2)!.v).toEqual([0.075, 0, 0]);
  });

  it('opens the door on block events, keeps its state across later course events, and confirms her click', () => {
    expect(tl.blocksNow['8,99,0'].state).toMatchObject({ open: true, half: 'lower' });
    expect(tl.blocksNow['8,100,0'].state).toMatchObject({ open: true, half: 'upper' });
    expect(k.actions[0]).toMatchObject({ kind: 'use', ok: null, confirmedAt: tAt(41) });   // by the lower half, the OTHER half
    expect(tl.blockChanges.find(c => c.key === '8,102,0')).toMatchObject({ t: tAt(40) });     // 2 above the target: not a door half
    const atForty = fold(syntheticRun().filter(e => (e.tick as number) <= 40));
    expect(atForty.layers.parkour.actions[0].confirmedAt).toBeNull();
    const again = fold([{ type: 'course', runId: SYNTH_RUN, t: tAt(65), tick: 65, blocks: Object.values(tl.blocksNow).map(b => ({ x: b.at[0], y: b.at[1], z: b.at[2], name: b.name, order: b.order })) }], tl);
    expect(again.blocksNow['8,99,0'].state).toMatchObject({ open: true });
  });

  it('a course event without a block removes it', () => {
    const next = fold([{ type: 'course', runId: SYNTH_RUN, t: tAt(65), tick: 65, blocks: [{ x: 3, y: 99, z: 0, name: 'red_wool', order: 1 }] }], tl);
    expect(Object.keys(next.blocksNow)).toEqual(['3,99,0']);
    expect(next.blockChanges.at(-1)).toMatchObject({ t: tAt(65), block: null });
  });

  it('marks the first sample and the 3-block jump as resets, and nothing else', () => {
    expect(tl.samples.filter(s => s.reset).map(s => s.tick)).toEqual([2, 54]);
  });

  it('Review Focus 5: an unknown event type, an unknown block and garbage are counted and skipped, never thrown', () => {
    const noisy = fold([...syntheticRun(), null, 42, {}, { type: 7 }, { type: 'ent_v9', runId: SYNTH_RUN }]);
    expect(noisy.ignored).toBe(tl.ignored + 5);
    expect(tl.ignored).toBe(1);                                      // tnt_fuse
    expect({ ...noisy, ignored: 0 }).toEqual({ ...tl, ignored: 0 });
    expect(tl.blocksNow['14,99,0'].name).toBe('mystery_block');      // kept as is; the registry renders it (Task 9)
  });

  it('skips other runs, and a new run_started starts a fresh timeline', () => {
    const other = { type: 'pos', runId: 'zzz', t: tAt(70), p: [0, 0, 0], g: true };
    expect(fold([other], tl).samples).toHaveLength(tl.samples.length);
    const next = fold([{ type: 'run_started', runId: 'r2', at: new Date(tAt(80)).toISOString(), settings: {}, plannerVersion: 'v3', server: 's', difficulty: 0.8, t: tAt(80), tick: 0 }], tl);
    expect(next).toMatchObject({ runId: 'r2', samples: [], ended: null, startT: tAt(80) });
  });

  it('drops an input whose id it already folded (the live seam)', () => {
    const events = syntheticRun();
    const withIds = timelineReducer(emptyTimeline(), events.map((e, i) => ({ e, id: 100 + i })));
    const again = timelineReducer(withIds, events.map((e, i) => ({ e, id: 100 + i })));
    expect(again).toEqual(withIds);
    expect(withIds.lastId).toBe(100 + events.length - 1);
  });
});

describe('a malformed event never throws (final review I2)', () => {
  const good = syntheticRun();
  const bad = good.map(e => {
    if (e.type === 'course') return { ...e, blocks: [null, ...(e.blocks as unknown[]), { x: 'a', y: 1, z: 2, name: 'stone' }] };
    if (e.type === 'paste') return { ...e, cells: [...(e.cells as unknown[]), { name: 'stone' }, null], route: { variant: 'x' } };
    return e;
  });
  it('bad course entries and paste cells are skipped one by one and counted; the rest folds identically', () => {
    let tl!: Timeline;
    expect(() => { tl = fold(bad); }).not.toThrow();
    const ref = fold(good);
    expect(tl.ignored).toBe(ref.ignored + 4);
    expect({ ...tl, ignored: 0, layers: { parkour: { ...tl.layers.parkour, pastes: tl.layers.parkour.pastes.map(p => ({ ...p, route: null })) } } })
      .toEqual({ ...ref, ignored: 0, layers: { parkour: { ...ref.layers.parkour, pastes: ref.layers.parkour.pastes.map(p => ({ ...p, route: null })) } } });
    expect(tl.layers.parkour.pastes[0].route).toBeNull();     // a route without waypoints is dropped, not drawn
  });
  it('rejects malformed route waypoints while retaining valid ones', () => {
    const events = good.map(e => e.type !== 'paste' ? e : { ...e, route: { variant: 'x', waypoints: [
      null, { kind: 'land' }, { kind: 'land', at: [Infinity, 1, 2] }, { at: [1, 2, 3] },
      { kind: 'land', at: [1, 2, 3] },
    ] } });
    const tl = fold(events);
    expect(tl.layers.parkour.pastes[0].route?.waypoints).toEqual([{ kind: 'land', at: [1, 2, 3] }]);
    expect(tl.ignored).toBe(fold(good).ignored + 4);
  });
  it('an event that throws anyway is counted and skipped, and its id still advances lastId', () => {
    const boom = { type: 'jump', runId: SYNTH_RUN, t: tAt(30), get seq(): number { throw new Error('boom'); } };
    const inputs = good.map((e, i) => ({ e, id: i + 1 }));
    inputs.splice(20, 0, { e: boom, id: 20.5 });
    let tl!: Timeline;
    expect(() => { tl = timelineReducer(emptyTimeline(), inputs); }).not.toThrow();
    const ref = timelineReducer(emptyTimeline(), good.map((e, i) => ({ e, id: i + 1 })));
    expect(tl.ignored).toBe(ref.ignored + 1);
    expect({ ...tl, ignored: 0 }).toEqual({ ...ref, ignored: 0 });
    expect(timelineReducer(emptyTimeline(), [...inputs.slice(0, 20), { e: boom, id: 20.5 }]).lastId).toBe(20.5);
  });
  it('an entity id of __proto__ is ignored, not written onto the prototype', () => {
    const tl = fold([...good.slice(0, 2), { type: 'ent', runId: SYNTH_RUN, t: tAt(1), tick: 1, id: '__proto__', kind: 'boat', p: [1, 2, 3] }]);
    expect(Object.keys(tl.entities)).toEqual([]);
    expect(Object.getPrototypeOf(tl.entities)).toBe(Object.prototype);
    expect(tl.ignored).toBe(1);
  });
});
