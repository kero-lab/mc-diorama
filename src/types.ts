// The diorama's Timeline: everything the page shows, folded from the event stream by one pure reducer (spec §4.1).
import type { BlockStateProps, DeathCause, EndReason, PasteCell, PasteRoute, PlanHow, Vec3T } from './model';

/** One Minecraft tick. */
export const TICK_MS = 50;
/** Two samples further apart than this are a gap: never interpolated across. */
export const GAP_MS = 400;
/** A sample more than this many blocks from the last is a reset (respawn, teleport): never interpolated across. */
export const RESET_BLOCKS = 2;

export interface Sample { t: number; tick: number | null; p: Vec3T; v: Vec3T | null; yaw: number | null; pitch: number | null; c: string; held: string | null; ride: string | null; g: boolean; reset: boolean }
export interface WorldBlock { at: Vec3T; name: string; state: BlockStateProps | null; order: number | null }
/** `block` null = removed. */
export interface BlockChange { t: number; key: string; block: WorldBlock | null }
export interface EntityTrack { id: string; kind: string; samples: Sample[] }
export interface JumpRec { seq: number; t: number; tick: number | null; gap: number; height: number; offset: number; blockType: string; entrySpeed: number; predictedMargin: number | null; landedAt: Vec3T | null; corrected: boolean; plannerMs: number | null; takeoffTick: number | null; landTick: number | null; waitTicks: number | null }
export interface PlanRec { t: number; tick: number | null; key: string; margin: number; ms: number; path: Vec3T[]; requestTick: number | null; readyTick: number | null; how: PlanHow | null }
export interface PasteRec { t: number; tick: number | null; seq: number; id: string; turns: number; drifted: boolean; lime: Vec3T; red: Vec3T; cells: PasteCell[]; route: PasteRoute | null }
export interface CorrectionRec { t: number; tick: number | null; seq: number; predicted: Vec3T | null; server: Vec3T; schematic: string | null; waypoint: number | null }
/** `ok` stays as the event said (null today); `confirmedAt` is when a later `block` event at the target confirmed it. */
export interface ActionRec { t: number; tick: number | null; kind: string; item: string | null; target: Vec3T | { entity: string } | null; ok: boolean | null; confirmedAt: number | null }
export interface SchematicRec { t: number; tick: number | null; seq: number; id: string | null; ok: boolean; cause: DeathCause | null; waypoint: number | null }
export interface RunEndRec { t: number; score: number; reason: EndReason; durationMs: number; death: { cause: DeathCause; seq: number | null; detail: Record<string, unknown> | null } | null }
export interface ParkourData { jumps: JumpRec[]; plans: PlanRec[]; pastes: PasteRec[]; corrections: CorrectionRec[]; actions: ActionRec[]; schematics: SchematicRec[] }
export interface Timeline {
  runId: string | null; activity: string; recordingVersion: number | null; startT: number | null; startedAt: string | null;
  endT: number | null; lastT: number | null; lastTick: number | null; lastId: number | null; truncated: boolean;
  samples: Sample[]; blockChanges: BlockChange[]; blocksNow: Record<string, WorldBlock>; scores: { t: number; score: number }[];
  entities: Record<string, EntityTrack>; layers: { parkour: ParkourData }; ended: RunEndRec | null; ignored: number;
}
/** `id`: the controller ring id, when known (the live seam dedupes on it). */
export interface TimelineInput { e: unknown; id?: number | null }
export const blockKey = (a: Vec3T) => `${a[0]},${a[1]},${a[2]}`;
