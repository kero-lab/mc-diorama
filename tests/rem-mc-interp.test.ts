import { describe, expect, it } from 'vitest';
import { blocksAt, gapsOf, headingAt, scoreAt, stateAt } from '../src/frame';
import { breaksBetween, poseAt, resetBetween, wrapAngle } from '../src/interp';
import { emptyTimeline, timelineReducer } from '../src/timeline';
import type { Sample } from '../src/types';
import { loadFixture, syntheticRun, tAt } from './fixtures/rem-mc/synthetic-p8';

const s = (t: number, p: [number, number, number], over: Partial<Sample> = {}): Sample =>
  ({ t, tick: null, p, v: null, yaw: 0, pitch: 0, c: '', held: null, ride: null, g: true, reset: false, ...over });
const tl = timelineReducer(emptyTimeline(), syntheticRun().map(e => ({ e })));

describe('poseAt (spec §4.2)', () => {
  it('returns each sample exactly at its own time (endpoint fidelity), for Hermite and linear segments', () => {
    for (const x of tl.samples) expect(poseAt(tl.samples, x.t)!.p).toEqual(x.p);
    const old = timelineReducer(emptyTimeline(), loadFixture('run-a32f2420.json').map(e => ({ e })));
    for (const x of old.samples.slice(0, 50)) expect(poseAt(old.samples, x.t)!.p).toEqual(x.p);
  });

  it('is null before the first sample and holds the last one after it', () => {
    expect(poseAt(tl.samples, tl.samples[0].t - 1)).toBeNull();
    expect(poseAt(tl.samples, tl.samples.at(-1)!.t + 5000)).toMatchObject({ p: tl.samples.at(-1)!.p, mode: 'hold' });
  });

  it('uses the velocity tangents between close samples (Hermite), linear when a format has no velocity', () => {
    const a = s(0, [0, 100, 0], { v: [0.1, 0.42, 0], g: false }), b = s(100, [0.2, 100.6, 0], { v: [0.1, 0.2, 0], g: false });
    const mid = poseAt([a, b], 50)!;
    expect(mid.mode).toBe('interp');
    expect(mid.p[1]).toBeGreaterThan(100.3);                     // the arc bulges up where linear would give exactly 100.3
    const lin = poseAt([s(0, [0, 100, 0]), s(100, [0.2, 100.6, 0])], 50)!;
    expect(lin.mode).toBe('linear');
    expect(lin.p[0]).toBeCloseTo(0.1, 9);
    expect(lin.p[1]).toBeCloseTo(100.3, 9);
  });

  it('Review Focus 1: never across a gap: holds the sample before it for the whole gap', () => {
    const gap = tl.samples.findIndex(x => x.tick === 52);
    const before = tl.samples[gap - 1];
    for (const T of [before.t + 1, before.t + 300, tl.samples[gap].t - 1]) expect(poseAt(tl.samples, T)).toMatchObject({ p: before.p, mode: 'hold' });
    // A gap with velocities on both sides: still no arc invented across it.
    expect(poseAt([s(0, [0, 100, 0], { v: [0.1, 0, 0] }), s(450, [0.9, 100, 0], { v: [0.1, 0, 0] })], 200)).toMatchObject({ p: [0, 100, 0], mode: 'hold' });
  });

  it('Review Focus 1: never across a reset, even with velocities that would swing an arc between them', () => {
    const a = s(0, [0, 100, 0], { v: [3, 0, 0] }), b = s(100, [5, 100, 0], { v: [3, 0, 0] });
    expect(poseAt([a, b], 50)).toMatchObject({ p: [0, 100, 0], mode: 'hold' });
    const flagged = [s(0, [0, 100, 0]), s(100, [0.5, 100, 0], { reset: true })];
    expect(poseAt(flagged, 50)).toMatchObject({ p: [0, 100, 0], mode: 'hold' });
  });

  it('one definition of a break: a gap breaks without being a reset; a jump or a flag is both', () => {
    const a = s(0, [0, 100, 0]);
    expect([breaksBetween(a, s(401, [0.1, 100, 0])), resetBetween(a, s(401, [0.1, 100, 0]))]).toEqual([true, false]);
    expect([breaksBetween(a, s(400, [2, 100, 0])), resetBetween(a, s(400, [2, 100, 0]))]).toEqual([false, false]);   // the limits are exclusive
    expect([breaksBetween(a, s(50, [2.01, 100, 0])), resetBetween(a, s(50, [2.01, 100, 0]))]).toEqual([true, true]);
    expect([breaksBetween(a, s(50, [0, 100, 0], { reset: true })), resetBetween(a, s(50, [0, 100, 0], { reset: true }))]).toEqual([true, true]);
  });

  it('keeps a grounded segment level (no Hermite dip below the floor) and turns facing the short way round', () => {
    const a = s(0, [0, 100, 0], { v: [0.3, -0.5, 0], g: true }), b = s(100, [0.6, 100, 0], { v: [0.3, 0.4, 0], g: true });
    expect(poseAt([a, b], 50)!.p[1]).toBe(100);
    const yaw = poseAt([s(0, [0, 100, 0], { yaw: 3.1 }), s(100, [0.1, 100, 0], { yaw: -3.1 })], 50)!.yaw;
    expect(Math.abs(wrapAngle(yaw - Math.PI))).toBeLessThan(0.01);   // through π, not through 0
  });

  it('wrapAngle maps to (-π, π]', () => {
    expect(wrapAngle(Math.PI)).toBeCloseTo(Math.PI, 12);
    expect(wrapAngle(-Math.PI)).toBeCloseTo(Math.PI, 12);
    expect(wrapAngle(0)).toBe(0);
    expect(wrapAngle(3 * Math.PI / 2)).toBeCloseTo(-Math.PI / 2, 12);
    expect(wrapAngle(-5 * Math.PI / 2)).toBeCloseTo(-Math.PI / 2, 12);
  });
});

