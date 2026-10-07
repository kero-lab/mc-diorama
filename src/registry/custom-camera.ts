import type { Vec3T } from '../model';
import type { CameraInput, CameraPose } from './cameras';
import { focusOf, lookDir } from './cameras';

export interface CustomCameraParams {
  anchor: 'rem' | 'world' | 'next_jump'; yaw: number; pitch: number; distance: number; height: number; fov: number;
  smoothing: number; lookAhead: number; lockRoll: boolean; projection: 'persp' | 'ortho'; world?: Vec3T;
}
export const DEFAULT_CUSTOM: CustomCameraParams = {
  anchor: 'rem', yaw: Math.PI / 4, pitch: 0.35, distance: 9, height: 1.5, fov: 60, smoothing: 250, lookAhead: 2, lockRoll: true, projection: 'persp',
};
export const CUSTOM_LIMITS = { pitch: [-1.5, 1.5], distance: [2, 80], height: [-10, 40], fov: [20, 110], smoothing: [0, 3000], lookAhead: [0, 20] } as const;
const num = (v: unknown, d: number, [lo, hi]: readonly [number, number] = [-Infinity, Infinity]) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;
const vec = (v: unknown): Vec3T | undefined => Array.isArray(v) && v.length === 3 && v.every(x => typeof x === 'number' && Number.isFinite(x)) ? [v[0], v[1], v[2]] : undefined;

/** A stored preset may be stale or edited by hand: every field is clamped or defaulted (Review Focus 4). */
export function sanitizeCustom(v: unknown): CustomCameraParams {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const d = DEFAULT_CUSTOM;
  return {
    anchor: o.anchor === 'world' || o.anchor === 'next_jump' ? o.anchor : 'rem',
    yaw: num(o.yaw, d.yaw), pitch: num(o.pitch, d.pitch, CUSTOM_LIMITS.pitch), distance: num(o.distance, d.distance, CUSTOM_LIMITS.distance),
    height: num(o.height, d.height, CUSTOM_LIMITS.height), fov: num(o.fov, d.fov, CUSTOM_LIMITS.fov), smoothing: num(o.smoothing, d.smoothing, CUSTOM_LIMITS.smoothing),
    lookAhead: num(o.lookAhead, d.lookAhead, CUSTOM_LIMITS.lookAhead), lockRoll: typeof o.lockRoll === 'boolean' ? o.lockRoll : d.lockRoll,
    projection: o.projection === 'ortho' ? 'ortho' : 'persp', ...(vec(o.world) ? { world: vec(o.world) } : {}),
  };
}

const add = (a: Vec3T, b: Vec3T): Vec3T => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: Vec3T, k: number): Vec3T => [a[0] * k, a[1] * k, a[2] * k];

/** The anchor point the camera orbits. `next_jump`: the newest course block ahead of her, else her. */
function anchorOf(i: CameraInput, p: CustomCameraParams): Vec3T {
  if (p.anchor === 'world') return p.world ?? focusOf(i.frame);
  const f = focusOf(i.frame);
  if (p.anchor === 'next_jump') {
    const ahead = i.frame.blocks.filter(b => b.order !== null).sort((a, b) => b.order! - a.order!)[0];
    return ahead ? add(ahead.at, [0.5, 1, 0.5]) : f;
  }
  return f;
}

export function customPose(i: CameraInput, raw: CustomCameraParams): CameraPose {
  const p = sanitizeCustom(raw);
  const focus = anchorOf(i, p);
  const target = add(focus, mul([i.frame.heading.x, 0, i.frame.heading.z], p.lookAhead));
  // World-anchored: the camera itself stays fixed at `world` (or her middle) + the orbit offset, independent of her.
  const center = p.anchor === 'world' ? (p.world ?? focus) : focus;
  const position = add(add(center, mul(lookDir(p.yaw, p.pitch), -p.distance)), [0, p.height, 0]);
  return { position, target, up: [0, 1, 0], projection: p.projection, zoom: p.projection === 'ortho' ? Math.max(4, 120 / p.distance) : 1,
    fov: p.fov, hideRem: false, cut: false };
}

const ORBIT_RAD_PER_PX = 0.01, ZOOM_STEP = 1.15;
/** One camera gesture: drag pixels → yaw/pitch, wheel or key steps → distance. Always returns sanitised params. */
export function orbit(p: CustomCameraParams, d: { dx?: number; dy?: number; zoomSteps?: number }): CustomCameraParams {
  const fin = (n: number | undefined) => (typeof n === 'number' && Number.isFinite(n) ? n : 0);
  return sanitizeCustom({ ...p, yaw: p.yaw + fin(d.dx) * ORBIT_RAD_PER_PX, pitch: p.pitch + fin(d.dy) * ORBIT_RAD_PER_PX, distance: p.distance * ZOOM_STEP ** fin(d.zoomSteps) });
}
