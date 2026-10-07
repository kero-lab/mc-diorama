import * as THREE from 'three';

/** Identical vanilla texture policy for cached and live scenes. Ladder planes
 * need hard cutouts: averaged transparent mip texels otherwise become dark fill. */
export function createVanillaMaterial(texture: THREE.Texture, name: string) {
  const ladder = name === 'block/ladder';
  const translucent = /glass|slime|honey/.test(name);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = ladder
    ? THREE.NearestFilter
    : THREE.NearestMipmapLinearFilter;
  texture.generateMipmaps = !ladder;
  texture.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({
    map: texture,
    alphaTest: translucent ? 0.01 : 0.5,
    transparent: translucent,
    depthWrite: !translucent,
    roughness: /ice|glass/.test(name) ? 0.35 : 1
  });
}
