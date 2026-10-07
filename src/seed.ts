import type { Recording } from './model';
import { emptyTimeline, timelineReducer } from './timeline';
import type { Timeline, TimelineInput } from './types';

export interface Buffered { e: unknown; id: number | null }
const tickOf = (e: unknown) => { const t = (e as { tick?: unknown } | null)?.tick; return typeof t === 'number' ? t : null; };

/** A recording folded into a fresh Timeline (new objects throughout); `lastId` and `truncated` come from the headers. */
export function seedTimeline(rec: Recording): Timeline {
  const tl = timelineReducer(emptyTimeline(), rec.events.map(e => ({ e })));
  return { ...tl, lastId: rec.lastId ?? tl.lastId, truncated: rec.truncated };
}

/** What to fold after a live seed (Plan 8 ambiguity 1): every buffered event the seed does not hold. By controller ring id
 *  when both sides have one (exact, even mid-tick); otherwise by tick, which drops the rest of the seed's last tick (a
 *  lossy fallback for id-less sources only). A run_started always passes: it opens a new run. */
export function mergeSeed(seed: Pick<Recording, 'events' | 'lastId'>, buffered: readonly Buffered[]): TimelineInput[] {
  const maxTick = seed.events.reduce<number>((m, e) => Math.max(m, tickOf(e) ?? -1), -1);
  return buffered.filter(b => {
    if ((b.e as { type?: unknown } | null)?.type === 'run_started' && b.id === null) return true;
    if (b.id !== null && seed.lastId !== null) return b.id > seed.lastId;
    const t = tickOf(b.e);
    return t === null || t > maxTick;
  }).map(b => ({ e: b.e, id: b.id }));
}
