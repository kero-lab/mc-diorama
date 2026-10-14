'use client';
// src/scene/particles.tsx: particlesAt drawn as camera-facing quads (FacingCameraMode.LOOKAT_XYZ), one InstancedMesh per
// particle texture, fixed pools. particlesAt runs ONCE per frame, in the parent's useFrame at priority -1 (R3F runs lower
// numbers first; negative keeps automatic rendering), and the pools read its result from a ref. No other per-frame allocation.
// Lit like vanilla terrain particles under full daylight: TerrainParticle colour 0.6 × lightmap 1, no directional shade
// (particle.vsh/fsh). The 0.6 goes through the same sRGB→linear mapping as the unlit terrain's baked colours.
import { useEffect, useContext, useMemo, useRef, type RefObject } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { useDioramaHost } from '../host';
import { RenderFrameContext } from '../render-clock';
import bundle from '../registry/vanilla-blocks.json';
import type { Timeline, WorldBlock } from '../types';
import { MAX_PARTICLES, particlesAt, particleTexture, type Particle } from '../vanilla/particles';

const TEXTURES = [...new Set([...Object.values((bundle as unknown as { particles: Record<string, string> }).particles), particleTexture('')])];
const QUAD = new THREE.PlaneGeometry(2, 2);   // corners ±1 × quadSize (QuadParticleRenderState#renderRotatedQuad)
const TINT = new THREE.Color().setRGB(0.6, 0.6, 0.6, THREE.SRGBColorSpace);

/** Per-instance quarter window of the sprite. TerrainParticle: U0 = (uo+1)/4 at local x −1, U1 = uo/4 at x +1 (u flipped);
 *  V0 = vo/4 at the top. three's TextureLoader flips Y, so the window's bottom edge is 1 − v − 0.25. */
function inject(shader: THREE.WebGLProgramParametersWithUniforms) {
  shader.vertexShader = shader.vertexShader
    .replace('#include <uv_pars_vertex>', '#include <uv_pars_vertex>\nattribute vec2 particleWindow;')
    .replace('#include <uv_vertex>', '#include <uv_vertex>\nvMapUv = vec2( particleWindow.x + ( 1.0 - uv.x ) * 0.25, particleWindow.y + uv.y * 0.25 );');
}

function Pool({ texture, live }: { texture: string; live: RefObject<Particle[]> }) {
  const { assetBase } = useDioramaHost();
  const loaded = useLoader(THREE.TextureLoader, `${assetBase}/1.21.11/${texture}.png`);
  const ref = useRef<THREE.InstancedMesh>(null);
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), s: new THREE.Vector3(), p: new THREE.Vector3() }), []);
  // A clone: the loader's texture is shared with the terrain, whose filters must not change under it.
  const material = useMemo(() => {
    const map = loaded.clone();
    map.magFilter = map.minFilter = THREE.NearestFilter; map.generateMipmaps = false; map.colorSpace = THREE.SRGBColorSpace; map.needsUpdate = true;
    // RenderPipelines.TRANSLUCENT_PARTICLE (Layer.TERRAIN): blended, particle.fsh discards alpha < 0.1; fogged
    const m = new THREE.MeshBasicMaterial({ map, color: TINT, alphaTest: 0.1, transparent: true, fog: true });
    m.onBeforeCompile = inject;
    return m;
  }, [loaded]);
  const [geometry, windows] = useMemo(() => {
    const g = QUAD.clone(), w = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PARTICLES * 2), 2);
    w.setUsage(THREE.DynamicDrawUsage); g.setAttribute('particleWindow', w);
    return [g, w] as const;
  }, []);
  useEffect(() => () => { geometry.dispose(); material.map?.dispose(); material.dispose(); }, [geometry, material]);
  useFrame(({ camera }) => {
    const mesh = ref.current;
    if (!mesh) return;
    const uv = windows.array as Float32Array;
    let n = 0;
    for (const p of live.current) {
      if (p.texture !== texture) continue;
      tmp.p.set(p.p[0], p.p[1], p.p[2]); tmp.s.setScalar(p.size);
      tmp.m.compose(tmp.p, camera.quaternion, tmp.s); mesh.setMatrixAt(n, tmp.m);
      uv[n * 2] = p.u; uv[n * 2 + 1] = 1 - p.v - 0.25; n++;
    }
    mesh.count = n; mesh.instanceMatrix.needsUpdate = true; windows.needsUpdate = true;
  });
  return <instancedMesh ref={ref} args={[geometry, material, MAX_PARTICLES]} frustumCulled={false} />;
}

/** `blocks`: the current frame's blocks (particle source blocks are looked up there, see vanilla/particles.ts). */
export function Particles({ tl, T, blocks }: { tl: Timeline; T: number; blocks: readonly WorldBlock[] }) {
  const frame = useContext(RenderFrameContext);
  const live = useRef<Particle[]>([]);
  useFrame(() => {
    const f = frame?.current;
    live.current = particlesAt(tl, f?.T ?? T, f?.blocks ?? blocks);
  }, -1);
  return <>{TEXTURES.map(t => <Pool key={t} texture={t} live={live} />)}</>;
}
