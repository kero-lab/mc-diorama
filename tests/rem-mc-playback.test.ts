import { describe, expect, it } from 'vitest';
import { stateAt } from '../src/frame';
import { bounds, goLive, initialPlayback, LIVE_DELAY_MS, seek, step } from '../src/playback';
import type { Timeline } from '../src/types';
import { emptyTimeline, timelineReducer } from '../src/timeline';
import { syntheticRun, tAt } from './fixtures/rem-mc/synthetic-p8';

const full = timelineReducer(emptyTimeline(), syntheticRun().map(e => ({ e })));
/** The same run while it is still open (no run_ended yet). */
const open = timelineReducer(emptyTimeline(), syntheticRun().filter(e => e.type !== 'run_ended').map(e => ({ e })));

describe('playback clock', () => {
  it('replay plays from the start at the chosen speed and stops at the end', () => {
    let pb = { ...initialPlayback(full, false), playing: true, speed: 2 };
    expect(pb.T).toBe(bounds(full)!.start);
    pb = step(pb, full, 100);
    expect(pb.T).toBe(tAt(0) + 200);
    for (let i = 0; i < 100; i++) pb = step(pb, full, 100);
    expect(pb).toMatchObject({ T: bounds(full)!.end, playing: false });
  });

  it('live mode with a 10 Hz feed advances smoothly, never backwards, ~300 ms behind the newest sample, never past it', () => {
    const events = syntheticRun();
    let tl = emptyTimeline();
    let pb = initialPlayback(tl, true);
    let fed = 0, lastT = -Infinity;
    for (let now = tAt(0); now <= tAt(38); now += 16) {           // frames at ~60 Hz; events arrive at their own times
      const due = events.filter((e, i) => i >= fed && (e.t as number) <= now);
      if (due.length) { tl = timelineReducer(tl, due.map(e => ({ e }))); fed += due.length; }
      pb = step(pb, tl, 16);
      if (tl.samples.length === 0) continue;
      const head = tl.samples.at(-1)!.t;
      expect(pb.T).toBeGreaterThanOrEqual(lastT);
      expect(pb.T).toBeLessThanOrEqual(head);
      if (lastT > -Infinity) expect(pb.T - lastT).toBeLessThanOrEqual(32);
      if (now > tAt(20)) expect(Math.abs(head - LIVE_DELAY_MS - pb.T)).toBeLessThan(200);
      lastT = pb.T;
    }
  });

  it('seeking leaves live and clamps; goLive returns to the head (of an open run)', () => {
    let pb = initialPlayback(open, true);
    pb = seek(pb, open, -5);
    expect(pb).toMatchObject({ live: false, T: bounds(open)!.start });
    pb = goLive(pb, open);
    expect(pb.live).toBe(true);
    expect(pb.T).toBe(open.samples.at(-1)!.t - LIVE_DELAY_MS);
  });

  it('a slow-motion time scale halves the advance', () => {
    const pb = { ...initialPlayback(full, false), playing: true };
    expect(step(pb, full, 100, 0.5).T - pb.T).toBe(50);
  });
});

describe('playback clock: a live run that ended (Ruling 27)', () => {
  it('targets the end, not head − 300 ms, so the run-end card shows for live viewers', () => {
    expect(full.ended).not.toBeNull();
    expect(initialPlayback(full, true).T).toBe(full.endT);                     // joining after the end: at the end
    let pb = { ...initialPlayback(full, true), T: full.endT! - 1000 };
    let last = pb.T;
    for (let i = 0; i < 200; i++) { pb = step(pb, full, 16); expect(pb.T).toBeGreaterThanOrEqual(last); last = pb.T; }
    expect(pb.T).toBe(full.endT);
    expect(stateAt(full, pb.T).atEnd).toBe(true);
    expect(goLive(seek(pb, full, tAt(10)), full).T).toBe(full.endT);
  });
  it('an open run still sits 300 ms behind the newest sample', () => {
    expect(open.ended).toBeNull();
    expect(initialPlayback(open, true).T).toBe(open.samples.at(-1)!.t - LIVE_DELAY_MS);
  });
});

describe('playback clock: nothing changes, nothing new (fix round 1)', () => {
  it('an ended live run held at its end returns the same object', () => {
    let pb = initialPlayback(full, true);
    pb = step(pb, full, 16);
    expect(pb.T).toBe(full.endT);
    expect(step(pb, full, 16)).toBe(pb);
  });
  it('an open live run at its newest sample with no new samples returns the same object', () => {
    let pb = { ...initialPlayback(open, true), T: open.samples.at(-1)!.t };
    pb = step(pb, open, 16);
    expect(pb.T).toBe(open.samples.at(-1)!.t);
    expect(step(pb, open, 16)).toBe(pb);
  });
  it('a replay stopped at its end, or paused, returns the same object', () => {
    let pb = { ...initialPlayback(full, false), playing: true };
    for (let i = 0; i < 100; i++) pb = step(pb, full, 100);
    expect(pb).toMatchObject({ T: bounds(full)!.end, playing: false });
    expect(step(pb, full, 100)).toBe(pb);
    const atEndPlaying = { ...pb, playing: true };
    const stopped = step(atEndPlaying, full, 100);
    expect(stopped).not.toBe(atEndPlaying);
    expect(stopped.playing).toBe(false);
  });
});

describe('shared render-frame continuity', () => {
  it('keeps stable world and heading identities between animation frames', () => {
    const a = stateAt(full, tAt(25)), b = stateAt(full, tAt(25) + 16);
    expect(b.blocks).toBe(a.blocks);
    expect(b.heading).toBe(a.heading);
  });
  it('keeps the interpolation origin on the same side of a recorded reset', () => {
    const reset = full.samples.find((s, i) => i > 0 && s.reset)!;
    const before = stateAt(full, reset.t - 1), after = stateAt(full, reset.t);
    expect(before.rem?.mode).toBe('hold');
    expect(before.sampledFrom).toEqual(before.rem?.p);
    expect(after.sampledFrom).toEqual(reset.p);
    expect(after.rem?.p).toEqual(reset.p);
    expect(after.sampledFrom).not.toEqual(before.sampledFrom);
  });
});

describe('rewind window', () => {
  const tl = { ...emptyTimeline(), runId: 'w', startT: 0, lastT: 600_000, scores: [{ t: 0, score: 0 }], samples: [] } as Timeline;
  it('bounds start at end − window', () => {
    expect(bounds(tl, 120_000)).toEqual({ start: 480_000, end: 600_000 });
    expect(bounds(tl, null)).toEqual(bounds(tl));
  });
  it('seek clamps to the window', () => {
    const pb = seek({ T: 600_000, playing: false, speed: 1, live: true }, tl, 10_000, 120_000);
    expect(pb.T).toBe(480_000);
    expect(pb.live).toBe(false);
  });
  it('the floor moves under a paused viewer (Review Focus 3)', () => {
    let pb = seek({ T: 600_000, playing: false, speed: 1, live: true }, tl, 500_000, 120_000);
    const later = { ...tl, lastT: 610_000 } as Timeline;     // 10 s of new events: floor is now 490_000
    pb = step(pb, later, 16, 1, 120_000);
    expect(pb.T).toBe(500_000);                              // still inside: not dragged
    const muchLater = { ...tl, lastT: 640_000 } as Timeline; // floor 520_000 passes her T
    pb = step(pb, muchLater, 16, 1, 120_000);
    expect(pb.T).toBe(520_000);                              // lands on the window's start, not on live
    expect(pb.live).toBe(false);
  });
});
