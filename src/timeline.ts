import type { BlockStateProps, DeathCause, EndReason, PasteCell, PasteRoute, PlanHow, Vec3T } from './model';
import { blockKey, RESET_BLOCKS, type ParkourData, type RunEndRec, type Timeline, type TimelineInput, type WorldBlock } from './types';

type Ev = Record<string, unknown> & { type: string };
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const vec = (v: unknown): Vec3T | null => (Array.isArray(v) && v.length === 3 && v.every(x => typeof x === 'number' && Number.isFinite(x)) ? [v[0], v[1], v[2]] : null);
const dist = (a: Vec3T, b: Vec3T) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const emptyParkour = (): ParkourData => ({ jumps: [], plans: [], pastes: [], corrections: [], actions: [], schematics: [] });

export function emptyTimeline(): Timeline {
  return { runId: null, activity: 'parkour', recordingVersion: null, startT: null, startedAt: null, endT: null, lastT: null, lastTick: null, lastId: null,
    truncated: false, samples: [], blockChanges: [], blocksNow: {}, scores: [], entities: {}, layers: { parkour: emptyParkour() }, ended: null, ignored: 0 };
}

/** Copy-on-write once per batch: the arrays are copied, then appended to (a batch is a recording or one frame's events). */
function draft(p: Timeline): Timeline {
  const k = p.layers.parkour;
  return { ...p, samples: [...p.samples], blockChanges: [...p.blockChanges], blocksNow: { ...p.blocksNow }, scores: [...p.scores],
    entities: Object.fromEntries(Object.entries(p.entities).map(([id, tr]) => [id, { ...tr, samples: [...tr.samples] }])),
    layers: { parkour: { jumps: [...k.jumps], plans: [...k.plans], pastes: [...k.pastes], corrections: [...k.corrections], actions: k.actions.map(a => ({ ...a })), schematics: [...k.schematics] } } };
}

/** Fold events into a Timeline (spec §4.1). Pure: `prev` is never mutated. Forward compatible: an unknown type is counted
 *  in `ignored` and skipped (Review Focus 5). `id`: the controller ring id, when known; an id already folded is skipped. */
export function timelineReducer(prev: Timeline, batch: readonly TimelineInput[]): Timeline {
  if (batch.length === 0) return prev;
  let tl = draft(prev);
  for (const { e, id } of batch) {
    if (id != null && tl.lastId !== null && id <= tl.lastId) continue;
    if (!e || typeof e !== 'object' || typeof (e as { type?: unknown }).type !== 'string') { tl.ignored++; if (id != null) tl.lastId = id; continue; }
    // One malformed recorded event must never throw out of the fold: on the live path that throw happens inside a React
    // state updater and takes the whole tab down. A throwing event is counted and skipped, and its id still advances
    // lastId so it is not retried. apply() sets lastT/lastTick before its switch, so those are put back; an array push
    // builds its record before pushing, so a throw there pushes nothing. Loops over entries guard each entry instead.
    const { lastT, lastTick } = tl;
    try { tl = apply(tl, e as Ev); } catch { tl.lastT = lastT; tl.lastTick = lastTick; tl.ignored++; }
    if (id != null) tl.lastId = id;
  }
  return tl;
}

function setBlock(tl: Timeline, t: number, key: string, block: WorldBlock | null): void {
  tl.blockChanges.push({ t, key, block });
  if (block) tl.blocksNow[key] = block; else delete tl.blocksNow[key];
}

