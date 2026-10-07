import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** A fixture under tests/fixtures/rem-mc (tests run from the RemHub directory, as CI does). */
export const loadFixture = (name: string): Record<string, unknown>[] =>
  JSON.parse(readFileSync(resolve(process.cwd(), 'tests/fixtures/rem-mc', name), 'utf8'));

export const SYNTH_RUN = '5e1f0000-0000-4000-8000-000000000001';
export const T0 = 1_800_000_000_000;
export const tAt = (tick: number) => T0 + tick * 50;
type E = Record<string, unknown>;
const r4 = (n: number) => Math.round(n * 1e4) / 1e4;
const door = (half: 'lower' | 'upper', open: boolean) => ({ facing: 'east', half, hinge: 'left', open, powered: false });

/**
 * A small run in the Plan 8 format, with every case the page must handle:
 * - a sprint jump onto 3,99,0 after 4 ticks of waiting;
 * - a SLOW (640 ms) and LATE (ready at 27, after the landing at 24) plan for the lime;
 * - a landing with margin 0.05;
 * - the c086c587 door paste, her click on the upper half at 40, a trapdoor 2 above it changing at 40 (must NOT confirm it),
 *   and the door opening lower half first (41, the OTHER half: confirms her click) then upper (42);
 * - a server correction;
 * - a 600 ms gap (40 → 52) and a 3-block reset (52 → 54);
 * - an unknown event type and an unknown block;
 * - a no_solution death: the reply came 3 ticks after the landing at 54, then 8 ticks of sneaking.
 */
