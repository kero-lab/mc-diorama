import { breaksBetween, indexAt, type Pose } from '../interp';
import type { Sample } from '../types';

interface MotionTrack { phase: number[]; speed: number[] }
const tracks = new WeakMap<readonly Sample[], MotionTrack>();
// ~1.7 gait cycles/s at normal Minecraft walking speed, rising naturally with sprint speed.
// The previous 5 rad/block cadence made grounded limbs cycle roughly twice this fast.
const STRIDE_RADIANS_PER_BLOCK = 2.5;
const smooth = (x: number) => { const t = Math.max(0,Math.min(1,x)); return t*t*(3-2*t); };
const distance = (a: Sample, b: Sample) => Math.hypot(b.p[0]-a.p[0],b.p[2]-a.p[2]);

function trackOf(samples: readonly Sample[]): MotionTrack {
  const cached = tracks.get(samples); if (cached) return cached;
  const phase = samples.map(() => 0), speed = samples.map(() => 0);
  for (let i=1; i<samples.length; i++) {
    const a=samples[i-1], b=samples[i];
    if (breaksBetween(a,b)) continue; // Restart cosmetic phase at actual discontinuities.
    phase[i]=phase[i-1]+(a.g && b.g ? distance(a,b)*STRIDE_RADIANS_PER_BLOCK : 0);
  }
  for (let i=0; i<samples.length-1; i++) {
    const a=samples[i], b=samples[i+1];
    if (breaksBetween(a,b) || b.t===a.t) continue;
    speed[i]=Math.min(7,distance(a,b)*1000/(b.t-a.t));
  }
  const result={phase,speed}; tracks.set(samples,result); return result;
}

/** Cosmetic articulation is a function of recording time, never frame count or playback history.
 * Source position/yaw remain authoritative. Airborne limbs stop pedalling; landing/crouch blend locally. */
export function playerMotionAt(samples: readonly Sample[], T: number, pose: Pose, reducedMotion=false) {
  const i=indexAt(samples,T), a=samples[i], b=samples[i+1];
  if (!a) return { swing:0, air:0, crouch:0, lean:0 };
  const connected=!!b && !breaksBetween(a,b);
  const s=connected ? smooth((T-a.t)/(b.t-a.t)) : 0;
  const ground=(a.g ? 1 : 0)+(connected ? ((b.g ? 1 : 0)-(a.g ? 1 : 0))*s : 0);
  const crouch=(a.c.includes('k') ? 1 : 0)+(connected ? ((b.c.includes('k') ? 1 : 0)-(a.c.includes('k') ? 1 : 0))*s : 0);
  if (reducedMotion) return { swing:0, air:0, crouch, lean:0 };
  const track=trackOf(samples);
  const phase=track.phase[i]+(connected ? (track.phase[i+1]-track.phase[i])*s : 0);
  const speed=connected ? track.speed[i]+(track.speed[i+1]-track.speed[i])*s : 0;
  const amplitude=(pose.c.includes('s') ? .75 : .5)*Math.min(1,speed/4.3)*ground;
  const vy=a.v ? a.v[1]*20 : connected ? (b.p[1]-a.p[1])*1000/(b.t-a.t) : 0;
  return { swing:amplitude ? Math.sin(phase)*amplitude : 0, air:1-ground, crouch, lean:Math.max(-.12,Math.min(.12,vy*.025))*(1-ground) };
}
