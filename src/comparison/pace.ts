import type { ActivityModule } from '../activity';
import type { Timeline } from '../types';

export interface PaceIndex { progress: number[]; t: number[] }
export type Pace = { kind: 'ahead' | 'behind' | 'level'; deltaMs: number; at: number } | { kind: 'past_record'; recordEnd: number } | { kind: 'no_record' } | { kind: 'not_started' };
const LEVEL_MS = 250;

/** The first time (ms since the run's start) each progress value was reached. Progress only counts upward. */
export function paceIndex(tl: Timeline, activity: ActivityModule): PaceIndex {
  const start = tl.startT ?? 0, progress: number[] = [], t: number[] = [];
  for (const s of tl.scores) {
    const v = activity.progressAt(tl, s.t);
    if (progress.length && v <= progress[progress.length - 1]) continue;
    progress.push(v); t.push(s.t - start);
  }
  return { progress, t };
}

/** Index of the largest value <= v, or -1. */
function floorIndex(a: readonly number[], v: number): number {
  let lo = 0, hi = a.length - 1, r = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (a[m] <= v) { r = m; lo = m + 1; } else hi = m - 1; }
  return r;
}

/** Her live run against the record run, aligned by progress (score), never by time (spec §3.4). Never throws, never extrapolates.
 *  `liveIndex` is her own paceIndex(live), precomputed by a caller that renders often (PaceTrack memoises it). */
export function paceAt(live: Timeline, liveT: number, record: PaceIndex | null, activity: ActivityModule, liveIndex?: PaceIndex): Pace {
  if (!record || record.progress.length === 0) return { kind: 'no_record' };
  const mine = liveIndex ?? paceIndex(live, activity);
  const k = floorIndex(mine.t, liveT - (live.startT ?? 0));   // the last point she had reached by liveT
  const now = k < 0 ? 0 : mine.progress[k];
  if (now <= 0) return { kind: 'not_started' };
  const recordEnd = record.progress[record.progress.length - 1];
  if (now > recordEnd) return { kind: 'past_record', recordEnd };
  // Compare at the highest value both runs have reached. A record that starts above her progress has no point to compare yet.
  const ri = floorIndex(record.progress, now);
  if (ri < 0) return { kind: 'not_started' };
  const at = record.progress[ri];
  // Her side: the FIRST time she reached at least `at` (scores jump: she may have gone 0 → 150 past 100).
  const mi = mine.progress.findIndex(v => v >= at);
  if (mi < 0 || mi > k) return { kind: 'not_started' };
  const deltaMs = record.t[ri] - mine.t[mi];
  if (Math.abs(deltaMs) <= LEVEL_MS) return { kind: 'level', deltaMs: Math.abs(deltaMs), at };
  return { kind: deltaMs > 0 ? 'ahead' : 'behind', deltaMs: Math.abs(deltaMs), at };
}