describe('stateAt and its parts', () => {
  it('reports the gap and the reset as gaps', () => {
    expect(gapsOf(tl.samples)).toEqual([{ from: tAt(40), to: tAt(52), reset: false }, { from: tAt(52), to: tAt(54), reset: true }]);
  });

  it('shows the world as it was at T: the door shut before the click, open after, and blocksAt reuses its work', () => {
    expect(blocksAt(tl, tAt(40)).blocks.find(b => b.at.join(',') === '8,99,0')!.state).toMatchObject({ open: false });
    expect(blocksAt(tl, tAt(42)).blocks.find(b => b.at.join(',') === '8,99,0')!.state).toMatchObject({ open: true });
    const a = blocksAt(tl, tAt(42)), b = blocksAt(tl, tAt(43));
    expect(b.index).toBe(a.index);
    expect(b.blocks).toBe(a.blocks);                              // same array while no change happened in between
  });

  it('Ruling 8: a later Timeline of the same run reuses the blocks until a block change lands at or before T', () => {
    const events = syntheticRun();
    const split = (from: number, to: number) => events.filter(e => (e.tick as number) >= from && (e.tick as number) <= to).map(e => ({ e }));
    const t1 = timelineReducer(emptyTimeline(), split(0, 39));
    const T = tAt(64);
    const a = blocksAt(t1, T);
    // A live batch with no block change (her position and the click at 40): a new Timeline object, the same world.
    const batch = events.filter(e => e.tick === 40 && e.type !== 'block').map(e => ({ e }));
    const t2 = timelineReducer(t1, batch);
    expect(t2).not.toBe(t1);
    expect(t2.blockChanges.length).toBe(t1.blockChanges.length);
    expect(blocksAt(t2, T).blocks).toBe(a.blocks);
    // A batch with a block change (the trapdoor at 40): a new array that holds it; the older Timeline is left as it was.
    const t3 = timelineReducer(t2, events.filter(e => e.tick === 40 && e.type === 'block').map(e => ({ e })));
    const c = blocksAt(t3, T);
    expect(c.blocks).not.toBe(a.blocks);
    expect(c.blocks.some(b => b.name === 'oak_trapdoor')).toBe(true);
    expect(a.blocks.some(b => b.name === 'oak_trapdoor')).toBe(false);
    expect(blocksAt(t1, T).blocks.some(b => b.name === 'oak_trapdoor')).toBe(false);
    // A different fold of the same run (fresh change objects) rebuilds rather than trusting the cache.
    const refold = timelineReducer(emptyTimeline(), split(0, 39));
    expect(blocksAt(refold, T).blocks).toEqual(a.blocks);
  });

  it('score, heading and the end', () => {
    expect(scoreAt(tl, tAt(30))).toBe(1);
    expect(scoreAt(tl, tAt(1))).toBe(0);
    expect(headingAt(Object.values(tl.blocksNow))).toEqual({ x: 1, z: 0 });
    expect(headingAt([])).toEqual({ x: 1, z: 0 });
    expect(stateAt(tl, tAt(64)).atEnd).toBe(true);
    expect(stateAt(tl, tAt(31))).toMatchObject({ atEnd: false, score: 1, rem: expect.objectContaining({ mode: 'interp' }) });
  });
});
