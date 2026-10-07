'use client';
import { Suspense, useContext, useEffect, useMemo, useRef } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import { NearestFilter, SRGBColorSpace, TextureLoader, type Group } from 'three';
import { RenderFrameContext } from '../render-clock';
import type { Pose } from '../interp';
import { entityDef } from '../registry/entities';
import { skinBox } from './player-skin';
import { playerMotionAt } from './player-motion';
import type { Sample } from '../types';
import { useDioramaHost } from '../host';

/** Slim-arm skin published by Rem__OwO; bundled locally so replays need no skin service. */
function SkinPart({ size, uv, outer, offset = 0 }: { size: [number, number, number]; uv: [number, number]; outer: [number, number]; offset?: number }) {
  const { assetBase } = useDioramaHost();
  const texture = useLoader(TextureLoader, `${assetBase}/rem-skin.png`);
  const geometry = useMemo(() => [skinBox(...size, ...uv), skinBox(...size, ...outer, size[0] === 8 && size[1] === 8 ? 1 : 0.5)], [size[0], size[1], size[2], uv[0], uv[1], outer[0], outer[1]]);
  useEffect(() => () => geometry.forEach(g => g.dispose()), [geometry]);
  texture.magFilter = texture.minFilter = NearestFilter;
  texture.colorSpace = SRGBColorSpace;
  texture.generateMipmaps = false;
  return <group position={[0, offset, 0]}>{geometry.map((g, i) => <mesh key={i} geometry={g}><meshStandardMaterial map={texture} transparent={i === 1} alphaTest={0.5} roughness={1} /></mesh>)}</group>;
}

/** Feet, yaw and pitch follow recorded/interpolated poses. The cosmetic gait follows distance travelled;
 * held samples, discontinuities, pause and reduced motion never create a running-in-place animation. */
export function RemModel({ samples, pose, T, reducedMotion = false }: { samples: readonly Sample[]; pose: Pose; T: number; reducedMotion?: boolean }) {
  const frame = useContext(RenderFrameContext);
  const root = useRef<Group>(null), torso = useRef<Group>(null), head = useRef<Group>(null);
  const limbs = useRef<(Group | null)[]>([]);
  useFrame(() => {
    const current = frame?.current.rem ?? pose, time = frame?.current.T ?? T;
    if (!root.current || !torso.current || !head.current) return;
    root.current.visible = !frame || frame.current.rem !== null;
    root.current.position.set(...current.p);
    root.current.rotation.y = current.yaw + Math.PI;
    const motion = playerMotionAt(samples,time,current,reducedMotion);
    const lean = motion.crouch*.3 + motion.lean;
    torso.current.rotation.x = lean;
    head.current.rotation.x = -current.pitch-lean;
    limbs.current.forEach((limb,i) => {
      if (!limb) return;
      const sign=i===1 || i===2 ? 1 : -1;
      limb.rotation.x = sign*motion.swing + (i<2 ? -.16*motion.air : -.22*motion.air);
      // A restrained airborne balance pose, not the old running-in-midair cycle.
      limb.rotation.z = i<2 ? 0 : (i===2 ? -1 : 1)*motion.air*.16;
    });
  });
  return <group ref={root}><Suspense fallback={null}>
    <group scale={1 / 16}>
      {[-2, 2].map((x, i) => <group key={x} ref={g => { limbs.current[i] = g; }} position={[x, 12, 0]}>
        <SkinPart size={[4, 12, 4]} uv={i === 0 ? [0, 16] : [16, 48]} outer={i === 0 ? [0, 32] : [0, 48]} offset={-6} />
      </group>)}
      <group ref={torso} position={[0, 12, 0]}>
        <group position={[0, 6, 0]}><SkinPart size={[8, 12, 4]} uv={[16, 16]} outer={[16, 32]} /></group>
        {[-5.5, 5.5].map((x, i) => <group key={x} ref={g => { limbs.current[i + 2] = g; }} position={[x, 10, 0]}>
          <SkinPart size={[3, 12, 4]} uv={i === 0 ? [40, 16] : [32, 48]} outer={i === 0 ? [40, 32] : [48, 48]} offset={-4} />
        </group>)}
        <group ref={head} position={[0, 12, 0]}><SkinPart size={[8, 8, 8]} uv={[0, 0]} outer={[32, 0]} offset={4} /></group>
      </group>
    </group>
  </Suspense></group>;
}

export function EntityModel({ kind, pose }: { kind: string; pose: Pose }) {
  const d = entityDef(kind);
  return <mesh position={[pose.p[0], pose.p[1] + d.size[1] / 2, pose.p[2]]} rotation={[0, pose.yaw, 0]}>
    <boxGeometry args={d.size} /><meshStandardMaterial color={d.color} />
  </mesh>;
}
