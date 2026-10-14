'use client';
import type { Pose } from '../interp';
import { entityDef } from '../registry/entities';

export function EntityModel({ kind, pose }: { kind: string; pose: Pose }) {
  const d = entityDef(kind);
  return <mesh position={[pose.p[0], pose.p[1] + d.size[1] / 2, pose.p[2]]} rotation={[0, pose.yaw, 0]}>
    <boxGeometry args={d.size} /><meshBasicMaterial color={d.color} fog />
  </mesh>;
}
