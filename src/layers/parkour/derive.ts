import type { PlanHow, Vec3T } from '../../model';
import { commonMarkers, type LayerNames, type TimelineMarker } from '../../registry/layers';
import type { JumpRec, PasteRec, PlanRec, Timeline } from '../../types';

/** The paste's move kind for the title card (Plan 8 ambiguity 9), from its own route and cells, in routes/AUDIT.md's terms. */
export function moveKindOf(p: PasteRec): 'Door climb' | 'Scaffold climb' | 'Ladder jump' | 'Bounce' | 'Land' {
  const kinds = new Set(p.route?.waypoints.map(w => w.kind) ?? []);
  const names = new Set(p.cells.map(c => c.name));
  if (kinds.has('toggle')) return 'Door climb';
  if (names.has('scaffolding')) return 'Scaffold climb';
  if (names.has('ladder')) return 'Ladder jump';
  if (kinds.has('bounce') || names.has('slime_block')) return 'Bounce';
  return 'Land';
}
export function pasteMarkers(tl: Timeline, names?: LayerNames): TimelineMarker[] {
  return tl.layers.parkour.pastes.map(p => ({ t: p.t, kind: 'paste' as const, label: `${p.drifted ? moveKindOf(p) : (names?.schematicLabel(p.id)?.name ?? moveKindOf(p))} · ${p.id}` }));
}

/** A plan slower than this is marked on the timeline (spec §4.6). */
export const SLOW_PLAN_MS = 500;
export interface ThinkingRow { seq: number; t: number; key: string | null; requestTick: number | null; readyTick: number | null; how: PlanHow | null;
  takeoffTick: number | null; landTick: number | null; waitTicks: number | null; plannerMs: number | null; margin: number | null; late: boolean; slow: boolean }
/** ≥ 0.3 / 0.1-0.3 / < 0.1 / unknown (spec §4.5). */
export type MarginBand = 'green' | 'amber' | 'red' | 'none';

/** The block under her landing: floor(x), floor(y − 0.25), floor(z) (a slab top at .5 stays on the slab's block). */
export function targetKey(a: Vec3T | null): string | null {
  return a ? `${Math.floor(a[0])},${Math.floor(a[1] - 0.25)},${Math.floor(a[2])}` : null;
}
/** The plan `key`'s jump was taken on, among those already out at `t`: the newest one whose `how` is not 'correct' or
 *  'rescue'. A rescued in-flight correction re-emits a plan for the same key mid-air (requestTick = readyTick = that
 *  tick); that re-plan is not what she took off on, so it never decides the row (or every rescued jump would read late
 *  with a zero-width bar). Only when every plan for the key is a correction is the newest of them used. Else null. */
export function planFor(tl: Timeline, key: string, t: number): PlanRec | null {
  const ps = tl.layers.parkour.plans;
  let fallback: PlanRec | null = null;
  for (let i = ps.length - 1; i >= 0; i--) {
    const p = ps[i];
    if (p.key !== key || p.t > t) continue;
    if (p.how !== 'correct' && p.how !== 'rescue') return p;
    fallback ??= p;
  }
  return fallback;
}
/** One row per jump (spec §4.5). Late = ready after the landing she took off from for it (Plan 8 ambiguity 7): the previous
 *  jump's landing, or a paste's exit when one cleared since (the bot emits no jump there and restarts its landing clock). */
export function thinkingRows(tl: Timeline): ThinkingRow[] {
  const exits = tl.layers.parkour.schematics.filter(s => s.ok && s.tick !== null);
  let prevJumpLand: number | null = null;
  return tl.layers.parkour.jumps.map(j => {
    let prevLand = prevJumpLand;
    // An exit counts when it is at or before this jump (and before its takeoff, when that is known).
    for (const s of exits) if (s.t <= j.t && (j.takeoffTick === null || s.tick! <= j.takeoffTick) && (prevLand === null || s.tick! > prevLand)) prevLand = s.tick;
    const key = targetKey(j.landedAt);
    const plan = key ? planFor(tl, key, j.t) : null;
    const plannerMs = j.plannerMs ?? plan?.ms ?? null;
    const readyTick = plan?.readyTick ?? null;
    const row: ThinkingRow = {
      seq: j.seq, t: j.t, key, requestTick: plan?.requestTick ?? null, readyTick, how: plan?.how ?? null,
      takeoffTick: j.takeoffTick, landTick: j.landTick, waitTicks: j.waitTicks, plannerMs, margin: j.predictedMargin ?? plan?.margin ?? null,
      late: readyTick !== null && prevLand !== null && readyTick > prevLand,
      slow: (plannerMs ?? 0) > SLOW_PLAN_MS,
    };
    prevJumpLand = j.landTick;
    return row;
  });
}
const dash = (v: string | null) => v ?? '–';
/** A landing's exact values for the landing list (spec §4.6); an unknown is a dash, never a guess. */
export function landingValues(j: JumpRec, r: ThinkingRow | undefined, planner = true): [string, string][] {
  const ms = j.plannerMs ?? r?.plannerMs ?? null;
  const all: [string, string][] = [
    ['Gap', String(j.gap)], ['Height', String(j.height)], ['Offset', String(j.offset)], ['Block', j.blockType],
    ['Margin', dash(j.predictedMargin === null ? null : `${j.predictedMargin.toFixed(3)} b`)],
    ['Entry speed', `${j.entrySpeed.toFixed(3)} b/tick`],
    ['Planner', dash(ms === null ? null : `${Math.round(ms)} ms`)],
    ['Waited', dash(j.waitTicks === null ? null : ticks(j.waitTicks))],
    ['Corrected', j.corrected ? 'yes' : 'no'],
  ];
  return planner ? all : all.filter(([k]) => k !== 'Planner' && k !== 'Waited');   // public build: no planner internals (spec §3.1)
}
export function marginBand(m: number | null): MarginBand { return m === null ? 'none' : m >= 0.3 ? 'green' : m >= 0.1 ? 'amber' : 'red'; }