export function syntheticRun(): E[] {
  const ev: { tick: number; e: E }[] = [];
  const add = (tick: number, e: E) => ev.push({ tick, e: { ...e, runId: SYNTH_RUN, t: tAt(tick), tick } });
  add(0, { type: 'run_started', at: new Date(tAt(0)).toISOString(), settings: { cap: 20, maxRuns: 1, maxMinutes: 15, riskWeight: 1, slider: 0.5 }, plannerVersion: 'v3', server: 'testserver', difficulty: 0.8, activity: 'parkour', recordingVersion: 1 });
  add(0, { type: 'course', blocks: [
    { x: 0, y: 99, z: 0, name: 'stone', order: 0 },
    { x: 3, y: 99, z: 0, name: 'red_wool', order: 1 },
    { x: 6, y: 99, z: 0, name: 'lime_wool', order: 2 },
    { x: 8, y: 99, z: 0, name: 'oak_door', order: 2 }, { x: 8, y: 100, z: 0, name: 'oak_door', order: 2 },
    { x: 11, y: 99, z: 0, name: 'red_wool', order: 2 },
    { x: 14, y: 99, z: 0, name: 'mystery_block', order: 3 },
  ] });
  const S: [number, number, number, boolean, string][] = [
    [2, 0.65, 100, true, 'k'], [4, 0.8, 100, true, 'k'], [6, 0.95, 100, true, 'fs'], [8, 1.1, 100, true, 'fs'], [10, 1.25, 100, true, 'fs'], [12, 1.4, 100, true, 'fsj'],
    [14, 1.6, 100.6, false, 'fs'], [16, 1.95, 101, false, 'fs'], [18, 2.3, 101.15, false, 'fs'], [20, 2.7, 101, false, 'fs'], [22, 3.1, 100.6, false, 'fs'],
    [24, 3.5, 100, true, ''], [26, 3.5, 100, true, 'k'], [28, 3.5, 100, true, 'fs'],
    [30, 4.3, 100.8, false, 'fs'], [32, 5.2, 101, false, 'fs'], [34, 6, 100.6, false, 'fs'], [36, 6.5, 100, true, ''],
    [38, 7.2, 100, true, 'f'], [40, 7.6, 100, true, ''],
    [52, 8.5, 100, true, 'f'],                      // 600 ms after the last sample: a gap
    [54, 11.5, 100, true, ''],                      // 3 b from the last sample: a reset
    [56, 11.5, 100, true, 'k'], [58, 11.5, 100, true, 'k'], [60, 11.5, 100, true, 'k'], [62, 11.5, 100, true, 'k'],
  ];
  S.forEach(([tick, x, y, g, c], i) => {
    const n = S[i + 1];
    const near = n && n[0] - tick === 2;
    add(tick, { type: 'pos', p: [x, y, 0.5], g, v: [near ? r4((n[1] - x) / 2) : 0, near ? r4((n[2] - y) / 2) : 0, 0], yaw: -1.5708, pitch: 0, c, held: null, ride: null });
  });
  const state = (tick: number, score: number) => add(tick, { type: 'state', state: { connected: true, inGame: true, activity: 'parkour', runId: SYNTH_RUN, score, lastError: null } });
  add(6, { type: 'plan', key: '3,99,0', margin: 0.32, ms: 180, path: [[1, 100.4, 0.5], [2, 100.9, 0.5], [3.5, 100, 0.5]], requestTick: 1, readyTick: 5, how: 'ground' });
  add(20, { type: 'paste', seq: 1, id: 'c086c587', turns: 0, drifted: false, lime: [6, 99, 0], red: [11, 99, 0],
    cells: [{ at: [6, 99, 0], name: 'lime_wool' }, { at: [8, 99, 0], name: 'oak_door', state: door('lower', false) }, { at: [8, 100, 0], name: 'oak_door', state: door('upper', false) }, { at: [11, 99, 0], name: 'red_wool' }],
    route: { variant: 'ara', waypoints: [{ kind: 'toggle', at: [8, 100, 0], open: true }, { kind: 'land', at: [8, 99, 0] }, { kind: 'toggle', at: [8, 100, 0], open: false }, { kind: 'land', at: [11, 99, 0] }] } });
  add(24, { type: 'jump', seq: 1, gap: 2, height: 0, offset: 0, blockType: 'red_wool', entrySpeed: 0.28, predictedMargin: 0.32, landedAt: [3.5, 100, 0.5], corrected: false, ok: true, plannerMs: 180, takeoffTick: 13, landTick: 24, waitTicks: 4 });
  state(24, 1);
  add(28, { type: 'plan', key: '6,99,0', margin: 0.05, ms: 640, path: [[4.5, 100.8, 0.5], [5.5, 101, 0.5], [6.5, 100, 0.5]], requestTick: 14, readyTick: 27, how: 'prefetch' });
  add(36, { type: 'jump', seq: 2, gap: 2, height: 0, offset: 0, blockType: 'lime_wool', entrySpeed: 0.3, predictedMargin: 0.05, landedAt: [6.5, 100, 0.5], corrected: false, ok: true, plannerMs: 640, takeoffTick: 29, landTick: 36, waitTicks: 4 });
  state(36, 2);
  add(40, { type: 'action', kind: 'use', item: null, target: [8, 100, 0], ok: null });
  add(40, { type: 'block', at: [8, 102, 0], name: 'oak_trapdoor', state: { facing: 'east', half: 'top', open: true, powered: false } });   // |dy| = 2
  add(41, { type: 'block', at: [8, 99, 0], name: 'oak_door', state: door('lower', true) });
  add(42, { type: 'block', at: [8, 100, 0], name: 'oak_door', state: door('upper', true) });
  add(44, { type: 'calibration', seq: 2, at: new Date(tAt(44)).toISOString(), predicted: { pos: [7.6, 100, 0.5] }, server: [7.7, 100, 0.5], blockType: 'lime_wool', schematic: 'c086c587', waypoint: 1 });
  add(46, { type: 'tnt_fuse', fuse: 40 });            // a future event type
  add(49, { type: 'plan', key: '6,99,0#3', margin: 0.4, ms: 90, path: [[9, 100.5, 0.5], [11.5, 100, 0.5]], requestTick: 37, readyTick: 45, how: 'prefetch' });
  add(54, { type: 'schematic', seq: 2, id: 'c086c587', turns: 0, ok: true, cause: null, waypoint: null, ticks: 18, unproven: false });
  state(54, 10);
  add(64, { type: 'run_ended', at: new Date(tAt(64)).toISOString(), score: 10, durationMs: 3200, reason: 'death',
    death: { cause: 'no_solution', seq: 3, detail: { key: '14,99,0', requestTick: 55, readyTick: 57, landTick: 54, waitTicks: 9 } }, sidebarScore: 10, unprovenRoute: false });
  return ev.sort((a, b) => a.tick - b.tick).map(x => x.e);    // stable: same-tick events keep their order
}
