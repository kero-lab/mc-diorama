// Shared shapes, copied from RemHub's lib/rem-mc/types.ts (2026-10-07). Structural types: RemHub's own copies stay
// assignable. Change both together, or move RemHub onto these.
export type Vec3T = [number, number, number];
export type EndReason = 'death' | 'aborted' | 'stopped' | 'session_limit';
export type DeathCause = 'undershoot' | 'overshoot' | 'side_miss' | 'edge_collision' | 'sim_divergence' | 'stuck' | 'no_solution'
  | 'no_route' | 'route_no_solution' | 'route_stuck' | 'route_missed' | 'route_fell';
/** How a plan came to be: planned ahead from a predicted landing, planned from her real state on the ground, or a rescued
 *  in-flight correction (same inputs replayed = correct; re-planned = rescue). */
export type PlanHow = 'prefetch' | 'ground' | 'correct' | 'rescue';
export type BlockStateProps = Record<string, string | boolean | number>;
export interface PasteCell { at: Vec3T; name: string; state?: BlockStateProps }
export interface PasteRoute { variant: string; waypoints: { kind: string; at: Vec3T; open?: boolean }[] }
/** A recording as the page receives it: the events plus what the headers said. */
export interface Recording { events: unknown[]; truncated: boolean; version: number | null; lastId: number | null; runId: string | null }
