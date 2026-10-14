// src/vanilla/spectator.ts: Rem as a vanilla client draws another player (spec §4.3, A2). One sample = one client tick.
// Order inside a tick follows RemotePlayer#tick: save old (baseTick), aiStep (InterpolationHandler#interpolate and the
// head's lerpHeadRotationStep), LivingEntity#tick body-yaw target + tickHeadTurn, then calculateEntityAnimation(false).
// Pure function of the samples; cached per samples array and extended when the reducer appends.
import { breaksBetween, indexAt } from '../interp';
import type { Vec3T } from '../model';
import type { Sample } from '../types';
import { rotLerp, toVanillaPitch, toVanillaYaw, wrapDegrees } from './yaw';

export interface SpectatorPose { p: Vec3T; bodyYaw: number; headYaw: number; pitch: number; walkPos: number; walkSpeed: number; crouch: boolean; sprint: boolean; ground: boolean; held: string | null; age: number }
/** Per tick: [x,y,z, yRot, xRot, yHeadRot, yBodyRot, walkSpeed, walkSpeedOld, walkPosition] after the tick. */
const W = 10;
export interface SpectatorTrack { length: number; state(i: number): Float64Array; old(i: number): Float64Array }

interface Sim {
  s: Float64Array; xo: number; zo: number;
  steps: number; tx: number; ty: number; tz: number; tyaw: number; tpitch: number;   // InterpolationData
  headSteps: number; theadYaw: number;                                                 // lerpHeadSteps / lerpYHeadRot
  states: Float64Array; olds: Float64Array; n: number; tail: Sample | null;
}
// Keyed by the run's first Sample: timelineReducer copies the samples array every batch, but the Sample objects are shared.
const cache = new WeakMap<Sample, Sim>();
let rebuilds = 0;
/** Test hook: how many full (re)builds spectatorTrack has done. */
export const spectatorRebuilds = () => rebuilds;
const grow = (a: Float64Array, need: number) => { if (a.length >= need) return a; const b = new Float64Array(Math.max(need, a.length * 2)); b.set(a); return b; };

function step(sim: Sim, prev: Sample | null, cur: Sample) {
  const s = sim.s, i = sim.n;
  sim.olds = grow(sim.olds, (i + 1) * W); sim.olds.set(s, i * W);     // baseTick: xRotO/yHeadRotO/yBodyRotO <- current; walk speedOld is set in update
  const ty = toVanillaYaw(cur.yaw ?? 0), tp = toVanillaPitch(cur.pitch ?? 0);
  const broke = !prev || breaksBetween(prev, cur);
  if (broke) {                                                         // teleport: snapTo, interpolation cancelled, head snapped
    s[0] = cur.p[0]; s[1] = cur.p[1]; s[2] = cur.p[2]; s[3] = ty; s[4] = tp; s[5] = ty;
    if (!prev) { s[6] = ty; s[7] = 0; s[8] = 0; s[9] = 0; }
    sim.xo = s[0]; sim.zo = s[2]; sim.steps = 0; sim.headSteps = 0; sim.theadYaw = ty;
    sim.olds.set(s, i * W);                                            // never lerp across a snap
  } else {
    // InterpolationHandler#interpolateTo: restart at 3 steps only when idle or the target changed
    if (sim.steps <= 0 || sim.tyaw !== ty || sim.tpitch !== tp || sim.tx !== cur.p[0] || sim.ty !== cur.p[1] || sim.tz !== cur.p[2]) {
      sim.steps = 3; sim.tx = cur.p[0]; sim.ty = cur.p[1]; sim.tz = cur.p[2]; sim.tyaw = ty; sim.tpitch = tp;
    }
    if (prev === null || sim.theadYaw !== ty) { sim.headSteps = 3; sim.theadYaw = ty; }   // lerpHeadTo(yaw, 3): the server sends RotateHead only when the head yaw changed
    if (sim.steps > 0) {                                               // InterpolationHandler#interpolate
      const k = 1 / sim.steps;
      s[0] += (sim.tx - s[0]) * k; s[1] += (sim.ty - s[1]) * k; s[2] += (sim.tz - s[2]) * k;
      s[3] = rotLerp(k, s[3], sim.tyaw); s[4] += (sim.tpitch - s[4]) * k;
      sim.steps--;
    }
    if (sim.headSteps > 0) { s[5] = rotLerp(1 / sim.headSteps, s[5], sim.theadYaw); sim.headSteps--; }   // lerpHeadRotationStep
  }
  const dx = s[0] - sim.xo, dz = s[2] - sim.zo, d2 = dx * dx + dz * dz;
  let target = s[6];
  if (d2 > 0.0025000002) {                                             // LivingEntity#tick: note |wrap(yRot) - move|, move unwrapped
    const move = Math.atan2(dz, dx) * 180 / Math.PI - 90, off = Math.abs(wrapDegrees(s[3]) - move);
    target = 95 < off && off < 265 ? move - 180 : move;
  }
  s[6] += wrapDegrees(target - s[6]) * 0.3;                            // tickHeadTurn
  const rel = wrapDegrees(s[3] - s[6]);
  if (Math.abs(rel) > 50) s[6] += rel - Math.sign(rel) * 50;
  s[8] = s[7];                                                         // calculateEntityAnimation(false): no y; passenger -> stop()
  if (cur.ride) { s[7] = 0; s[8] = 0; s[9] = 0; } else { s[7] += (Math.min(Math.hypot(dx, dz) * 4, 1) - s[7]) * 0.4; s[9] += s[7]; }
  sim.xo = s[0]; sim.zo = s[2];
  sim.states = grow(sim.states, (i + 1) * W); sim.states.set(s, i * W);
  sim.n++; sim.tail = cur;
}

