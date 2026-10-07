import * as THREE from 'three';
import { useLoader } from '@react-three/fiber';
import { createVanillaMaterial } from './vanilla-material';
import type { MaterialDef } from '../registry/blocks';
import { useDioramaHost } from '../host';

const cache = new Map<string, THREE.MeshStandardMaterial>();
const vanilla = new Map<string, THREE.MeshStandardMaterial>();
const materialSets = new Map<string, THREE.MeshStandardMaterial[]>();
/** Load locally bundled, version-pinned artwork through R3F's shared Suspense cache. */
export function useBlockMaterials(names: string[]): THREE.MeshStandardMaterial[] {
  const { assetBase } = useDioramaHost();
  const textures = useLoader(THREE.TextureLoader, names.map(n => `${assetBase}/1.21.11/${n}.png`));
  const key = `${assetBase}|${names.join('|')}`;
  const existing=materialSets.get(key); if (existing) return existing;
  const result=textures.map((texture, i) => {
    const name = names[i];
    const vkey = `${assetBase}|${name}`;
    let material = vanilla.get(vkey);
    if (!material) {
      material = createVanillaMaterial(texture, name);
      vanilla.set(vkey, material);
    }
    return material;
  });
  // InstancedMesh constructor args must keep their identity across 10 Hz DOM publication.
  materialSets.set(key,result); return result;
}
function rng(seed: number) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; }; }
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

/** A pixel texture: noise between base and accent, plus a pattern hint (planks: horizontal bands; glass/ice: a frame). */
function paint(def: MaterialDef): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = 16;
  const g = c.getContext('2d')!;
  const r = rng(hash(def.key));
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    let accent = r() < 0.35;
    if (def.pattern === 'planks') accent = y % 4 === 0 || (r() < 0.1);
    if (def.pattern === 'glass' || def.pattern === 'ice') accent = x === 0 || y === 0 || x === 15 || y === 15 || (def.pattern === 'ice' && r() < 0.15);
    if (def.pattern === 'scaffold') accent = x < 2 || x > 13 || y < 2;
    if (def.pattern === 'concrete' || def.pattern === 'plain') accent = r() < 0.08;
    g.fillStyle = accent ? def.accent : def.base;
    g.fillRect(x, y, 1, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
export function materialFor(def: MaterialDef): THREE.MeshStandardMaterial {
  let m = cache.get(def.key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ map: paint(def), transparent: def.opacity < 1, opacity: def.opacity, roughness: def.pattern === 'ice' || def.pattern === 'glass' ? 0.2 : 0.85, depthWrite: def.opacity >= 1 });
    cache.set(def.key, m);
  }
  return m;
}
