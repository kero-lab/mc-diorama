import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { deathCard, landingValues, marginBand, parkourMarkers, planFor, sneakTicksAfter, targetKey, thinkingRows } from '../src/layers/parkour/derive';
import { trackRuns, useXrayPaths } from '../src/debug/paths';
import { emptyTimeline, timelineReducer } from '../src/timeline';
import { loadFixture, syntheticRun, tAt } from './fixtures/rem-mc/synthetic-p8';

const fold = (events: unknown[]) => timelineReducer(emptyTimeline(), events.map(e => ({ e })));
const synth = fold(syntheticRun());

describe('thinking strip rows (spec §4.5)', () => {
  it('pairs each jump with the plan for its block; flags the plan ready after the landing she took off from as late', () => {
    expect(thinkingRows(synth).map(r => [r.seq, r.key, r.requestTick, r.readyTick, r.takeoffTick, r.landTick, r.waitTicks, r.late, r.slow])).toEqual([
      [1, '3,99,0', 1, 5, 13, 24, 4, false, false],
      [2, '6,99,0', 14, 27, 29, 36, 4, true, true],
    ]);
  });
  it('works on an old capture: 215 of 216 jumps find their plan; no timing, nothing flagged late', () => {
    const tl = fold(loadFixture('run-6ba424b2.json'));
    const rows = thinkingRows(tl);
    expect(rows).toHaveLength(216);
    expect(rows.filter(r => r.key !== null && planFor(tl, r.key, r.t) !== null).length).toBe(215);   // Ruling 5: through planFor
    expect(rows.some(r => r.late)).toBe(false);
    expect(rows.every(r => r.requestTick === null)).toBe(true);
  });
  it('targetKey is the block under her feet, slabs included', () => {
    expect(targetKey([23.48, 137, 4.52])).toBe('23,136,4');
    expect(targetKey([5.5, 100.5, 0.5])).toBe('5,100,0');
    expect(targetKey(null)).toBeNull();
    expect(planFor(synth, '6,99,0', tAt(27))).toBeNull();          // not out yet at 27 (emitted at 28)
  });
});

describe('margins, sneaking and the death card', () => {
  it('bands margins at 0.3 and 0.1', () => {
    expect([0.5, 0.3, 0.29, 0.1, 0.09, null].map(marginBand)).toEqual(['green', 'green', 'amber', 'amber', 'red', 'none']);
  });
  it('counts the sneaking ticks after a landing from her sampled controls', () => {
    expect(sneakTicksAfter(synth, 54)).toBe(8);
    expect(sneakTicksAfter(fold(loadFixture('run-a32f2420.json')), 0)).toBeNull();   // old format: no controls recorded
  });
  it('#2075\'s death in plain words, from run_ended plus the last landing\'s timing and controls', () => {
    expect(deathCard(synth)).toBe('plan for 14,99,0 ready 3 ticks after landing (asked 1 tick after landing) → sneaked 8 ticks (braking) → no jump possible from a standstill');
  });
  it('an old recording says what it cannot know; a route death names the paste, waypoint and door', () => {
    expect(deathCard(fold(loadFixture('run-a32f2420.json')))).toBe('no plan for 332,128,0 at jump 92: this recording has no planner timing (recorded before Plan 8)');
    const routeDeath = syntheticRun().map(e => (e.type === 'run_ended' ? { ...e, death: { cause: 'route_stuck', seq: 2, detail: { schematic: 'c086c587', waypoint: 0, door: [8, 100, 0] } } } : e));
    expect(deathCard(fold(routeDeath))).toBe('stuck on the route at jump 2 in c086c587 at waypoint 0; the door at 8,100,0 never opened');
    expect(deathCard(fold(loadFixture('run-6ba424b2.json')))).toBeNull();      // a capped run has no death
  });
  it('markers: the paste, the slow and late plan, the correction, the gap, the reset, the death and the end', () => {
    const kinds = parkourMarkers(synth).map(m => m.kind);
    for (const k of ['paste', 'slow_plan', 'late_plan', 'correction', 'gap', 'reset', 'death', 'end']) expect(kinds, k).toContain(k);
    const ts = parkourMarkers(synth).map(m => m.t);
    expect(ts).toEqual([...ts].sort((a, b) => a - b));
  });
});

describe('X-ray point arrays (fix round 1: drei Line rebuilds whenever points is a new array)', () => {
  it('the sampled line breaks at the gap and the reset; the dots are all kept', () => {
    const { track, runs } = trackRuns(synth.samples, synth.samples.length - 1);
    expect(track).toHaveLength(synth.samples.length);
    expect(runs.map(r => r.length)).toEqual([20, 1, 5]);       // 2..40 | 52 (gap before, reset after) | 54..62
  });
  it('are the SAME arrays across frames while no new sample, plan or correction is crossed', () => {
    const { result, rerender } = renderHook(({ T }) => useXrayPaths(synth, T), { initialProps: { T: tAt(45) } });
    const a = result.current;
    expect(a.corrections).toHaveLength(1);
    rerender({ T: tAt(45) + 20 });                              // a later frame, still between the samples at 40 and 52
    const b = result.current;
    expect(b.track).toBe(a.track);
    expect(b.runs).toBe(a.runs);
    expect(b.ghosts).toBe(a.ghosts);
    expect(b.corrections).toBe(a.corrections);
    expect(b.corrections[0].seg).toBe(a.corrections[0].seg);
    rerender({ T: tAt(52) });                                   // crosses the sample at 52 (and the plan at 49)
    expect(result.current.track).not.toBe(a.track);
    expect(result.current.ghosts).not.toBe(a.ghosts);
    expect(result.current.corrections).toBe(a.corrections);     // no new correction: still the same
  });
});

