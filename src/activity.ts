// What makes an activity (parkour today; set maps, building, minigames later) — spec §3.2.
import type { FrameState } from './frame';
import type { Timeline } from './types';
import { PARKOUR_ACTIVITY } from './layers/parkour/activity';

export interface StatValue { id: string; label: string; value: number | null; unit?: string; format?: 'int' | 'duration' | 'rate' }
/** `ended`: plain words, null while running. */
export interface AttemptSummary { runId: string | null; score: number; durationMs: number | null; ended: string | null }
export interface ActivityModule {
  id: string;
  /** Two runs share a world (set maps): a spatial ghost makes sense. False for random courses (spec §3.4, D9). */
  repeatableWorld: boolean;
  liveStats(tl: Timeline, frame: FrameState): StatValue[];
  attempt(tl: Timeline, frame: FrameState): AttemptSummary;
  /** The value runs are compared by (parkour: score), at time T. */
  progressAt(tl: Timeline, T: number): number;
}
const MODULES: Readonly<Record<string, ActivityModule>> = { parkour: PARKOUR_ACTIVITY };
export function activityFor(id: string): ActivityModule | null { return Object.hasOwn(MODULES, id) ? MODULES[id] : null; }
export { PARKOUR_ACTIVITY };
