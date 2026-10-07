import type { Vec3T } from './model';
import { breaksBetween, indexAt, poseAt, resetBetween, type Pose } from './interp';
import type { BlockChange, Sample, Timeline, WorldBlock } from './types';

export interface FrameState { T: number; rem: Pose | null; blocks: WorldBlock[]; blockIndex: number; sampledFrom?: Vec3T | null; heading: { x: number; z: number }; score: number; entities: { id: string; kind: string; pose: Pose | null }[]; atEnd: boolean }

interface BlocksMemo { index: number; last: BlockChange | undefined; map: Map<string, WorldBlock>; blocks: WorldBlock[] }
/** Per run, the world folded up to `index` changes. Keyed by run + the identity of the last change folded, NOT by Timeline
 *  object: live mode makes a new Timeline per batch, but the reducer copies `blockChanges` by reference, so the same run's
 *  prefix keeps its objects. A different fold of the run (a re-seed) has new objects and rebuilds. */
const memo = new Map<string | null, BlocksMemo>();
const MEMO_RUNS = 4;

/** The world at T: every block change with t <= T applied. Incremental while T moves forward. While no change happened
 *  between two calls (same T bucket, or a later batch of the same run with no block change at or before T), the SAME array
 *  is returned, so the renderer can skip rebuilding its instanced meshes. */
export function blocksAt(tl: Timeline, T: number): { index: number; blocks: WorldBlock[] } {
  const index = indexAt(tl.blockChanges, T) + 1;
  let m = memo.get(tl.runId);
  const valid = m !== undefined && m.index <= tl.blockChanges.length && tl.blockChanges[m.index - 1] === m.last;
  if (m && valid && m.index === index) return { index, blocks: m.blocks };
  if (!m || !valid || m.index > index) m = { index: 0, last: undefined, map: new Map(), blocks: [] };
  for (let i = m.index; i < index; i++) {
    const c = tl.blockChanges[i];
    if (c.block) m.map.set(c.key, c.block); else m.map.delete(c.key);
  }
  m = { index, last: tl.blockChanges[index - 1], map: m.map, blocks: [...m.map.values()] };
  memo.delete(tl.runId);
  memo.set(tl.runId, m);
  if (memo.size > MEMO_RUNS) memo.delete(memo.keys().next().value as string | null);
  return { index, blocks: m.blocks };
}

const headings = new WeakMap<readonly WorldBlock[], { x: number; z: number }>();

/** Course direction: from the lowest- to the highest-order block, on its dominant axis. +x when unknown. */
export function headingAt(blocks: readonly WorldBlock[]): { x: number; z: number } {
  const cached = headings.get(blocks);
  if (cached) return cached;
  const ordered = blocks.filter(b => b.order !== null).sort((a, b) => a.order! - b.order!);
  if (ordered.length < 2) { const heading = { x: 1, z: 0 }; headings.set(blocks, heading); return heading; }
  const dx = ordered.at(-1)!.at[0] - ordered[0].at[0], dz = ordered.at(-1)!.at[2] - ordered[0].at[2];
  const heading = Math.abs(dx) >= Math.abs(dz) ? { x: dx >= 0 ? 1 : -1, z: 0 } : { x: 0, z: dz >= 0 ? 1 : -1 };
  headings.set(blocks, heading);
  return heading;
}

export function scoreAt(tl: Timeline, T: number): number { const i = indexAt(tl.scores, T); return i < 0 ? 0 : tl.scores[i].score; }

/** Every break the model holds across (spec §4.2), for the timeline to show. `reset`: a reset, not only a gap in the feed. */
export function gapsOf(samples: readonly Sample[]): { from: number; to: number; reset: boolean }[] {
  const out: { from: number; to: number; reset: boolean }[] = [];
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1], b = samples[i];
    if (breaksBetween(a, b)) out.push({ from: a.t, to: b.t, reset: resetBetween(a, b) });
  }
  return out;
}

/** Everything the renderer and the panels read at time T (spec §4.1). */
export function stateAt(tl: Timeline, T: number): FrameState {
  const { index, blocks } = blocksAt(tl, T);
  return {
    T, rem: poseAt(tl.samples, T), sampledFrom: tl.samples[indexAt(tl.samples, T)]?.p ?? null, blocks, blockIndex: index, heading: headingAt(blocks), score: scoreAt(tl, T),
    entities: Object.values(tl.entities).map(e => ({ id: e.id, kind: e.kind, pose: poseAt(e.samples, T) })),
    atEnd: tl.endT !== null && T >= tl.endT,
  };
}

/** The last change of one block at or before T (scans back from the end: blocks change rarely). */
export function lastChangeBefore(tl: Timeline, key: string, T: number): BlockChange | null {
  for (let i = indexAt(tl.blockChanges, T); i >= 0; i--) if (tl.blockChanges[i].key === key) return tl.blockChanges[i];
  return null;
}
