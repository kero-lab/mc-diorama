'use client';
import { useContext, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Mesh, MeshBasicMaterial } from 'three';
import type { Vec3T } from '../model';
import { RenderFrameContext } from '../render-clock';

export const PUFF_MS = 600;
/** Decorative landing accent. Fixed geometry, animated on the render clock;
 * it never displaces the recorded entity or recreates geometry each frame. */
export function LandingPuff({ at, age, bornAt }: { at: Vec3T; age: number; bornAt?: number }) {
  const frame = useContext(RenderFrameContext);
  const mesh = useRef<Mesh>(null), material = useRef<MeshBasicMaterial>(null);
  useFrame(() => {
    if (!mesh.current || !material.current) return;
    const elapsed = frame && bornAt !== undefined ? frame.current.T - bornAt : age;
    const s = Math.max(0, Math.min(1, elapsed / PUFF_MS));
    mesh.current.visible = elapsed >= 0 && elapsed < PUFF_MS;
    mesh.current.scale.setScalar(1 + 2 * s);
    material.current.opacity = 0.6 * (1 - s);
  });
  return <mesh ref={mesh} position={[at[0], at[1] + 0.02, at[2]]} rotation={[-Math.PI / 2, 0, 0]}>
    <ringGeometry args={[0.25, 0.32, 24]} />
    <meshBasicMaterial ref={material} color='#ffffff' transparent opacity={0.6} depthWrite={false} />
  </mesh>;
}
