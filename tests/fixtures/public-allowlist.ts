// A copy of PUBLIC_FIELDS in remlab apps/rem-mc/src/controller/public-live.ts (Rem Live 11b-2 A1). When the controller's
// allowlist changes, change this copy too: this is how the package proves it folds what KeroHub actually receives.
export const PUBLIC_FIELDS: Record<string, readonly string[]> = {
  score: ['type', 'runId', 'score'],
  run_started: ['type', 'runId', 'at', 'difficulty'],
  course: ['type', 'runId', 'blocks'],
  pos: ['type', 'runId', 't', 'p', 'g', 'v', 'yaw', 'pitch', 'c', 'held'],
  jump: ['type', 'runId', 'seq', 'blockType', 'ok', 'landedAt'],
  schematic: ['type', 'runId', 'seq', 'id', 'ok'],
  paste: ['type', 'runId', 'seq', 'id', 'turns', 'lime', 'red', 'cells'],
  block: ['type', 'runId', 'at', 'name', 'state'],
  action: ['type', 'runId', 'kind', 'target', 'ok'],
  run_ended: ['type', 'runId', 'at', 'score', 'durationMs', 'reason', 'cause'],
  show: ['type', 'show'],
  show_moment: ['type', 'showId', 'moment'],
  show_line: ['type', 'showId', 'text'],
};
type E = Record<string, unknown> & { type: string };
/** The controller's projectPublic for one run: state → score, death → cause, everything else picked by the allowlist. */
export function toPublic(events: readonly unknown[], runId: string): E[] {
  const out: E[] = [];
  for (const raw of events) {
    const e = raw as E;
    if (e.type === 'state') { const st = e.state as { runId?: string; score?: number }; if (st?.runId === runId) out.push({ type: 'score', runId, score: st.score }); continue; }
    if (e.runId !== runId || !Object.hasOwn(PUBLIC_FIELDS, e.type)) continue;
    const src = e.type === 'run_ended' ? { ...e, cause: (e.death as { cause?: string } | null)?.cause ?? null } : e;
    const o: E = { type: e.type };
    for (const k of PUBLIC_FIELDS[e.type]) if (k !== 'type' && (src as E)[k] !== undefined) o[k] = (src as E)[k];
    out.push(o);
  }
  return out;
}
