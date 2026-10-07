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

/** Her live run against the record run, aligned by progress (score), never by time (spec §3.4). */
export function paceAt(live: Timeline, liveT: number, record: PaceIndex | null, activity: ActivityModule): Pace {
  if (!record || record.progress.length === 0) return { kind: 'no_record' };
  const mine = paceIndex({ ...live, scores: live.scores.filter(s => s.t <= liveT) }, activity);
  const now = mine.progress.at(-1) ?? 0;
  if (now <= 0) return { kind: 'not_started' };
  const recordEnd = record.progress[record.progress.length - 1];
  if (now > recordEnd) return { kind: 'past_record', recordEnd };
  // Compare at the highest value both runs have reached.
  const ri = floorIndex(record.progress, now), at = record.progress[ri];
  // Her side: the FIRST time she reached at least `at` (scores jump: she may have gone 0 → 150 past 100).
  const mi = mine.progress.findIndex(v => v >= at);
  const deltaMs = record.t[ri] - mine.t[mi];
  if (Math.abs(deltaMs) <= LEVEL_MS) return { kind: 'level', deltaMs: Math.abs(deltaMs), at };
  return { kind: deltaMs > 0 ? 'ahead' : 'behind', deltaMs: Math.abs(deltaMs), at };
}
