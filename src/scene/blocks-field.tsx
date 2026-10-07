'use client';
import { Suspense, useContext, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { RenderFrameContext } from '../render-clock';
import * as THREE from 'three';
import { Html } from '@react-three/drei';
import type { Vec3T } from '../model';
import { blockDef, boxesOf, type Box, type MaterialDef } from '../registry/blocks';
import { blockKey, type Timeline, type WorldBlock } from '../types';
import { materialFor, useBlockMaterials } from './textures';
import { doorHinge, vanillaMesh, type BlockMesh } from './vanilla-blocks';
import { doorOpenAt, doorTrack } from './door-motion';

export const FADE_FROM = 20, HIDE_FROM = 30;
const UNIT = new THREE.BoxGeometry(1, 1, 1);

/** The course as she plays it (spec §4.4): blocks more than HIDE_FROM behind her (along the heading) are gone, the band
 *  FADE_FROM..HIDE_FROM fades. `fade` dims the instance colour; nothing moves. */
export function visibleBlocks(blocks: readonly WorldBlock[], focus: Vec3T | null, heading: { x: number; z: number }): { block: WorldBlock; fade: number }[] {
  return blocks.flatMap(block => {
    if (!focus) return [{ block, fade: 1 }];
    const behind = (focus[0] - (block.at[0] + 0.5)) * heading.x + (focus[2] - (block.at[2] + 0.5)) * heading.z;
    if (behind > HIDE_FROM) return [];
    return [{ block, fade: behind > FADE_FROM ? 1 - (behind - FADE_FROM) / (HIDE_FROM - FADE_FROM) : 1 }];
  });
}

interface Group { key: string; mesh?: BlockMesh; material: MaterialDef; known: boolean; items: { block: WorldBlock; box: Box; fade: number }[] }
function Instances({ g, onHover, materials }: { g: Group; onHover(b: WorldBlock | null): void; materials?: THREE.Material[] }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const cap = Math.max(16, 2 ** Math.ceil(Math.log2(g.items.length + 1)));
  useLayoutEffect(() => {
    const mesh = ref.current; if (!mesh) return;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
    g.items.forEach((it, i) => {
      const { at } = it.block;
      m.compose(new THREE.Vector3(at[0] + it.box.center[0], at[1] + it.box.center[1], at[2] + it.box.center[2]), q, new THREE.Vector3(...it.box.size));
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, c.setScalar(0.35 + 0.65 * it.fade));
    });
    mesh.count = g.items.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [g, cap]);
  return (
    <instancedMesh key={cap} ref={ref} args={[g.mesh?.geometry ?? UNIT, materials ?? materialFor(g.material), cap]}
      onPointerOver={e => { e.stopPropagation(); onHover(e.instanceId === undefined ? null : g.items[e.instanceId]?.block ?? null); }}
      onPointerOut={() => onHover(null)} />
  );
}

function VanillaInstances({ g, onHover }: { g: Group; onHover(b: WorldBlock | null): void }) {
  const materials = useBlockMaterials(g.mesh!.textures);
  return <Instances g={g} onHover={onHover} materials={materials} />;
}

/** Rigid vanilla panel; only its hinge rotates. Render-time evaluation also makes reverse seeks repeatable. */
function Door({ tl, block, T, reducedMotion, onHover }: { tl: Timeline; block: WorldBlock; T: number; reducedMotion: boolean; onHover(b: WorldBlock | null): void }) {
  const frame = useContext(RenderFrameContext);
  const pivot = useRef<THREE.Group>(null);
  const key = blockKey(block.at), hinge = doorHinge(block.state);
  const changes = useMemo(() => doorTrack(tl.blockChanges,block), [tl.blockChanges,key,block.name,block.state?.half]);
  const mesh = vanillaMesh('oak_door', { facing: 'east', open: false, half: block.state?.half === 'upper' ? 'upper' : 'lower', hinge: block.state?.hinge === 'right' ? 'right' : 'left' })!;
  const materials = useBlockMaterials(mesh.textures);
  useFrame(() => {
    if (!pivot.current) return;
    const time = frame?.current.T ?? T;
    pivot.current.rotation.y = hinge.direction * Math.PI/2 * doorOpenAt(changes,time,reducedMotion);
  });
  return <group position={[block.at[0]+.5,block.at[1],block.at[2]+.5]} rotation={[0,hinge.base,0]}>
    <group ref={pivot} position={[hinge.x-.5,0,hinge.z-.5]}>
      <mesh geometry={mesh.geometry} material={materials} position={[-hinge.x,0,-hinge.z]} onPointerOver={e => { e.stopPropagation(); onHover(block); }} onPointerOut={() => onHover(null)} />
    </group>
  </group>;
}

export function BlocksField({ tl, blocks, index, focus, heading, T, reducedMotion = false }: { tl: Timeline; blocks: WorldBlock[]; index: number; focus: Vec3T | null; heading: { x: number; z: number }; T: number; reducedMotion?: boolean }) {
  const [hover, setHover] = useState<WorldBlock | null>(null);
  // Rebuild instances only when the world changed or she crossed a whole block along the heading.
  const step = focus ? Math.floor(focus[0] * heading.x + focus[2] * heading.z) : null;
  const { groups, doors } = useMemo(() => {
    const map = new Map<string, Group>();
    const doors: WorldBlock[] = [];
    for (const { block, fade } of visibleBlocks(blocks, focus, heading)) {
      const def = blockDef(block.name);
      if (block.name === 'oak_door') { doors.push(block); continue; }
      const mesh = vanillaMesh(block.name,block.state);
      if (mesh) {
        const k = mesh.key;
        const g = map.get(k) ?? { key: k, mesh, material: def.material, known: true, items: [] };
        g.items.push({ block, box: { center: [0,0,0], size: [1,1,1] }, fade });
        map.set(k,g); continue;
      }
      boxesOf(def, block.state).forEach((box, bi) => {
        const k = `${def.material.key}#${def.known ? 'k' : block.name}#${bi}`;
        const g = map.get(k) ?? { key: k, material: def.material, known: def.known, items: [] };
        g.items.push({ block, box, fade });
        map.set(k, g);
      });
    }
    return { groups: [...map.values()], doors };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `step` stands in for `focus`
  }, [blocks, index, step, heading.x, heading.z]);
  return (
    <group>
      <Suspense fallback={null}>
      {groups.map(g => g.mesh ? <VanillaInstances key={g.key} g={g} onHover={setHover} /> : <Instances key={g.key} g={g} onHover={setHover} />)}
      {doors.map(b => <Door key={blockKey(b.at)} tl={tl} block={b} T={T} reducedMotion={reducedMotion} onHover={setHover} />)}
      </Suspense>
      {hover && <Html position={[hover.at[0] + 0.5, hover.at[1] + 1.3, hover.at[2] + 0.5]} center><div className='pointer-events-none min-w-32 rounded-lg border border-border bg-background/95 px-3 py-2 text-xs shadow-xl'><strong className='block capitalize text-foreground'>{blockDef(hover.name).label}</strong><span className='mt-1 block font-mono text-muted-foreground'>{hover.at.join(' · ')}</span>{!blockDef(hover.name).known && <span className='block text-amber-500'>Approximate material</span>}</div></Html>}
    </group>
  );
}