function apply(tl: Timeline, e: Ev): Timeline {
  if (e.type === 'lock' || e.type === 'relay_error') return tl;
  if (e.type === 'run_started') {
    const runId = String(e.runId);
    if (tl.runId === runId) return tl;                                  // a re-delivered start
    if (tl.runId !== null) tl = { ...emptyTimeline(), lastId: tl.lastId };
    const t = num(e.t) ?? Date.parse(String(e.at));
    return { ...tl, runId, activity: str(e.activity) ?? 'parkour', recordingVersion: num(e.recordingVersion), startT: t, startedAt: str(e.at), lastT: t, lastTick: num(e.tick) ?? 0 };
  }
  if (e.type === 'state' || e.type === 'score') {
    // Private streams send the bot's state; the public stream (Rem Live) sends { type: 'score', runId, score }.
    const st = (e.type === 'state' ? e.state : e) as { runId?: unknown; score?: unknown } | undefined;
    if (tl.runId !== null && st?.runId === tl.runId && typeof st.score === 'number') tl.scores.push({ t: num(e.t) ?? tl.lastT ?? 0, score: st.score });
    return tl;
  }
  if (tl.runId === null || e.runId !== tl.runId) return tl;
  const t = Math.max(num(e.t) ?? tl.lastT ?? 0, tl.lastT ?? Number.NEGATIVE_INFINITY);
  const tick = num(e.tick);
  tl.lastT = t;
  if (tick !== null) tl.lastTick = tick;
  const k = tl.layers.parkour;
  switch (e.type) {
    case 'pos': {
      const p = vec(e.p);
      if (!p) { tl.ignored++; return tl; }
      const last = tl.samples.at(-1);
      if (last && t <= last.t) return tl;
      tl.samples.push({ t, tick, p, v: vec(e.v), yaw: num(e.yaw), pitch: num(e.pitch), c: str(e.c) ?? '', held: str(e.held), ride: str(e.ride), g: e.g === true,
        reset: !last || dist(last.p, p) > RESET_BLOCKS });
      return tl;
    }
    case 'course': {
      const seen = new Set<string>();
      for (const b of (Array.isArray(e.blocks) ? e.blocks : []) as ({ x: unknown; y: unknown; z: unknown; name: unknown; order?: unknown } | null)[]) {
        const at = b && typeof b === 'object' ? vec([b.x, b.y, b.z]) : null;
        if (!b || !at) { tl.ignored++; continue; }        // one bad entry skips only itself
        const key = blockKey(at);
        seen.add(key);
        if (tl.blocksNow[key]?.name === b.name) continue;
        setBlock(tl, t, key, { at, name: String(b.name), state: null, order: num(b.order) });
      }
      for (const key of Object.keys(tl.blocksNow)) if (!seen.has(key)) setBlock(tl, t, key, null);
      return tl;
    }
    case 'paste': {
      // A cell without a usable `at` skips only itself (counted); a route without a waypoints array is dropped (not drawn).
      const raw: unknown[] = Array.isArray(e.cells) ? e.cells : [];
      const cells = raw.flatMap(c => {
        const at = c && typeof c === 'object' ? vec((c as { at?: unknown }).at) : null;
        if (!at) { tl.ignored++; return []; }
        const cell = c as PasteCell;
        return [{ ...cell, at, name: String(cell.name) }];
      });
      const rawRoute = e.route && typeof e.route === 'object' && Array.isArray((e.route as { waypoints?: unknown }).waypoints) ? (e.route as PasteRoute) : null;
      const route = rawRoute ? { ...rawRoute, waypoints: rawRoute.waypoints.flatMap(w => {
        const at = w && typeof w === 'object' ? vec(w.at) : null;
        if (!at || typeof w.kind !== 'string') { tl.ignored++; return []; }
        return [{ ...w, at }];
      }) } : null;
      k.pastes.push({ t, tick, seq: num(e.seq) ?? 0, id: String(e.id), turns: num(e.turns) ?? 0, drifted: e.drifted === true, lime: vec(e.lime) ?? [0, 0, 0], red: vec(e.red) ?? [0, 0, 0],
        cells, route });
      for (const c of cells) {
        const key = blockKey(c.at);
        const old = tl.blocksNow[key];
        if (old && old.name === c.name && JSON.stringify(old.state) === JSON.stringify(c.state ?? null)) continue;
        setBlock(tl, t, key, { at: c.at, name: c.name, state: c.state ?? null, order: old?.order ?? null });
      }
      return tl;
    }
    case 'block': {
      const at = vec(e.at);
      if (!at) { tl.ignored++; return tl; }
      const key = blockKey(at);
      setBlock(tl, t, key, { at, name: String(e.name), state: (e.state ?? null) as BlockStateProps | null, order: tl.blocksNow[key]?.order ?? null });
      // The first open action at this cell or the other door half (same x and z, |dy| <= 1) is confirmed (Ambiguity 8).
      const a = k.actions.find(x => x.confirmedAt === null && Array.isArray(x.target) && x.target[0] === at[0] && x.target[2] === at[2] && Math.abs(x.target[1] - at[1]) <= 1);
      if (a) a.confirmedAt = t;
      return tl;
    }
    case 'action': {
      const target = vec(e.target) ?? ((e.target ?? null) as { entity: string } | null);
      k.actions.push({ t, tick, kind: String(e.kind), item: str(e.item), target, ok: typeof e.ok === 'boolean' ? e.ok : null, confirmedAt: null });
      return tl;
    }
    case 'plan':
      k.plans.push({ t, tick, key: String(e.key), margin: num(e.margin) ?? 0, ms: num(e.ms) ?? 0, path: (Array.isArray(e.path) ? e.path : []).map(vec).filter((x): x is Vec3T => x !== null),
        requestTick: num(e.requestTick), readyTick: num(e.readyTick), how: str(e.how) as PlanHow | null });
      return tl;
    case 'jump': {
      const seq = num(e.seq) ?? 0;
      if (k.jumps.some(j => j.seq === seq)) return tl;
      k.jumps.push({ seq, t, tick, gap: num(e.gap) ?? 0, height: num(e.height) ?? 0, offset: num(e.offset) ?? 0, blockType: String(e.blockType), entrySpeed: num(e.entrySpeed) ?? 0,
        predictedMargin: num(e.predictedMargin), landedAt: vec(e.landedAt), corrected: e.corrected === true, plannerMs: num(e.plannerMs),
        takeoffTick: num(e.takeoffTick), landTick: num(e.landTick), waitTicks: num(e.waitTicks) });
      return tl;
    }
    case 'calibration':
      k.corrections.push({ t, tick, seq: num(e.seq) ?? 0, predicted: vec((e.predicted as { pos?: unknown } | null)?.pos), server: vec(e.server) ?? [0, 0, 0], schematic: str(e.schematic), waypoint: num(e.waypoint) });
      return tl;
    case 'schematic': {
      const seq = num(e.seq) ?? 0, id = str(e.id);
      if (k.schematics.some(s => s.seq === seq && s.id === id)) return tl;
      k.schematics.push({ t, tick, seq, id, ok: e.ok === true, cause: str(e.cause) as DeathCause | null, waypoint: num(e.waypoint) });
      return tl;
    }
    case 'run_ended': {
      // Public streams carry the cause flat (`cause`), private ones a `death` object.
      const death = (e.death ?? (typeof e.cause === 'string' ? { cause: e.cause, seq: null, detail: null } : null)) as RunEndRec['death'];
      tl.ended = { t, score: num(e.score) ?? 0, reason: e.reason as EndReason, durationMs: num(e.durationMs) ?? 0, death };
      tl.endT = t;
      tl.scores.push({ t, score: tl.ended.score });
      return tl;
    }
    case 'ent': {
      const id = String(e.id), p = vec(e.p);
      if (!p || id === '__proto__') { tl.ignored++; return tl; }   // __proto__ would be written onto the prototype
      const tr = Object.hasOwn(tl.entities, id) ? tl.entities[id] : (tl.entities[id] = { id, kind: String(e.kind), samples: [] });
      const last = tr.samples.at(-1);
      if (last && t <= last.t) return tl;
      tr.samples.push({ t, tick, p, v: vec(e.v), yaw: num(e.yaw), pitch: null, c: '', held: null, ride: null, g: false, reset: !last || dist(last.p, p) > RESET_BLOCKS });
      return tl;
    }
    default:
      tl.ignored++;
      return tl;
  }
}
