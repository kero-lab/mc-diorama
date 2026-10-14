// src/vanilla/humanoid.ts: HumanoidModel#setupAnim + PlayerModel (slim), 1.21.11 (VANILLA-RENDER.md §2).
// Model space as vanilla: pixels, y down from the neck, front -z. toThree maps it to the package's model space.
import type { SpectatorPose } from './spectator';
import { wrapDegrees } from './yaw';

export type PartName = 'head' | 'body' | 'rightArm' | 'leftArm' | 'rightLeg' | 'leftLeg';
export interface PartPose { x: number; y: number; z: number; xRot: number; yRot: number; zRot: number }
export interface HumanoidAnim { parts: Record<PartName, PartPose>; renderYOffset: number }
const P = (x: number, y: number, z: number): PartPose => ({ x, y, z, xRot: 0, yRot: 0, zRot: 0 });
/** HumanoidModel.createMesh / PlayerModel.createMesh (slim): part pivots. */
export const BASE_POSE: Record<PartName, PartPose> = { head: P(0, 0, 0), body: P(0, 0, 0), rightArm: P(-5, 2, 0), leftArm: P(5, 2, 0), rightLeg: P(-1.9, 12, 0), leftLeg: P(1.9, 12, 0) };
const NAMES = Object.keys(BASE_POSE) as PartName[];
const RAD = Math.PI / 180;

/** Allocation-free setupAnim: overwrites every field of `out` (a preallocated HumanoidAnim). */
export function setupAnimInto(out: HumanoidAnim, p: SpectatorPose, { reducedMotion }: { reducedMotion: boolean }): void {
  const parts = out.parts;
  for (const n of NAMES) { const t = parts[n], b = BASE_POSE[n]; t.x = b.x; t.y = b.y; t.z = b.z; t.xRot = 0; t.yRot = 0; t.zRot = 0; }
  const pos = p.walkPos, v = p.walkSpeed;   // speedValue is 1 for a player
  parts.head.yRot = wrapDegrees(p.headYaw - p.bodyYaw) * RAD;   // render state yRot = head - body, xRot = pitch
  parts.head.xRot = p.pitch * RAD;
  parts.rightArm.xRot = Math.cos(pos * 0.6662 + Math.PI) * 2 * v * 0.5;
  parts.leftArm.xRot = Math.cos(pos * 0.6662) * 2 * v * 0.5;
  parts.rightLeg.xRot = Math.cos(pos * 0.6662) * 1.4 * v;
  parts.leftLeg.xRot = Math.cos(pos * 0.6662 + Math.PI) * 1.4 * v;
  parts.rightLeg.yRot = 0.005; parts.leftLeg.yRot = -0.005; parts.rightLeg.zRot = 0.005; parts.leftLeg.zRot = -0.005;
  // poseRightArm ArmPose.ITEM runs before setupAttackAnimation, the crouch block and the bob
  if (p.held) parts.rightArm.xRot = parts.rightArm.xRot * 0.5 - Math.PI / 10;
  if (p.crouch) {
    parts.body.xRot = 0.5; parts.rightArm.xRot += 0.4; parts.leftArm.xRot += 0.4;
    parts.rightLeg.z += 4; parts.leftLeg.z += 4; parts.head.y += 4.2; parts.body.y += 3.2; parts.rightArm.y += 3.2; parts.leftArm.y += 3.2;
  }
  if (!reducedMotion) {   // AnimationUtils#bobModelPart: right arm +1, left arm -1 (not SPYGLASS)
    const z = Math.cos(p.age * 0.09) * 0.05 + 0.05, x = Math.sin(p.age * 0.067) * 0.05;
    parts.rightArm.zRot += z; parts.rightArm.xRot += x;
    parts.leftArm.zRot -= z; parts.leftArm.xRot -= x;
  }
  out.renderYOffset = p.crouch ? -2 / 16 * 0.9375 : 0;   // AvatarRenderer#getRenderOffset, scale 0.9375
}

export function setupAnim(p: SpectatorPose, opts: { reducedMotion: boolean }): HumanoidAnim {
  const out: HumanoidAnim = { parts: { head: P(0, 0, 0), body: P(0, 0, 0), rightArm: P(0, 0, 0), leftArm: P(0, 0, 0), rightLeg: P(0, 0, 0), leftLeg: P(0, 0, 0) }, renderYOffset: 0 };
  setupAnimInto(out, p, opts);
  return out;
}

/** Euler order the three rotation from toThree MUST be applied with: vanilla ModelPart#translateAndRotate is
 *  rotationZYX(zRot, yRot, xRot) = Rz·Ry·Rx, and conjugating by Rx(π) keeps that order. three's default 'XYZ' mis-poses. */
export const THREE_EULER_ORDER = 'ZYX' as const;

/** Vanilla model space → three model space (rotation is for `THREE_EULER_ORDER`): x kept, y flipped and lifted so the feet are at 0, z flipped. A rotation
 *  conjugated by that 180° turn about x keeps its x angle and negates its y and z angles. */
export function toThree(part: PartPose): { position: [number, number, number]; rotation: [number, number, number] } {
  return { position: [part.x, 24 - part.y, -part.z], rotation: [part.xRot, -part.yRot, -part.zRot] };
}

/** Allocation-free toThree: poses a three Object3D (position + rotation, in `THREE_EULER_ORDER`) from a vanilla part pose. */
export function poseObject3D(part: PartPose, o: { position: { set(x: number, y: number, z: number): unknown }; rotation: { set(x: number, y: number, z: number, order?: typeof THREE_EULER_ORDER): unknown } }): void {
  o.position.set(part.x, 24 - part.y, -part.z);
  o.rotation.set(part.xRot, -part.yRot, -part.zRot, THREE_EULER_ORDER);
}
