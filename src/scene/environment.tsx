'use client';
// src/scene/environment.tsx: the environment slot (spec §3.1, A7). Sky, sun, fog and clear colour are one replaceable
// unit; 0.4.0 ships only vanilla noon. Effect layers (part C) add environments here, never in the blocks or Rem.
import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useDioramaHost } from '../host';

export interface Environment { id: string; clearColor: string; fog: { color: string; near: number; far: number }; Sky: ComponentType }

// Biome#getSkyColor plains 0x78A7FF; fog 0xC0D8FF blended toward the sky by render distance
// (AtmosphericFogEnvironment#getBaseColor, RD 12 → #B5D0FF); FogRenderer#setupFog end = rd*16, start = end - clamp(end/10, 4, 64).
const SKY = [0x78 / 255, 0xa7 / 255, 0xff / 255] as const, FOG = [0xb5 / 255, 0xd0 / 255, 0xff / 255] as const;
const RD = 12, FOG_END = RD * 16, FOG_START = FOG_END - Math.min(64, Math.max(4, FOG_END / 10)), SKY_END = Math.min(RD * 16, 512);

/** The sky colour seen at an elevation (radians): the sky disc at y = 16 above the eye, fogged 0..SKY_END by the
 *  cylindrical distance max(|xz|, |y|) (LevelRenderer sky pass). Below the horizon: the fog colour. */
export function skyColorAt(elevation: number): [number, number, number] {
  if (elevation <= 0) return [...FOG];
  const xz = 16 / Math.tan(elevation), d = Math.max(xz, 16), f = Math.min(1, d / SKY_END);
  return [0, 1, 2].map(i => SKY[i] + (FOG[i] - SKY[i]) * f) as [number, number, number];
}

export const skyVertex = `varying vec3 vDir; void main() { vDir = normalize((modelMatrix * vec4(position, 0.0)).xyz); gl_Position = projectionMatrix * viewMatrix * vec4((modelMatrix * vec4(position, 1.0)).xyz, 1.0); gl_Position.z = gl_Position.w; }`;
export const skyFragment = `varying vec3 vDir; uniform vec3 sky; uniform vec3 fog; uniform float skyEnd;
void main() { float e = asin(clamp(vDir.y, -1.0, 1.0)); vec3 c = fog;
  if (e > 0.0) { float d = max(16.0 / tan(e), 16.0); c = mix(sky, fog, min(1.0, d / skyEnd)); }
  gl_FragColor = vec4(c, 1.0);
#include <colorspace_fragment>
}`;

/** The sun's texture, loaded WITHOUT suspending: null until it arrives, and for good if it fails. The sun is decoration on
 *  top of the sky gradient, so it must never hold the sky back (a useLoader suspension that reaches R3F's root boundary
 *  unmounts the root and loses the WebGL context, #2184 Task 11) and a missing file must not throw into the Canvas. */
function useSunTexture(url: string): THREE.Texture | null {
  const [sun, setSun] = useState<THREE.Texture | null>(null);
  const invalidate = useThree(s => s.invalidate);
  useEffect(() => {
    let live = true, loaded: THREE.Texture | null = null;
    new THREE.TextureLoader().load(url, t => {
      if (!live) { t.dispose(); return; }
      t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true;
      loaded = t; setSun(t); invalidate();   // frameloop 'demand': draw the frame that shows it
    }, undefined, () => { /* no sun: the sky stays as it is */ });
    return () => { live = false; loaded?.dispose(); };
  }, [url, invalidate]);
  return sun;
}

function VanillaSky() {
  const { assetBase } = useDioramaHost();
  const sun = useSunTexture(`${assetBase}/1.21.11/environment/sun.png`);
  const camera = useThree(s => s.camera);
  const group = useRef<THREE.Group>(null);
  const material = useMemo(() => new THREE.ShaderMaterial({ vertexShader: skyVertex, fragmentShader: skyFragment, depthWrite: false, side: THREE.BackSide, fog: false,
    uniforms: { sky: { value: new THREE.Color().setRGB(...SKY, THREE.SRGBColorSpace) }, fog: { value: new THREE.Color().setRGB(...FOG, THREE.SRGBColorSpace) }, skyEnd: { value: SKY_END } } }), []);
  useEffect(() => () => material.dispose(), [material]);
  // R3F's `position={vector}` COPIES once at render (applyProps → target.copy), it does not bind the object, so the sky
  // follows the camera with a per-frame copy (no allocation). Before the first frame it sits at the origin.
  useFrame(() => { group.current?.position.copy(camera.position); });
  // LevelRenderer: sun quad ±30 at distance 100, overhead at noon (sun angle 0 at tick 6000), additive.
  return <group ref={group} renderOrder={-1}>
    <mesh material={material} frustumCulled={false} renderOrder={-2}><sphereGeometry args={[400, 32, 16]} /></mesh>
    {sun && <mesh position={[0, 100, 0]} rotation={[Math.PI / 2, 0, 0]} renderOrder={-1} frustumCulled={false}>
      <planeGeometry args={[60, 60]} /><meshBasicMaterial map={sun} transparent blending={THREE.AdditiveBlending} depthWrite={false} fog={false} side={THREE.DoubleSide} />
    </mesh>}
  </group>;
}

export const VANILLA_NOON: Environment = { id: 'vanilla-noon', clearColor: '#b5d0ff', fog: { color: '#b5d0ff', near: FOG_START, far: FOG_END }, Sky: VanillaSky };

/** Applies an environment to the scene: clear colour, linear fog, sky. The sky follows the camera every frame. */
export function EnvironmentView({ env }: { env: Environment }) {
  const scene = useThree(s => s.scene);
  useEffect(() => {
    scene.background = new THREE.Color(env.clearColor);
    scene.fog = new THREE.Fog(env.fog.color, env.fog.near, env.fog.far);
    return () => { scene.background = null; scene.fog = null; };
  }, [scene, env]);
  const { Sky } = env;
  return <Sky />;
}
