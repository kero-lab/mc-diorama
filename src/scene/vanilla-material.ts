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

// Entity lighting (VANILLA-RENDER.md §9): light.glsl minecraft_mix_light with Lighting DIFFUSE_LIGHT_0/1, the overworld
// pair. Both directions and the normal are world space: vanilla transforms Normal by the pose (not the view), so the
// factor follows the posed part, per vertex, as entity.vsh computes it.
const unit = (x: number, y: number, z: number): [number, number, number] => { const l = Math.hypot(x, y, z); return [x / l, y / l, z / l]; };
export const ENTITY_LIGHT_0 = unit(0.2, 1, -0.7);
export const ENTITY_LIGHT_1 = unit(-0.2, 1, 0.7);
export const ENTITY_LIGHT_POWER = 0.6, ENTITY_AMBIENT_LIGHT = 0.4;
/** minecraft_mix_light's factor for a world-space unit normal. */
export function entityLight(n: readonly [number, number, number]): number {
  const a = ENTITY_LIGHT_0[0] * n[0] + ENTITY_LIGHT_0[1] * n[1] + ENTITY_LIGHT_0[2] * n[2];
  const b = ENTITY_LIGHT_1[0] * n[0] + ENTITY_LIGHT_1[1] * n[1] + ENTITY_LIGHT_1[2] * n[2];
  return Math.min(1, (Math.max(0, a) + Math.max(0, b)) * ENTITY_LIGHT_POWER + ENTITY_AMBIENT_LIGHT);
}

const glslVec = (v: readonly number[]) => `vec3( ${v.map(x => x.toFixed(8)).join(', ')} )`;
const mix = (sign: string) => `min( 1.0, ( max( 0.0, ${sign}entityL.x ) + max( 0.0, ${sign}entityL.y ) ) * ${ENTITY_LIGHT_POWER.toFixed(1)} + ${ENTITY_AMBIENT_LIGHT.toFixed(1)} )`;
const VARYINGS = 'varying float vEntityLightFront;\nvarying float vEntityLightBack;\n';
/** entity.vsh PER_FACE_LIGHTING: front and back factors from the world-space normal; entity.fsh picks by facing.
 *  Vanilla multiplies the sRGB texel by the factor (no linearisation anywhere in its pipeline); three decodes the texture
 *  to linear, so the fragment re-encodes to sRGB, multiplies, and decodes again: exact, not a gamma approximation. */
function injectEntityLight(shader: THREE.WebGLProgramParametersWithUniforms) {
  shader.vertexShader = VARYINGS + shader.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
  vec3 entityN = normalize( mat3( modelMatrix ) * normal );
  vec2 entityL = vec2( dot( ${glslVec(ENTITY_LIGHT_0)}, entityN ), dot( ${glslVec(ENTITY_LIGHT_1)}, entityN ) );
  vEntityLightFront = ${mix('')};
  vEntityLightBack = ${mix('-')};`);
  shader.fragmentShader = VARYINGS + shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
  diffuseColor.rgb = sRGBTransferEOTF( vec4( sRGBTransferOETF( vec4( diffuseColor.rgb, 1.0 ) ).rgb * ( gl_FrontFacing ? vEntityLightFront : vEntityLightBack ), 1.0 ) ).rgb;`);
}

const entityCache = new Map<string, THREE.MeshBasicMaterial>();
/** Shared entity material (RenderPipelines.ENTITY_TRANSLUCENT: ALPHA_CUTOUT 0.1, PER_FACE_LIGHTING, no culling), fogged.
 *  The outer (hat/sleeve) layer blends; the inner layer is drawn opaque above the cutout so it never needs sorting. */
export function entityMaterial(texture: THREE.Texture, layer: 'inner' | 'outer'): THREE.MeshBasicMaterial {
  const key = `${texture.uuid}|${layer}`;
  let m = entityCache.get(key);
  if (!m) {
    texture.magFilter = texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    m = new THREE.MeshBasicMaterial({ map: texture, fog: true, alphaTest: 0.1, side: THREE.DoubleSide, transparent: layer === 'outer' });
    m.onBeforeCompile = injectEntityLight;
    m.customProgramCacheKey = () => 'mc-entity-light';
    entityCache.set(key, m);
  }
  return m;
}
