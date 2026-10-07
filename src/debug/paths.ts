import { useMemo } from 'react';
import type { Vec3T } from '../model';
import { breaksBetween, indexAt } from '../interp';
import type { CorrectionRec, PlanRec, Sample, Timeline } from '../types';

const TRACK = 200, GHOSTS = 4, CORRECTIONS = 20;

/** The last TRACK+1 samples up to index `i`, lifted 0.05 b, and the same points split into runs at every gap and reset
 *  (spec §4.2: the sampled line is never drawn across a break; the dots stay). */
export function trackRuns(samples: readonly Sample[], i: number): { track: Vec3T[]; runs: Vec3T[][] } {
  const recent = samples.slice(Math.max(0, i - TRACK), i + 1);
  const track = recent.map(s => [s.p[0], s.p[1] + 0.05, s.p[2]] as Vec3T);
  const runs: Vec3T[][] = [];
  recent.forEach((s, n) => { if (n === 0 || breaksBetween(recent[n - 1], s)) runs.push([]); runs.at(-1)!.push(track[n]); });
  return { track, runs };
}
/** The newest plan per block among the first `n` plans, the last GHOSTS of them. */
export function ghostsOf(plans: readonly PlanRec[], n: number): PlanRec[] {
  const latest = new Map<string, PlanRec>();
  for (let j = 0; j < n; j++) latest.set(plans[j].key, plans[j]);
  return [...latest.values()].slice(-GHOSTS);
}
/** The last CORRECTIONS of the first `n` corrections, each with its predicted → server segment (null without a prediction). */
export function correctionsOf(cs: readonly CorrectionRec[], n: number): { rec: CorrectionRec; seg: [Vec3T, Vec3T] | null }[] {
  return cs.slice(Math.max(0, n - CORRECTIONS), n).map(rec => ({ rec, seg: rec.predicted ? [rec.predicted, rec.server] : null }));
}

/** The X-ray's point arrays at T, memoised on what they are made of, NOT on T: drei's Line rebuilds its geometry and
 *  disposes its material whenever `points` is a new array, and the scene re-renders every animation frame while playing.
 *  They change only when T crosses a new sample, plan or correction (or a new batch arrives). */
export function useXrayPaths(tl: Timeline, T: number) {
  const k = tl.layers.parkour;
  const i = indexAt(tl.samples, T);
  const nPlans = indexAt(k.plans, T) + 1;
  const nCorr = indexAt(k.corrections, T) + 1;
  const { track, runs } = useMemo(() => trackRuns(tl.samples, i), [tl.samples, i]);
  const ghosts = useMemo(() => ghostsOf(k.plans, nPlans), [k.plans, nPlans]);
  const corrections = useMemo(() => correctionsOf(k.corrections, nCorr), [k.corrections, nCorr]);
  return { track, runs, ghosts, corrections };
}
