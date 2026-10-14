// HumanoidModel#setupAnim (1.21.11) worked values (VANILLA-RENDER.md §2).
import { describe, expect, it } from 'vitest';
import { BASE_POSE, setupAnim, setupAnimInto, toThree, type PartName, type PartPose } from '../src/vanilla/humanoid';
import type { SpectatorPose } from '../src/vanilla/spectator';

const pose = (o: Partial<SpectatorPose> = {}): SpectatorPose => ({ p: [0, 0, 0], bodyYaw: 0, headYaw: 0, pitch: 0, walkPos: 0, walkSpeed: 0, crouch: false, sprint: false, ground: true, held: null, age: 0, ...o });
describe('setupAnim', () => {
  it('slim pivots', () => {
    expect(BASE_POSE.rightArm).toMatchObject({ x: -5, y: 2, z: 0 });
    expect(BASE_POSE.leftLeg).toMatchObject({ x: 1.9, y: 12, z: 0 });
  });
  it('limb swing at walkPos 1, speed 1', () => {
    const { parts } = setupAnim(pose({ walkPos: 1, walkSpeed: 1 }), { reducedMotion: true });
    expect(parts.rightLeg.xRot).toBeCloseTo(Math.cos(0.6662) * 1.4);
    expect(parts.leftLeg.xRot).toBeCloseTo(Math.cos(0.6662 + Math.PI) * 1.4);
    expect(parts.rightArm.xRot).toBeCloseTo(Math.cos(0.6662 + Math.PI) * 2 * 0.5);
    expect(parts.leftArm.xRot).toBeCloseTo(Math.cos(0.6662) * 2 * 0.5);
  });
  it('head follows head − body yaw and pitch', () => {
    const { parts } = setupAnim(pose({ headYaw: 30, bodyYaw: 10, pitch: 20 }), { reducedMotion: true });
    expect(parts.head.yRot).toBeCloseTo(20 * Math.PI / 180);
    expect(parts.head.xRot).toBeCloseTo(20 * Math.PI / 180);
  });
  it('crouch', () => {
    const { parts, renderYOffset } = setupAnim(pose({ crouch: true }), { reducedMotion: true });
    expect(parts.body.xRot).toBeCloseTo(0.5);
    expect(parts.rightArm.xRot).toBeCloseTo(0.4);
    expect(parts.rightLeg.z).toBeCloseTo(4);
    expect(parts.head.y).toBeCloseTo(4.2);
    expect(parts.body.y).toBeCloseTo(3.2);
    expect(parts.rightArm.y).toBeCloseTo(2 + 3.2);
    expect(renderYOffset).toBeCloseTo(-2 / 16 * 0.9375);
  });
  it('arm bob at age 10 (both arms, opposite signs)', () => {
    const { parts } = setupAnim(pose({ age: 10 }), { reducedMotion: false });
    expect(parts.rightArm.zRot).toBeCloseTo(Math.cos(0.9) * 0.05 + 0.05);
    expect(parts.leftArm.zRot).toBeCloseTo(-(Math.cos(0.9) * 0.05 + 0.05));
    expect(parts.rightArm.xRot).toBeCloseTo(Math.sin(0.67) * 0.05);
    expect(parts.leftArm.xRot).toBeCloseTo(-Math.sin(0.67) * 0.05);
  });
  it('holding an item: ITEM arm pose on the right arm, before crouch and bob', () => {
    expect(setupAnim(pose({ held: 'mace' }), { reducedMotion: true }).parts.rightArm.xRot).toBeCloseTo(-Math.PI / 10);
    const { parts } = setupAnim(pose({ held: 'mace', crouch: true, age: 10 }), { reducedMotion: false });
    expect(parts.rightArm.xRot).toBeCloseTo(-Math.PI / 10 + 0.4 + Math.sin(0.67) * 0.05);
    expect(parts.leftArm.xRot).toBeCloseTo(0.4 - Math.sin(0.67) * 0.05);
  });
  it('reduced motion: the model passes walkSpeed 0, so legs hang straight', () => {
    expect(setupAnim(pose({ walkPos: 1, walkSpeed: 0 }), { reducedMotion: true }).parts.rightLeg.xRot).toBe(0);
  });
  it('three conversion: y up from the feet, front +z', () => {
    expect(toThree({ x: -5, y: 2, z: 0, xRot: 0.3, yRot: 0.2, zRot: 0.1 })).toEqual({ position: [-5, 22, -0], rotation: [0.3, -0.2, -0.1] });
  });
});

describe('setupAnimInto', () => {
  const mk = () => ({ parts: Object.fromEntries((Object.keys(BASE_POSE) as PartName[]).map(k => [k, { x: 9, y: 9, z: 9, xRot: 9, yRot: 9, zRot: 9 }])) as Record<PartName, PartPose>, renderYOffset: 9 });
  it('matches setupAnim and fully overwrites a dirty, reused target', () => {
    const out = mk(), refs = { ...out.parts };
    for (const [o, rm] of [[{ walkPos: 3, walkSpeed: 0.7, headYaw: 40, pitch: -10, age: 7 }, false], [{ crouch: true, held: 'x', age: 3 }, false], [{}, true]] as const) {
      setupAnimInto(out, pose(o), { reducedMotion: rm });
      expect(out).toEqual(setupAnim(pose(o), { reducedMotion: rm }));
      for (const k of Object.keys(refs) as PartName[]) expect(out.parts[k]).toBe(refs[k]);
    }
  });
  it('does not mutate BASE_POSE', () => {
    setupAnim(pose({ crouch: true }), { reducedMotion: false });
    expect(BASE_POSE.head.y).toBe(0);
  });
});
