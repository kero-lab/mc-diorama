'use client';
// src/scene/player-model.tsx: Rem as the vanilla slim player model (spec §4.1-4.2), lit as vanilla lights entities
// (entityMaterial: light.glsl on the posed world-space normal), posed every frame from the spectator track.
// No allocation in useFrame beyond spectatorPoseAt's result.
import { Suspense, useContext, useEffect, useMemo, useRef } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { useDioramaHost } from '../host';
import { RenderFrameContext } from '../render-clock';
import type { Sample } from '../types';
import { heldItemFor } from '../registry/held-items';
import { BASE_POSE, poseObject3D, setupAnim, setupAnimInto, THREE_EULER_ORDER, type PartName } from '../vanilla/humanoid';
import { spectatorPoseAt, type SpectatorPose } from '../vanilla/spectator';
import { vanillaYawToThree } from '../vanilla/yaw';
import { skinBox } from './player-skin';
import { entityMaterial } from './vanilla-material';

export { entityLight } from './vanilla-material';

type Vec3 = [number, number, number];
export interface PlayerPart { part: PartName; uv: [number, number]; outer: [number, number]; box: [number, number, number, number, number, number]; inflate: number }
/** HumanoidModel.createMesh + PlayerModel.createMesh (slim): box origin x,y,z + size w,h,d in vanilla px, relative to
 *  the part's pivot. Outer layer CubeDeformation: hat 0.5, sleeves/jacket/pants 0.25 (per side). */
export const PLAYER_PARTS: PlayerPart[] = [
  { part: 'head', uv: [0, 0], outer: [32, 0], box: [-4, -8, -4, 8, 8, 8], inflate: 0.5 },
  { part: 'body', uv: [16, 16], outer: [16, 32], box: [-4, 0, -2, 8, 12, 4], inflate: 0.25 },
  { part: 'rightArm', uv: [40, 16], outer: [40, 32], box: [-2, -2, -2, 3, 12, 4], inflate: 0.25 },
  { part: 'leftArm', uv: [32, 48], outer: [48, 48], box: [-1, -2, -2, 3, 12, 4], inflate: 0.25 },
  { part: 'rightLeg', uv: [0, 16], outer: [0, 32], box: [-2, 0, -2, 4, 12, 4], inflate: 0.25 },
  { part: 'leftLeg', uv: [16, 48], outer: [0, 48], box: [-2, 0, -2, 4, 12, 4], inflate: 0.25 },
];
/** Box centre in three model space relative to the pivot (y and z flipped, as toThree). */
export const partCentre = (p: PlayerPart): Vec3 => [p.box[0] + p.box[3] / 2, -(p.box[1] + p.box[4] / 2), -(p.box[2] + p.box[5] / 2)];

/** The right hand's item frame. PlayerModel#translateToHand (slim) shifts the arm pivot +0.5 px in x before the arm's
 *  translateAndRotate; ItemInHandLayer#submitArmWithItem then applies Rx(-90°)·Ry(180°) and translates (1/16, 0.125,
 *  -0.625) blocks = (1, 2, -10) px, which is (-1, 10, -2) px in the arm frame, (-1, -10, 2) in three. Conjugating the item
 *  frame into three space (Rx(π)·Rx(-90°)·Ry(180°)) leaves Rx(90°)·Ry(180°), so an item component is authored in
 *  vanilla item-model coordinates, in blocks. */
export const HAND_SLOT = { slimShift: 0.5, position: [-1, -10, 2] as Vec3, rotation: [Math.PI / 2, Math.PI, 0] as Vec3, order: 'XYZ' as const };
/** AvatarRenderer#scale 0.9375 on vanilla px. Feet: toThree's y = 24 - y puts the leg boxes' bottom at 0; vanilla's
 *  translate(0, -1.501, 0) leaves them 0.001 blocks higher, a z-fight guard against the floor that is not reproduced. */
const MODEL_SCALE = 0.9375 / 16;

function Skin({ p }: { p: PlayerPart }) {
  const { assetBase } = useDioramaHost();
  const texture = useLoader(THREE.TextureLoader, `${assetBase}/rem-skin.png`);
  const [inner, outer] = useMemo(() => [skinBox(p.box[3], p.box[4], p.box[5], ...p.uv), skinBox(p.box[3], p.box[4], p.box[5], ...p.outer, p.inflate * 2)], [p]);
  useEffect(() => () => { inner.dispose(); outer.dispose(); }, [inner, outer]);
  return <group position={partCentre(p)}>
    <mesh geometry={inner} material={entityMaterial(texture, 'inner')} />
    <mesh geometry={outer} material={entityMaterial(texture, 'outer')} />
  </group>;
}

const NAMES = Object.keys(BASE_POSE) as PartName[];
const REST: SpectatorPose = { p: [0, 0, 0], bodyYaw: 0, headYaw: 0, pitch: 0, walkPos: 0, walkSpeed: 0, crouch: false, sprint: false, ground: true, held: null, age: 0 };

export function PlayerModel({ samples, T, reducedMotion }: { samples: readonly Sample[]; T: number; reducedMotion: boolean }) {
  const frame = useContext(RenderFrameContext);
  const root = useRef<THREE.Group>(null), hand = useRef<THREE.Group>(null), parts = useRef<Partial<Record<PartName, THREE.Group>>>({});
  const scratch = useMemo(() => ({ anim: setupAnim(REST, { reducedMotion: true }), pose: { ...REST }, opts: { reducedMotion } }), []);
  scratch.opts.reducedMotion = reducedMotion;
  useFrame(() => {
    const r = root.current;
    if (!r) return;
    const s = spectatorPoseAt(samples, frame?.current.T ?? T);
    r.visible = s !== null;
    if (!s) return;
    let pose = s;
    if (reducedMotion) { pose = Object.assign(scratch.pose, s); pose.walkSpeed = 0; }   // no limb swing
    setupAnimInto(scratch.anim, pose, scratch.opts);
    const at = (reducedMotion && frame?.current.rem?.p) || s.p;   // reduced motion: the true position, no smoothing lag
    r.position.set(at[0], at[1] + scratch.anim.renderYOffset, at[2]);
    r.rotation.y = vanillaYawToThree(s.bodyYaw);
    for (const k of NAMES) { const g = parts.current[k]; if (g) poseObject3D(scratch.anim.parts[k], g); }
    if (hand.current) { poseObject3D(scratch.anim.parts.rightArm, hand.current); hand.current.position.x += HAND_SLOT.slimShift; }
  });
  const Held = heldItemFor(spectatorPoseAt(samples, T)?.held ?? null);
  return <group ref={root}><group scale={MODEL_SCALE}>
    {PLAYER_PARTS.map(p => <group key={p.part} rotation-order={THREE_EULER_ORDER} ref={g => { if (g) parts.current[p.part] = g; }}>
      <Suspense fallback={null}><Skin p={p} /></Suspense>
    </group>)}
    <group ref={hand} rotation-order={THREE_EULER_ORDER}>
      {Held && <group position={HAND_SLOT.position} rotation={[...HAND_SLOT.rotation, HAND_SLOT.order]}><group scale={16}><Held /></group></group>}
    </group>
  </group></group>;
}
