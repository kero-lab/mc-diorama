import type { Timeline } from './types';

export const LIVE_DELAY_MS = 300;
/** Beyond this distance from the live target, jump straight to it (back from a hidden tab, a reconnect). */
export const LIVE_SNAP_MS = 1500;
/** How fast live time is pulled toward the target (ms of error removed per ms of wall time, capped at 1). */
const LIVE_PULL = 1 / 500;
export const SPEEDS = [0.25, 0.5, 1, 2, 4] as const;
export interface Playback { T: number; playing: boolean; speed: number; live: boolean }

/** `windowMs` (a number) limits rewind to the last windowMs before the end; null/undefined = the whole run. */
export function bounds(tl: Timeline, windowMs?: number | null): { start: number; end: number } | null {
  let start = tl.startT ?? tl.samples[0]?.t ?? null;
  const end = tl.endT ?? tl.samples.at(-1)?.t ?? tl.lastT;
  if (start === null || end === null) return null;
  const e = Math.max(start, end);
  if (typeof windowMs === 'number') start = Math.max(start, e - windowMs);
  return { start, end: e };
}
/** Where live time heads: head − 300 ms while the run is open. Once it has ended there is nothing more to wait for, so
 *  the clock plays on to the end itself (Ruling 27): `atEnd` turns true and the run-end card shows for live viewers too. */
const liveTarget = (tl: Timeline, windowMs?: number | null) => {
  const head = tl.samples.at(-1)?.t;
  if (tl.ended && tl.endT !== null) return { head: Math.max(tl.endT, head ?? tl.endT), target: tl.endT };
  return head === undefined ? null : { head, target: Math.max(bounds(tl, windowMs)!.start, head - LIVE_DELAY_MS) };
};
export function initialPlayback(tl: Timeline, live: boolean, windowMs?: number | null): Playback {
  const b = bounds(tl, windowMs);
  return { T: live ? (liveTarget(tl, windowMs)?.target ?? b?.start ?? 0) : (b?.start ?? 0), playing: live, speed: 1, live };
}

/** One frame. Live: T advances with the wall clock and is pulled gently toward head − 300 ms (snapshot interpolation),
 *  never backwards, never past the newest sample; once the run has ended, toward its end. Replay: T advances by dt × speed × timeScale and stops at the end. */
export function step(pb: Playback, tl: Timeline, dtMs: number, timeScale = 1, windowMs?: number | null): Playback {
  if (pb.live) {
    const lt = liveTarget(tl, windowMs);
    if (!lt) return pb;
    let T = pb.T + dtMs;
    const err = lt.target - T;
    T = Math.abs(err) > LIVE_SNAP_MS ? lt.target : Math.max(pb.T, T + err * Math.min(1, dtMs * LIVE_PULL));
    T = Math.min(T, lt.head);
    // Held at the end or at the head: the SAME object, so React bails out and nothing re-renders per frame.
    return T === pb.T && pb.playing ? pb : { ...pb, T, playing: true };
  }
  const b = bounds(tl, windowMs);
  // The window floor keeps moving as events arrive: a paused viewer stays put until T falls below it, then sits on the floor.
  if (!pb.playing) return b && typeof windowMs === 'number' && pb.T < b.start ? { ...pb, T: b.start } : pb;
  if (!b) return pb;
  const T = Math.min(b.end, (typeof windowMs === 'number' ? Math.max(b.start, pb.T) : pb.T) + dtMs * pb.speed * timeScale);
  const playing = T < b.end;
  return T === pb.T && playing === pb.playing ? pb : { ...pb, T, playing };
}
/** Jump to T, clamped to the run; leaves live. */
export function seek(pb: Playback, tl: Timeline, T: number, windowMs?: number | null): Playback {
  const b = bounds(tl, windowMs);
  return { ...pb, live: false, T: b ? Math.min(b.end, Math.max(b.start, T)) : T };
}
export function goLive(pb: Playback, tl: Timeline, windowMs?: number | null): Playback {
  const lt = liveTarget(tl, windowMs);
  return { ...pb, live: true, playing: true, T: lt?.target ?? pb.T };
}
