import type { ActivityModule, StatValue } from '../../activity';
import type { EndReason } from '../../model';
import { scoreAt } from '../../frame';
import { DEATH_CAUSE_WORDS } from './derive';

const JPM_MIN_MS = 5000;
/** Plain words for how a run ended, never the controller's enum (Rem Live §6.2). Typed over the union: a new reason fails typecheck. */
export const END_WORDS: Record<EndReason, string> = { death: 'fell', aborted: 'stopped early', stopped: 'stopped', session_limit: 'time limit' };
const words = <T extends string>(map: Record<T, string>, k: string): string | undefined => (Object.hasOwn(map, k) ? map[k as T] : undefined);

export const PARKOUR_ACTIVITY: ActivityModule = {
  id: 'parkour',
  repeatableWorld: false,
  liveStats(tl, frame) {
    const T = frame.T, start = tl.startT ?? T, k = tl.layers.parkour;
    const elapsed = Math.max(0, Math.min(T, tl.endT ?? T) - start);
    const jumps = k.jumps.filter(j => j.t <= T).length;
    const seen = k.schematics.filter(s => s.t <= T);
    let streak = 0;
    for (let i = seen.length - 1; i >= 0 && seen[i].ok; i--) streak++;
    const stats: StatValue[] = [
      { id: 'score', label: 'Score', value: frame.score, format: 'int' },
      { id: 'time', label: 'Time in run', value: elapsed, format: 'duration' },
      { id: 'jpm', label: 'Jumps / min', value: elapsed < JPM_MIN_MS ? null : jumps / (elapsed / 60000), unit: '/min', format: 'rate' },
      { id: 'schematics', label: 'Schematics cleared', value: seen.filter(s => s.ok).length, format: 'int' },
      { id: 'streak', label: 'Clean schematic streak', value: streak, format: 'int' },
    ];
    return stats;
  },
  attempt(tl, frame) {
    const e = tl.ended && frame.T >= (tl.endT ?? Infinity) ? tl.ended : null;
    const ended = e ? ((e.death && words(DEATH_CAUSE_WORDS, e.death.cause)) || words(END_WORDS, e.reason) || e.reason.replace(/_/g, ' ')) : null;
    return { runId: tl.runId, score: frame.score, durationMs: e ? e.durationMs : null, ended };
  },
  progressAt: scoreAt,
};