describe('landing values (spec §4.6)', () => {
  it('landingValues lists the exact numbers of a landing, unknowns as a dash', () => {
    const j = synth.layers.parkour.jumps[1];
    expect(landingValues(j, thinkingRows(synth)[1], true)).toEqual([
      ['Gap', '2'], ['Height', '0'], ['Offset', '0'], ['Block', 'lime_wool'], ['Margin', '0.050 b'], ['Entry speed', '0.300 b/tick'],
      ['Planner', '640 ms'], ['Waited', '4 ticks'], ['Corrected', 'no'],
    ]);
    expect(landingValues({ ...j, predictedMargin: null, plannerMs: null, waitTicks: null }, undefined, true).filter(([, v]) => v === '–').map(([k]) => k)).toEqual(['Margin', 'Planner', 'Waited']);
  });
});

describe('late flag (final review I1)', () => {
  const R = 'late-run';
  const ev = (tick: number, e: Record<string, unknown>) => ({ ...e, runId: R, t: tAt(tick), tick });
  const start = ev(0, { type: 'run_started', at: new Date(tAt(0)).toISOString(), activity: 'parkour', recordingVersion: 1 });
  const plan = (tick: number, key: string, requestTick: number, readyTick: number, how: string) => ev(tick, { type: 'plan', key, margin: 0.3, ms: 100, path: [], requestTick, readyTick, how });
  const jump = (seq: number, x: number, takeoffTick: number, landTick: number) => ev(landTick, { type: 'jump', seq, gap: 2, height: 0, offset: 0, blockType: 'red_wool', entrySpeed: 0.3, predictedMargin: 0.3, landedAt: [x + 0.5, 100, 0.5], corrected: false, takeoffTick, landTick, waitTicks: 0 });
  const first = [start, plan(6, '3,99,0', 1, 5, 'ground'), jump(1, 3, 8, 12)];

  it('a rescued in-flight re-plan is not late; its bar keeps the original request → ready', () => {
    const tl = fold([...first, plan(11, '6,99,0', 9, 11, 'prefetch'), plan(16, '6,99,0', 16, 16, 'rescue'), jump(2, 6, 14, 20)]);
    expect(thinkingRows(tl)[1]).toMatchObject({ seq: 2, requestTick: 9, readyTick: 11, how: 'prefetch', late: false });
    expect(parkourMarkers(tl).some(m => m.kind === 'late_plan')).toBe(false);
    // Only a correction plan for the key: it is still used (the fallback), so the row is not blank.
    const only = fold([...first, plan(16, '6,99,0', 16, 16, 'correct'), jump(2, 6, 14, 20)]);
    expect(thinkingRows(only)[1]).toMatchObject({ requestTick: 16, readyTick: 16, how: 'correct' });
  });

  it('the first jump after a paste compares against the paste exit, not the landing onto the lime', () => {
    const paste = ev(14, { type: 'paste', seq: 2, id: 'p1', turns: 0, drifted: false, lime: [6, 99, 0], red: [18, 99, 0], cells: [], route: null });
    const exit = ev(30, { type: 'schematic', seq: 2, id: 'p1', ok: true, cause: null, waypoint: null });
    const onTime = fold([...first, paste, plan(28, '20,99,0', 26, 28, 'prefetch'), exit, jump(3, 20, 32, 38)]);
    expect(onTime.layers.parkour.schematics[0].tick).toBe(30);
    expect(thinkingRows(onTime)[1]).toMatchObject({ seq: 3, readyTick: 28, late: false });
    const late = fold([...first, paste, exit, plan(31, '20,99,0', 26, 31, 'prefetch'), jump(3, 20, 32, 38)]);
    expect(thinkingRows(late)[1]).toMatchObject({ seq: 3, readyTick: 31, late: true });
    // A FAILED schematic is not a landing she took off from.
    const failed = fold([...first, paste, { ...exit, ok: false, cause: 'route_fell' }, plan(28, '20,99,0', 26, 28, 'prefetch'), jump(3, 20, 32, 38)]);
    expect(thinkingRows(failed)[1].late).toBe(true);
  });
});

describe('own-key lookups (final review M1)', () => {
  it('a death cause named like an Object.prototype key prints as itself', () => {
    const tl = fold(syntheticRun().map(e => (e.type === 'run_ended' ? { ...e, death: { cause: 'constructor', seq: 3, detail: {} } } : e)));
    expect(deathCard(tl)).toBe('constructor at jump 3');
  });
});
