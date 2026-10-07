// tests/custom-camera.test.ts
import { CAMERAS, CAMERA_IDS, BUILTIN_CAMERA_IDS } from '../src/registry/cameras';
import { DEFAULT_CUSTOM, sanitizeCustom, customPose } from '../src/registry/custom-camera';
import { stateAt } from '../src/frame';
import { seedTimeline } from '../src/seed';
import { syntheticRun } from './fixtures/rem-mc/synthetic-p8';

const tl = seedTimeline({ events: syntheticRun(), truncated: false, version: 1, lastId: null, runId: 'r' });
const input = (T: number) => ({ frame: stateAt(tl, T), tl, rotation: 0 as const, reducedMotion: false });
const finite = (v: number[]) => v.every(Number.isFinite);

describe('custom camera', () => {
  it('is registered after the six built-ins', () => {
    expect(CAMERA_IDS).toEqual(['iso', 'top', 'side', 'shoulder', 'first', 'cinematic', 'custom']);
    expect(CAMERAS.custom.label).toBe('Custom');
  });
  it('anchor rem: orbits her by yaw/pitch at distance, looking at her middle', () => {
    const i = input(tl.startT! + 2000);
    const p = customPose(i, { ...DEFAULT_CUSTOM, yaw: 0, pitch: 0, distance: 10, height: 0, lookAhead: 0 });
    const focus = [i.frame.rem!.p[0], i.frame.rem!.p[1] + 0.9, i.frame.rem!.p[2]];
    expect(p.target).toEqual(focus);
    expect(Math.hypot(p.position[0] - focus[0], p.position[1] - focus[1], p.position[2] - focus[2])).toBeCloseTo(10, 5);
  });
  it('anchor world: stays put while she moves', () => {
    const a = customPose(input(tl.startT! + 1000), { ...DEFAULT_CUSTOM, anchor: 'world', world: [0, 150, 0] });
    const b = customPose(input(tl.startT! + 5000), { ...DEFAULT_CUSTOM, anchor: 'world', world: [0, 150, 0] });
    expect(b.position).toEqual(a.position);
  });
  it('lookAhead moves the target along the course heading', () => {
    const i = input(tl.startT! + 2000);
    const a = customPose(i, { ...DEFAULT_CUSTOM, lookAhead: 0 }), b = customPose(i, { ...DEFAULT_CUSTOM, lookAhead: 4 });
    expect(b.target[0] - a.target[0]).toBeCloseTo(i.frame.heading.x * 4, 5);
    expect(b.target[2] - a.target[2]).toBeCloseTo(i.frame.heading.z * 4, 5);
  });
  it('sanitises stored params (Review Focus 4): clamps, defaults, never NaN', () => {
    const s = sanitizeCustom({ anchor: 'moon', yaw: 'x', pitch: 9, distance: -5, fov: 500, smoothing: NaN, lookAhead: 1e9, lockRoll: 'yes', projection: 'fisheye', extra: 1 });
    expect(s.anchor).toBe('rem');
    expect(s.yaw).toBe(DEFAULT_CUSTOM.yaw);
    expect(s.pitch).toBeLessThanOrEqual(1.5);
    expect(s.distance).toBeGreaterThanOrEqual(2);
    expect(s.fov).toBeLessThanOrEqual(110);
    expect(s.smoothing).toBe(DEFAULT_CUSTOM.smoothing);
    expect(s.lookAhead).toBeLessThanOrEqual(20);
    expect(s.lockRoll).toBe(DEFAULT_CUSTOM.lockRoll);
    expect(s.projection).toBe('persp');
    expect(sanitizeCustom(null)).toEqual(DEFAULT_CUSTOM);
    const p = customPose(input(tl.startT! + 2000), s);
    expect(finite([...p.position, ...p.target, ...p.up, p.fov, p.zoom])).toBe(true);
  });
  it('built-in cameras ignore params they do not use and keep their poses', () => {
    const i = input(tl.startT! + 2000);
    expect(CAMERAS.shoulder.pose(i, { zoom: 3 })).toEqual(CAMERAS.shoulder.pose(i));
  });
});

it('pins the built-in camera ids', () => {
  expect([...BUILTIN_CAMERA_IDS]).toEqual(['iso', 'top', 'side', 'shoulder', 'first', 'cinematic']);
});
