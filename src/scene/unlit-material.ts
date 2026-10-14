// src/scene/unlit-material.ts: vanilla terrain is unlit; brightness comes from baked vertex colours (spec §3.2).
import * as THREE from 'three';
import type { RenderPass } from '../vanilla/course-mesh';

const cache = new Map<string, THREE.MeshBasicMaterial>();
export function unlitMaterial(texture: THREE.Texture, pass: RenderPass): THREE.MeshBasicMaterial {
  const key = `${texture.uuid}|${pass}`;
  let m = cache.get(key);
  if (!m) {
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = pass === 'cutout' ? THREE.NearestFilter : THREE.NearestMipmapLinearFilter;   // no mip bleed on cutouts
    texture.generateMipmaps = pass !== 'cutout';
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    m = new THREE.MeshBasicMaterial({ map: texture, vertexColors: true, fog: true,
      alphaTest: pass === 'cutout' ? 0.1 : 0, transparent: pass === 'translucent', depthWrite: pass !== 'translucent', side: pass === 'opaque' ? THREE.FrontSide : THREE.DoubleSide });
    cache.set(key, m);
  }
  return m;
}
