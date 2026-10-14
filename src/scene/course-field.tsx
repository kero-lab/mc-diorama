'use client';
// src/scene/course-field.tsx: the course in vanilla terrain rendering. One geometry per texture + pass, rebuilt only when
// the world changes; translucent parts re-sorted back to front when the camera moved a block or more.
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { useDioramaHost } from '../host';
import { blockDef } from '../registry/blocks';
import type { WorldBlock } from '../types';
import { buildCourseMesh, type CoursePart } from '../vanilla/course-mesh';
import { unlitMaterial } from './unlit-material';
import { materialFor } from './textures';

// Unlit twin of materialFor's standard material: the scene has no lights, so a standard material would render black.
const basicCache = new WeakMap<THREE.Material, THREE.MeshBasicMaterial>();
function fallbackMaterial(def: Parameters<typeof materialFor>[0]): THREE.MeshBasicMaterial {
  const src = materialFor(def);
  let m = basicCache.get(src);
  if (!m) { m = new THREE.MeshBasicMaterial({ map: src.map, color: src.color, transparent: src.transparent, opacity: src.opacity, depthWrite: src.depthWrite, fog: true }); basicCache.set(src, m); }
  return m;
}

export const coursePartsFor = (blocks: readonly WorldBlock[]) => buildCourseMesh(blocks);
const UNIT = new THREE.BoxGeometry(1, 1, 1);

/** The block a raycast hit. three's `faceIndex` is the triangle index while the geometry is non-indexed, but once
 *  sortTriangles has set an index buffer it counts in the SORTED order; `order[i]` is the original triangle at slot i. */
export function triangleBlock(blockOfTriangle: readonly string[], order: Uint32Array | null, faceIndex: number): string | null {
  const t = order ? order[faceIndex] : faceIndex;
  return t === undefined ? null : blockOfTriangle[t] ?? null;
}

function Part({ part, onHover }: { part: CoursePart; onHover(b: string | null): void }) {
  const { assetBase } = useDioramaHost();
  const texture = useLoader(THREE.TextureLoader, `${assetBase}/1.21.11/${part.texture}.png`);
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(part.positions, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(part.uvs, 2));
    g.setAttribute('color', new THREE.BufferAttribute(part.colors, 3));
    g.computeBoundingSphere();
    return g;
  }, [part]);
  const sortedAt = useRef(new THREE.Vector3(Infinity, 0, 0)), order = useRef<Uint32Array | null>(null);
  useEffect(() => { sortedAt.current.set(Infinity, 0, 0); order.current = null; return () => geometry.dispose(); }, [geometry]);
  useFrame(({ camera }) => {
    if (part.pass !== 'translucent' || camera.position.distanceToSquared(sortedAt.current) < 1) return;
    sortedAt.current.copy(camera.position);
    order.current = sortTriangles(geometry, part, camera.position);
  });
  const material = unlitMaterial(texture, part.pass);
  return <mesh geometry={geometry} material={material} renderOrder={part.pass === 'translucent' ? 1 : 0}
    onPointerOver={e => { e.stopPropagation(); onHover(e.faceIndex == null ? null : triangleBlock(part.blockOfTriangle, order.current, e.faceIndex)); }} onPointerOut={() => onHover(null)} />;
}

/** Back-to-front by triangle centroid, written into an index buffer (positions stay put). Returns the sorted order
 *  (slot → original triangle) so a raycast faceIndex can be mapped back. */
function sortTriangles(g: THREE.BufferGeometry, part: CoursePart, eye: THREE.Vector3): Uint32Array {
  const n = part.positions.length / 9, d = new Float32Array(n), order = new Uint32Array(n);
  for (let t = 0; t < n; t++) {
    const o = t * 9, cx = (part.positions[o] + part.positions[o + 3] + part.positions[o + 6]) / 3 - eye.x,
      cy = (part.positions[o + 1] + part.positions[o + 4] + part.positions[o + 7]) / 3 - eye.y, cz = (part.positions[o + 2] + part.positions[o + 5] + part.positions[o + 8]) / 3 - eye.z;
    d[t] = cx * cx + cy * cy + cz * cz; order[t] = t;
  }
  order.sort((a, b) => d[b] - d[a]);
  const index = new Uint32Array(n * 3);
  order.forEach((t, i) => { index[i * 3] = t * 3; index[i * 3 + 1] = t * 3 + 1; index[i * 3 + 2] = t * 3 + 2; });
  g.setIndex(new THREE.BufferAttribute(index, 1));
  return order;
}

export function CourseField({ blocks }: { blocks: WorldBlock[] }) {
  const [hover, setHover] = useState<string | null>(null);
  const mesh = coursePartsFor(blocks);
  const hovered = hover ? blocks.find(b => b.at.join(',') === hover) ?? null : null;
  return <group>
    <Suspense fallback={null}>{mesh.parts.map(p => <Part key={p.key} part={p} onHover={setHover} />)}</Suspense>
    {mesh.fallback.map(b => <mesh key={b.at.join(',')} geometry={UNIT} material={fallbackMaterial(blockDef(b.name).material)} position={[b.at[0] + 0.5, b.at[1] + 0.5, b.at[2] + 0.5]} />)}
    {hovered && <Html position={[hovered.at[0] + 0.5, hovered.at[1] + 1.3, hovered.at[2] + 0.5]} center><div className='pointer-events-none min-w-32 rounded-lg border border-border bg-background/95 px-3 py-2 text-xs shadow-xl'><strong className='block capitalize text-foreground'>{blockDef(hovered.name).label}</strong><span className='mt-1 block font-mono text-muted-foreground'>{hovered.at.join(' · ')}</span></div></Html>}
  </group>;
}
