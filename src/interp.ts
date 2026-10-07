import type { Vec3T } from './model';
import { GAP_MS, RESET_BLOCKS, TICK_MS, type Sample } from './types';

export interface Pose { p: Vec3T; yaw: number; pitch: number; c: string; held: string | null; ride: string | null; g: boolean; mode: 'sample' | 'interp' | 'linear' | 'hold' }

/** The last index with `t <= T`, else -1 (binary search; `samples` is sorted by t). */
export function indexAt(samples: readonly { t: number }[], T: number): number {
  let lo = 0, hi = samples.length - 1, ans = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (samples[mid].t <= T) { ans = mid; lo = mid + 1; } else hi = mid - 1; }
  return ans;
}
/** An angle wrapped to (-π, π]. */
export function wrapAngle(a: number): number {
  const x = ((a - Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
  return Math.PI - (2 * Math.PI - x) % (2 * Math.PI);
}
/** The one definition of a reset between two consecutive samples (spec §4.2): `b` is flagged (respawn, new run) or lies
 *  further from `a` than any tick could carry her. */
export function resetBetween(a: Sample, b: Sample): boolean {
  return b.reset || Math.hypot(b.p[0] - a.p[0], b.p[1] - a.p[1], b.p[2] - a.p[2]) > RESET_BLOCKS;
}
/** Never interpolate across these (spec §4.2): a gap in the feed (dt > GAP_MS) or a reset. */
export function breaksBetween(a: Sample, b: Sample): boolean {
  return b.t - a.t > GAP_MS || resetBetween(a, b);
}
function hermite(p0: number, p1: number, m0: number, m1: number, s: number): number {
  const s2 = s * s, s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * p0 + (s3 - 2 * s2 + s) * m0 + (-2 * s3 + 3 * s2) * p1 + (s3 - s2) * m1;
}

/** Her pose at T: the sample itself, a cubic Hermite between two samples (tangents = velocity in blocks per tick × the
 *  segment's ticks), linear for a format without velocity, or HOLD at the last sample across a gap or reset and after the
 *  last sample. Never extrapolates, never invents motion (craft guide, "Spatial playback"). */
export function poseAt(samples: readonly Sample[], T: number): Pose | null {
  const i = indexAt(samples, T);
  if (i < 0) return null;
  const a = samples[i];
  const at = (mode: Pose['mode']): Pose => ({ p: [...a.p] as Vec3T, yaw: a.yaw ?? 0, pitch: a.pitch ?? 0, c: a.c, held: a.held, ride: a.ride, g: a.g, mode });
  if (a.t === T) return at('sample');
  const b = samples[i + 1];
  if (!b || breaksBetween(a, b)) return at('hold');
  const s = (T - a.t) / (b.t - a.t);
  const k = (b.t - a.t) / TICK_MS;
  const va = a.v, vb = b.v;
  const hasV = va !== null && vb !== null;
  const p = [0, 1, 2].map(j => {
    if (!hasV || (j === 1 && a.g && b.g)) return a.p[j] + (b.p[j] - a.p[j]) * s;   // grounded: y stays level
    return hermite(a.p[j], b.p[j], va[j] * k, vb[j] * k, s);
  }) as Vec3T;
  const turn = (x: number | null, y: number | null) => (x === null || y === null ? (x ?? 0) : x + wrapAngle(y - x) * s);
  return { p, yaw: turn(a.yaw, b.yaw), pitch: turn(a.pitch, b.pitch), c: s < 0.5 ? a.c : b.c, held: a.held, ride: a.ride, g: s < 0.5 ? a.g : b.g, mode: hasV ? 'interp' : 'linear' };
}
