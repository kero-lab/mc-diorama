// src/vanilla/light.ts: vanilla block lighting under full daylight (VANILLA-RENDER.md §6). With uniform sky light and
// no light sources, a vertex's brightness is its smooth-lighting AO times the face's directional shade.
import type { BlockStateProps, Vec3T } from '../model';

export type FaceName = 'north' | 'south' | 'east' | 'west' | 'up' | 'down';
type Cell = { name: string; state: BlockStateProps | null } | undefined;

/** ClientLevel#getShade (overworld, shade=true). */
export const FACE_SHADE: Record<FaceName, number> = { down: 0.5, up: 1, north: 0.8, south: 0.8, west: 0.6, east: 0.6 };
export const FACE_NORMAL: Record<FaceName, readonly [number, number, number]> = { down: [0, -1, 0], up: [0, 1, 0], north: [0, 0, -1], south: [0, 0, 1], west: [-1, 0, 0], east: [1, 0, 0] };

/** Full-cube collision shapes. BlockBehaviour#getShadeBrightness: isCollisionShapeFullBlock ? 0.2F : 1.0F;
 *  TransparentBlock (glass family) overrides to 1.0F. Slime has a full collision box and no override; honey's box is 15/16. */
const FULL_COLLISION = new Set(['red_wool', 'lime_wool', 'red_terracotta', 'red_concrete', 'packed_ice', 'quartz_block', 'smooth_quartz', 'stone', 'slime_block']);
export function shadeBrightness(b: Cell): number {
  if (!b) return 1;
  if (b.name === 'smooth_quartz_slab') return b.state?.type === 'double' ? 0.2 : 1;
  return FULL_COLLISION.has(b.name) ? 0.2 : 1;
}

/** Opaque full cubes (canOcclude): hide any touching face. HalfTransparentBlock#skipRendering: same block only. */
const OPAQUE = new Set(['red_wool', 'lime_wool', 'red_terracotta', 'red_concrete', 'packed_ice', 'quartz_block', 'smooth_quartz', 'stone']);
const SELF_HIDING = new Set(['red_stained_glass', 'slime_block', 'honey_block']);
/** Is `self`'s face `face` hidden by `neighbour`, the block on that side? */
export function hidesFace(face: FaceName, self: string, neighbour: Cell): boolean {
  if (!neighbour) return false;
  if (OPAQUE.has(neighbour.name)) return true;
  if (SELF_HIDING.has(self) && neighbour.name === self) return true;
  if (neighbour.name === 'smooth_quartz_slab') {
    const t = neighbour.state?.type ?? 'bottom';
    return t === 'double' || (t === 'bottom' && face === 'up') || (t === 'top' && face === 'down');
  }
  return false;
}

/** AmbientOcclusionRenderStorage#calculate: (side0 + side1 + corner + centre) / 4. `blocked` is vanilla's test that both
 *  sides are walled in; it then uses `copy` (the shade of the face's first adjacency cell) instead of the diagonal.
 *  Without `blocked`/`copy` this falls back to the shade approximation (both sides occluding, copy sideA). */
export function aoVertex(sideA: number, sideB: number, corner: number, centre: number, blocked: boolean = sideA < 1 && sideB < 1, copy: number = sideA): number {
  return (sideA + sideB + (blocked ? copy : corner) + centre) / 4;
}

const AXES: Record<FaceName, [0 | 1 | 2, 0 | 1 | 2]> = { up: [0, 2], down: [0, 2], north: [0, 1], south: [0, 1], east: [2, 1], west: [2, 1] };
/** AdjacencyInfo.corners[0] per face, as [axis (0=u, 1=v), sign]: up E, down W, north UP, south W, west UP, east DOWN.
 *  Vanilla copies THIS cell's shade for every vertex whose two sides are walled in, even when it is not one of that
 *  vertex's own sides. */
const COPY_SIDE: Record<FaceName, [0 | 1, 1 | -1]> = { up: [0, 1], down: [0, -1], north: [1, 1], south: [0, -1], west: [1, 1], east: [1, -1] };
export interface FaceAO { uAxis: 0 | 1 | 2; vAxis: 0 | 1 | 2; c: [number, number, number, number] }

/** The four corner values of one face of the block at `at`. `onBoundary`: the quad lies on the block's face plane, so
 *  vanilla samples the layer in front of it (faceCubic); otherwise the block's own layer.
 *  `blocksAt` is vanilla's `isViewBlocking && lightBlock > 0` for the cell one further out along the normal; a side
 *  counts as walled in only when that outer cell blocks. Slime, double slabs and the opaque cubes block; honey, glass
 *  and bottom/top slabs are clear. For this block set that equals `shadeAt(...) < 1`, which is the default. */
export function faceCornerAO(at: Vec3T, face: FaceName, onBoundary: boolean, shadeAt: (x: number, y: number, z: number) => number, blocksAt: (x: number, y: number, z: number) => boolean = (x, y, z) => shadeAt(x, y, z) < 1): FaceAO {
  const [uAxis, vAxis] = AXES[face], n = FACE_NORMAL[face];
  const layer: Vec3T = onBoundary ? [at[0] + n[0], at[1] + n[1], at[2] + n[2]] : [at[0], at[1], at[2]];
  const cell = (du: number, dv: number, out: number): Vec3T => { const p: Vec3T = [...layer]; p[uAxis] += du; p[vAxis] += dv; for (let i = 0; i < 3; i++) p[i] += n[i] * out; return p; };
  const s = (du: number, dv: number) => shadeAt(...cell(du, dv, 0));
  const walled = (du: number, dv: number) => blocksAt(...cell(du, dv, 1));
  const centre = s(0, 0);
  const [ax, sg] = COPY_SIDE[face];
  const copy = ax === 0 ? s(sg, 0) : s(0, sg);
  const corner = (su: number, sv: number) => aoVertex(s(su, 0), s(0, sv), s(su, sv), centre, walled(su, 0) && walled(0, sv), copy);
  return { uAxis, vAxis, c: [corner(-1, -1), corner(1, -1), corner(-1, 1), corner(1, 1)] };
}

/** Vanilla blends partial faces bilinearly by the vertex's position on the face. `local` is block-relative 0..1. */
export function aoAt(ao: FaceAO, local: readonly [number, number, number]): number {
  const s = local[ao.uAxis], t = local[ao.vAxis];
  return (1 - s) * (1 - t) * ao.c[0] + s * (1 - t) * ao.c[1] + (1 - s) * t * ao.c[2] + s * t * ao.c[3];
}
