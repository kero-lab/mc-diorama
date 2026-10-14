import { describe, expect, it } from 'vitest';
import { spectatorPoseAt, spectatorTrack } from '../src/vanilla/spectator';
import { toVanillaYaw, wrapDegrees, rotLerp, vanillaYawToThree } from '../src/vanilla/yaw';
import { seedTimeline } from '../src/seed';
import { loadReal } from './fixtures/real';
import type { Sample } from '../src/types';

const s = (i: number, x: number, z = 0, extra: Partial<Sample> = {}): Sample => ({ t: i * 50, tick: null, p: [x, 64, z], v: [0, 0, 0], yaw: 0, pitch: 0, c: 'f', held: null, ride: null, g: true, reset: i === 0, ...extra });
const walk = (n: number, step: number, yaw = Math.PI / 2) => Array.from({ length: n }, (_, i) => s(i, -i * step, 0, { yaw }));   // west

describe('yaw conventions', () => {
  it('mineflayer to vanilla degrees', () => {
    expect(toVanillaYaw(0)).toBeCloseTo(180);
    expect(wrapDegrees(toVanillaYaw(Math.PI / 2))).toBeCloseTo(90);
  });
  it('wrapDegrees and rotLerp take the short way', () => {
    expect(wrapDegrees(190)).toBeCloseTo(-170);
    expect(rotLerp(0.5, 170, -170)).toBeCloseTo(180);
  });
  it('a model facing +z rotated by vanillaYawToThree faces the vanilla direction', () => {
    expect(vanillaYawToThree(0)).toBeCloseTo(0);
    expect(Math.sin(vanillaYawToThree(90))).toBeCloseTo(-1);
  });
});

describe('spectator track', () => {
  it('lags a straight walk by vanilla interpolation and render delay, then converges', () => {
    const ss = walk(40, 0.2);
    const p = spectatorPoseAt(ss, ss[20].t)!;
    expect(p.p[0]).toBeGreaterThan(ss[20].p[0]);
    expect(p.p[0] - ss[20].p[0]).toBeLessThan(0.2 * 4);
  });
  it('walk speed settles at min(d*4, 1) = 0.8 for 0.2 blocks/tick', () => {
    const ss = walk(60, 0.2);
    expect(spectatorPoseAt(ss, ss[59].t)!.walkSpeed).toBeCloseTo(0.8, 2);
  });
  it('body turns toward movement and the head stays within 50 degrees of it', () => {
    const ss = walk(40, 0.2, 0);
    const p = spectatorPoseAt(ss, ss[39].t)!;
    expect(Math.abs(wrapDegrees(p.headYaw - p.bodyYaw))).toBeLessThanOrEqual(50.0001);
  });
  it('turning across +-pi takes the short way', () => {
    const ss = Array.from({ length: 30 }, (_, i) => s(i, 0, 0, { yaw: Math.PI - 0.05 + i * 0.01 }));
    let prev = spectatorPoseAt(ss, 0)!.headYaw;
    for (let i = 1; i < 30; i++) { const h = spectatorPoseAt(ss, ss[i].t)!.headYaw; expect(Math.abs(wrapDegrees(h - prev))).toBeLessThan(5); prev = h; }
  });
  it('snaps across a reset; no walk spike', () => {
    const ss = [...walk(10, 0.2), s(10, 50, 0, { reset: true }), s(11, 50.2)];
    const p = spectatorPoseAt(ss, ss[10].t)!;
    expect(p.p[0]).toBe(50);
    expect(p.walkSpeed).toBeLessThan(0.9);
  });
  it('crouch and sprint come from the sample controls', () => {
    const ss = [s(0, 0), s(1, 0.1, 0, { c: 'fk' }), s(2, 0.2, 0, { c: 'fs' })];
    expect(spectatorPoseAt(ss, 50)!.crouch).toBe(true);
    expect(spectatorPoseAt(ss, 100)!.sprint).toBe(true);
  });
  it('extends incrementally and matches a fresh build', () => {
    const ss = walk(30, 0.2), live = ss.slice(0, 10);
    spectatorTrack(live);
    live.push(...ss.slice(10));
    const a = spectatorPoseAt(live, ss[25].t + 20)!, b = spectatorPoseAt([...ss], ss[25].t + 20)!;
    expect(a).toEqual(b);
  });
  it('a ridden sample stops the walk animation (isPassenger)', () => {
    const ss = walk(30, 0.2).map((x, i) => (i >= 15 ? { ...x, ride: 'boat' } : x));
    expect(spectatorPoseAt(ss, ss[29].t)!.walkSpeed).toBe(0);
  });
  it('real run: every pose is finite and the lag stays under a block', () => {
    const tl = seedTimeline({ events: loadReal('d1fae16b'), truncated: false, version: 1, lastId: null, runId: null });
    expect(tl.samples.length).toBeGreaterThan(10);
    for (let i = 1; i < tl.samples.length; i += 7) {
      const p = spectatorPoseAt(tl.samples, tl.samples[i].t)!;
      expect(p.p.every(Number.isFinite)).toBe(true);
      expect(Number.isFinite(p.bodyYaw + p.headYaw + p.pitch + p.walkPos + p.walkSpeed)).toBe(true);
      expect(Math.hypot(p.p[0] - tl.samples[i].p[0], p.p[2] - tl.samples[i].p[2])).toBeLessThan(1.5);
    }
  });
});