export function spectatorTrack(samples: readonly Sample[]): SpectatorTrack {
  if (samples.length === 0) return { length: 0, state: () => new Float64Array(W), old: () => new Float64Array(W) };
  let sim = cache.get(samples[0]);
  if (!sim || samples.length < sim.n || samples[sim.n - 1] !== sim.tail) {
    sim = { s: new Float64Array(W), xo: 0, zo: 0, steps: 0, tx: 0, ty: 0, tz: 0, tyaw: 0, tpitch: 0, headSteps: 0, theadYaw: 0, states: new Float64Array(W * 64), olds: new Float64Array(W * 64), n: 0, tail: null };
    cache.set(samples[0], sim);
    rebuilds++;
  }
  for (let i = sim.n; i < samples.length; i++) step(sim, i ? samples[i - 1] : null, samples[i]);
  const k = sim;
  return { length: k.n, state: i => k.states.subarray(i * W, i * W + W), old: i => k.olds.subarray(i * W, i * W + W) };
}

export function spectatorPoseAt(samples: readonly Sample[], T: number): SpectatorPose | null {
  const i = indexAt(samples, T);
  if (i < 0) return null;
  const track = spectatorTrack(samples), a = samples[i], b = samples[i + 1];
  const pt = b && !breaksBetween(a, b) ? Math.min(1, Math.max(0, (T - a.t) / (b.t - a.t))) : 0;
  const o = track.old(i), n = track.state(i), lerp = (k: number) => o[k] + (n[k] - o[k]) * pt;
  return {
    p: [lerp(0), lerp(1), lerp(2)], headYaw: rotLerp(pt, o[5], n[5]), bodyYaw: rotLerp(pt, o[6], n[6]), pitch: lerp(4),
    walkSpeed: a.ride ? 0 : Math.min(n[8] + (n[7] - n[8]) * pt, 1), walkPos: a.ride ? 0 : n[9] - n[7] * (1 - pt),   // WalkAnimationState#speed/position(pt); passenger renders 0
    crouch: a.c.includes('k'), sprint: a.c.includes('s'), ground: a.g, held: a.held, age: i + pt,
  };
}
