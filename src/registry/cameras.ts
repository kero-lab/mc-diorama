import type { Vec3T } from '../model';
import type { FrameState } from '../frame';
import type { Timeline } from '../types';

export type CameraId = 'iso' | 'top' | 'side' | 'shoulder' | 'first' | 'cinematic';
export interface CameraPose { position: Vec3T; target: Vec3T; up: Vec3T; projection: 'ortho' | 'persp'; zoom: number; fov: number; hideRem: boolean; cut: boolean }
export interface CameraInput { frame: FrameState; tl: Timeline; rotation: 0 | 1 | 2 | 3; reducedMotion: boolean; viewport?: { width: number; height: number } }
export interface CameraDef { id: CameraId; label: string; projection: 'ortho' | 'persp'; pose(i: CameraInput): CameraPose }

const EYE = 1.62;
const add = (a: Vec3T, b: Vec3T): Vec3T => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: Vec3T, k: number): Vec3T => [a[0] * k, a[1] * k, a[2] * k];
const UP: Vec3T = [0, 1, 0];
const ortho = (position: Vec3T, target: Vec3T, zoom: number, up: Vec3T = UP): CameraPose => ({ position, target, up, projection: 'ortho', zoom, fov: 50, hideRem: false, cut: false });
const persp = (position: Vec3T, target: Vec3T, fov: number, hideRem = false): CameraPose => ({ position, target, up: UP, projection: 'persp', zoom: 1, fov, hideRem, cut: false });

/** mineflayer's yaw/pitch: yaw 0 looks toward −z, growing counter-clockwise seen from above; pitch > 0 looks up. */
export function lookDir(yaw: number, pitch: number): Vec3T {
  const p = Math.max(-1.5, Math.min(1.5, pitch));                    // never straight up/down: up stays defined
  return [-Math.sin(yaw) * Math.cos(p), Math.sin(p), -Math.cos(yaw) * Math.cos(p)];
}
/** What the camera looks at: her body's middle, else the middle of the course, else a fixed point. */
export function focusOf(f: FrameState): Vec3T {
  if (f.rem) return [f.rem.p[0], f.rem.p[1] + 0.9, f.rem.p[2]];
  if (f.blocks.length) {
    const s = f.blocks.reduce<Vec3T>((a, b) => add(a, b.at), [0, 0, 0]);
    return add(mul(s, 1 / f.blocks.length), [0.5, 1, 0.5]);
  }
  return [0, 64, 0];
}
const feet = (f: FrameState): Vec3T => (f.rem ? f.rem.p : add(focusOf(f), [0, -0.9, 0]));
const yawOf = (f: FrameState) => (f.rem ? f.rem.yaw : Math.atan2(-f.heading.x, -f.heading.z));

/** Keep the same useful world area visible at compact and desktop sizes; pixel zoom alone crops phones. */
export function framedZoom(viewport: CameraInput['viewport'], width: number, height: number, fallback: number): number {
  return viewport ? Math.max(1, Math.min(viewport.width / width, viewport.height / height)) : fallback;
}
const ahead = (i: CameraInput): Vec3T => add(focusOf(i.frame), [i.frame.heading.x * 1.5, 0, i.frame.heading.z * 1.5]);

export const CAMERAS: Record<CameraId, CameraDef> = {
  iso: { id: 'iso', label: 'Isometric', projection: 'ortho', pose: i => {
    const a = Math.PI / 4 + i.rotation * (Math.PI / 2), c = ahead(i);
    return ortho(add(c, [Math.cos(a) * 30, 30 * Math.SQRT1_2, Math.sin(a) * 30]), c, framedZoom(i.viewport, 14, 9, 32));
  } },
  top: { id: 'top', label: 'Top', projection: 'ortho', pose: i => {
    const c = ahead(i);
    return ortho(add(c, [0, 50, 0]), c, framedZoom(i.viewport, 13, 12, 24), [i.frame.heading.x, 0, i.frame.heading.z]);     // the course runs up the screen
  } },
  side: { id: 'side', label: 'Side', projection: 'ortho', pose: i => {
    const c = ahead(i), h = i.frame.heading;
    return ortho(add(c, mul([-h.z, 0, h.x], 40)), c, framedZoom(i.viewport, 16, 7, 36));
  } },
  shoulder: { id: 'shoulder', label: 'Shoulder', projection: 'persp', pose: i => {
    const f = feet(i.frame), d = lookDir(yawOf(i.frame), 0);
    return persp(add(add(f, [0, 2.4, 0]), mul(d, -4.5)), add(add(f, [0, 1.2, 0]), mul(d, 6)), 60);
  } },
  first: { id: 'first', label: 'First person', projection: 'persp', pose: i => {
    const eye = add(feet(i.frame), [0, EYE, 0]);
    return persp(eye, add(eye, mul(lookDir(yawOf(i.frame), i.frame.rem?.pitch ?? 0), 8)), 70, true);
  } },
  // The registry entry never cuts: only the CameraRig's director, which keeps DirectorState between frames, decides cuts.
  cinematic: { id: 'cinematic', label: 'Cinematic', projection: 'persp', pose: i => ({ ...direct(null, i).pose, cut: false }) },
};
export const CAMERA_IDS = Object.keys(CAMERAS) as CameraId[];
/** The six built-in cameras, in picker order: the Diorama default. */
export const BUILTIN_CAMERA_IDS: readonly CameraId[] = CAMERA_IDS;