/** Ticks she sneaked (held `k`, i.e. braking) from `tick` on, from the sampled controls; null when none were recorded. */
export function sneakTicksAfter(tl: Timeline, tick: number): number | null {
  const s = tl.samples.filter(x => x.tick !== null && x.tick >= tick);
  if (s.length === 0 || s.every(x => x.c === '' && x.v === null)) return null;
  const k = s.filter(x => x.c.includes('k'));
  if (k.length === 0) return 0;
  const spacing = s.length > 1 ? s[1].tick! - s[0].tick! : 2;
  return k.at(-1)!.tick! - k[0].tick! + spacing;
}

const CAUSE: Record<string, string> = {
  undershoot: 'fell short', overshoot: 'jumped past', side_miss: 'missed to the side', edge_collision: 'clipped an edge', stuck: 'stuck',
  sim_divergence: 'her model and the server disagreed', no_route: 'no route for this paste', route_no_solution: 'no jump found on the route',
  route_stuck: 'stuck on the route', route_missed: 'missed a route jump', route_fell: 'fell inside the paste',
};
const ticks = (n: number) => `${n} tick${n === 1 ? '' : 's'}`;
/** The death in plain words (spec §4.5), from run_ended.death plus the last landing's timing and her sampled controls. */
export function deathCard(tl: Timeline): string | null {
  const d = tl.ended?.death;
  if (!d) return null;
  const det = (d.detail ?? {}) as Record<string, unknown>;
  if (d.cause === 'no_solution') {
    const key = String(det.key ?? '?');
    if (typeof det.readyTick !== 'number' || typeof det.landTick !== 'number') return `no plan for ${key} at jump ${d.seq}: this recording has no planner timing (recorded before Plan 8)`;
    const after = det.readyTick - det.landTick;
    const when = after > 0 ? `${ticks(after)} after landing` : after === 0 ? 'on the landing tick' : `${ticks(-after)} before landing`;
    const asked = typeof det.requestTick === 'number' ? det.requestTick - det.landTick : null;
    const ask = asked === null ? '' : asked > 0 ? ` (asked ${ticks(asked)} after landing)` : ' (asked before landing)';
    const sneak = sneakTicksAfter(tl, det.landTick);
    return `plan for ${key} ready ${when}${ask} → ${sneak ? `sneaked ${ticks(sneak)} (braking)` : 'standing still'} → no jump possible from a standstill`;
  }
  const where = typeof det.schematic === 'string' ? ` in ${det.schematic}${typeof det.waypoint === 'number' ? ` at waypoint ${det.waypoint}` : ''}` : '';
  const door = Array.isArray(det.door) ? `; the door at ${det.door.join(',')} never opened` : '';
  return `${Object.hasOwn(CAUSE, d.cause) ? CAUSE[d.cause] : d.cause} at jump ${d.seq}${where}${door}`;
}

/** Pastes, slow plans, late plans, corrections, the death, plus the markers every activity shares; sorted by time. */
export function parkourMarkers(tl: Timeline, names?: LayerNames): TimelineMarker[] {
  const k = tl.layers.parkour;
  const out: TimelineMarker[] = [
    ...pasteMarkers(tl, names),
    ...k.plans.filter(p => p.ms > SLOW_PLAN_MS).map(p => ({ t: p.t, kind: 'slow_plan' as const, label: `slow plan: ${Math.round(p.ms)} ms for ${p.key}` })),
    ...thinkingRows(tl).filter(r => r.late).map(r => ({ t: r.t, kind: 'late_plan' as const, label: `late plan for jump ${r.seq}: ready at tick ${r.readyTick}` })),
    ...k.corrections.map(c => ({ t: c.t, kind: 'correction' as const, label: c.predicted ? `server correction ${Math.hypot(c.server[0] - c.predicted[0], c.server[1] - c.predicted[1], c.server[2] - c.predicted[2]).toFixed(2)} b` : 'server correction' })),
    ...(tl.ended?.death && tl.endT !== null ? [{ t: tl.endT, kind: 'death' as const, label: deathCard(tl) ?? tl.ended.death.cause }] : []),
    ...commonMarkers(tl),
  ];
  return out.sort((a, b) => a.t - b.t);
}

/** Public timeline markers (spec §3.1): pastes, the death by cause only, and the shared ones. No planner timings, late plans or
 *  correction distances; those are X-ray (parkourMarkers). */
export function publicParkourMarkers(tl: Timeline, names?: LayerNames): TimelineMarker[] {
  const d = tl.ended?.death;
  const out: TimelineMarker[] = [
    ...pasteMarkers(tl, names),
    ...(d && tl.endT !== null ? [{ t: tl.endT, kind: 'death' as const, label: Object.hasOwn(CAUSE, d.cause) ? CAUSE[d.cause] : d.cause.replace(/_/g, ' ') }] : []),
    ...commonMarkers(tl),
  ];
  return out.sort((a, b) => a.t - b.t);
}