export type Shot = 'follow' | 'establish' | 'landing' | 'death';
export interface DirectorState { shot: Shot; since: number }
export const MIN_SHOT_MS = 2000;

/** The rule-based director (spec §4.3): the death orbit, then a low close look at a landing with margin < 0.1 (in 0.5× slow
 *  motion), then a wide establishing shot when a paste appears, else a follow. */
function wantedShot(i: CameraInput): Shot {
  const T = i.frame.T, k = i.tl.layers.parkour;
  if (i.tl.ended?.death && i.tl.endT !== null && T >= i.tl.endT - 500) return 'death';
  if (k.jumps.some(j => j.predictedMargin !== null && j.predictedMargin < 0.1 && Math.abs(j.t - T) <= 400)) return 'landing';
  if (k.pastes.some(p => p.t <= T && T - p.t <= 2000)) return 'establish';
  return 'follow';
}
function shotPose(s: DirectorState, i: CameraInput): CameraPose {
  const c = focusOf(i.frame), h: Vec3T = [i.frame.heading.x, 0, i.frame.heading.z], side: Vec3T = [-h[2], 0, h[0]];
  switch (s.shot) {
    case 'establish': {
      const p = i.tl.layers.parkour.pastes.filter(x => x.t <= i.frame.T).at(-1);
      const mid: Vec3T = p ? add(mul(add(p.lime, p.red), 0.5), [0.5, 1, 0.5]) : c;
      return persp(add(add(add(mid, mul(side, 14)), [0, 10, 0]), mul(h, -4)), mid, 55);
    }
    case 'landing': return persp(add(add(add(c, mul(side, 3)), [0, -0.5, 0]), mul(h, -1.5)), c, 45);
    case 'death': { const a = ((i.frame.T - s.since) / 8000) * 2 * Math.PI; return persp(add(c, [Math.cos(a) * 7, 3.5, Math.sin(a) * 7]), c, 50); }
    default: return persp(add(add(add(c, mul(h, -8)), mul(side, 3)), [0, 4, 0]), add(c, mul(h, 2)), 55);
  }
}
/** Pure: the caller keeps `state` between frames. Cuts are rate-limited to one per MIN_SHOT_MS of timeline time; a seek
 *  backwards restarts. Reduced motion: no director at all, the isometric view at normal speed. */
export function direct(prev: DirectorState | null, i: CameraInput): { state: DirectorState; pose: CameraPose; timeScale: number } {
  if (i.reducedMotion) return { state: { shot: 'follow', since: i.frame.T }, pose: CAMERAS.iso.pose(i), timeScale: 1 };
  const want = wantedShot(i);
  let state = prev, cut = false;
  if (!prev || i.frame.T < prev.since || (want !== prev.shot && i.frame.T - prev.since >= MIN_SHOT_MS)) { state = { shot: want, since: i.frame.T }; cut = true; }
  return { state: state!, pose: { ...shotPose(state!, i), cut }, timeScale: state!.shot === 'landing' ? 0.5 : 1 };
}

/** Damped camera motion (spec §4.3): framing never jumps with a sample. Half-life 250 ms; reduced motion 1200 ms and no
 *  cuts (a slow pan). A projection change (the viewer picked another camera) snaps. */
export function dampPose(prev: CameraPose | null, next: CameraPose, dtMs: number, reducedMotion: boolean): CameraPose {
  if (!prev || prev.projection !== next.projection || (next.cut && !reducedMotion)) return next;
  const k = 1 - Math.pow(2, -dtMs / (reducedMotion ? 1200 : 250));
  const lerp = (a: Vec3T, b: Vec3T): Vec3T => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  const u = lerp(prev.up, next.up), ul = Math.hypot(...u);
  return { ...next, position: lerp(prev.position, next.position), target: lerp(prev.target, next.target), up: ul > 1e-6 ? mul(u, 1 / ul) : next.up,
    zoom: prev.zoom + (next.zoom - prev.zoom) * k, fov: prev.fov + (next.fov - prev.fov) * k, cut: false };
}
