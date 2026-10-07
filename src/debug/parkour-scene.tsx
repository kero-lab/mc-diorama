'use client';
import { useReducedMotion } from '../use-reduced-motion';
import { Html, Line } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useContext, useEffect, useLayoutEffect, useMemo } from 'react';
import { BufferGeometry, Float32BufferAttribute, Line as ThreeLine, LineDashedMaterial } from 'three';
import type { Vec3T } from '../model';
import { RenderFrameContext } from '../render-clock';
import type { LayerSceneProps } from '../registry/layers';
import { LandingPuff, PUFF_MS } from '../scene/landing-puff';
import { marginBand } from '../layers/parkour/derive';
import { useXrayPaths } from './paths';

const BAND = { green: '#22c55e', amber: '#f59e0b', red: '#ef4444', none: '#9ca3af' } as const;

/** Route waypoints grouped by cell, numbered in route order: a door toggled open and shut again is one label "1 · 3 toggle",
 *  not two labels on top of each other. Fixed pixel size (no distanceFactor: under the ortho camera it scales by zoom). */
function routeStops(ws: readonly { kind: string; at: Vec3T }[]): { key: string; at: Vec3T; toggle: boolean; label: string }[] {
  const stops = new Map<string, { at: Vec3T; n: number[]; kinds: string[] }>();
  ws.forEach((w, n) => {
    const key = w.at.join(',');
    const s = stops.get(key) ?? { at: w.at, n: [], kinds: [] };
    s.n.push(n + 1);
    if (!s.kinds.includes(w.kind)) s.kinds.push(w.kind);
    stops.set(key, s);
  });
  return [...stops].map(([key, s]) => ({ key, at: s.at, toggle: s.kinds.includes('toggle'), label: `${s.n.join(' · ')} ${s.kinds.join('/')}` }));
}

/** The interpolated stretch: a thin dotted line from the last sample to where she is drawn now. It moves every frame, so it
 *  is ONE line whose two vertices are rewritten in place (no geometry or material is created per frame). */
function InterpLine({ from, to }: { from: Vec3T | null; to: Vec3T | null }) {
  const renderFrame = useContext(RenderFrameContext);
  const invalidate = useThree(s => s.invalidate);
  const line = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(6, 3));
    g.setAttribute('lineDistance', new Float32BufferAttribute(2, 1));
    return new ThreeLine(g, new LineDashedMaterial({ color: '#fbcfe8', dashSize: 0.05, gapSize: 0.05 }));
  }, []);
  useEffect(() => () => { line.geometry.dispose(); (line.material as LineDashedMaterial).dispose(); }, [line]);
  const update = (from: Vec3T | null, to: Vec3T | null) => {
    line.visible = from !== null && to !== null;
    if (from && to) {
      const pos = line.geometry.getAttribute('position') as Float32BufferAttribute;
      pos.setXYZ(0, from[0], from[1], from[2]);
      pos.setXYZ(1, to[0], to[1], to[2]);
      pos.needsUpdate = true;
      line.geometry.computeBoundingSphere();
      const distance = line.geometry.getAttribute('lineDistance') as Float32BufferAttribute;
      distance.setX(0, 0);
      distance.setX(1, Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]));
      distance.needsUpdate = true;
    }
  };
  useFrame(() => {
    if (!renderFrame) return;
    const r = renderFrame.current.rem;
    if (!r || (r.mode !== "interp" && r.mode !== "linear")) { line.visible = false; return; }
    const sample = renderFrame.current.sampledFrom;
    update(sample ? [sample[0], sample[1] + 0.05, sample[2]] : null, [r.p[0], r.p[1] + 0.05, r.p[2]]);
  });
  useLayoutEffect(() => {
    update(from, to);
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the coordinates stand in for the (per-render) from/to arrays
  }, [line, from?.[0], from?.[1], from?.[2], to?.[0], to?.[1], to?.[2], invalidate]);
  return <primitive object={line} />;
}

/** Recorded samples share one GPU buffer/material instead of one mesh each. */
function SampleDots({ track }: { track: Vec3T[] }) {
  const positions = useMemo(() => new Float32Array(track.flat()), [track]);
  return <points frustumCulled={false}><bufferGeometry><bufferAttribute attach='attributes-position' args={[positions, 3]} /></bufferGeometry><pointsMaterial color='#f472b6' size={0.1} sizeAttenuation /></points>;
}

/** Show: landing puffs. X-ray (spec §4.5), drawn so the three kinds of path never look alike:
 *  - sampled track: solid pink line with a dot per real sample, broken at gaps and resets;
 *  - interpolated: a thin dotted line from the last sample to where she is drawn now (only while interpolating);
 *  - planned: dashed blue ghosts;
 *  plus margin rings, the paste route numbered, and server corrections against the prediction.
 *  Every point array handed to a Line is memoised (see useXrayPaths): a new array would rebuild the line each frame. */
export function XrayParkourScene({ tl, frame, xray, selected }: LayerSceneProps) {
  const reducedMotion = useReducedMotion();
  const k = tl.layers.parkour, T = frame.T;
  const { track, runs, ghosts, corrections } = useXrayPaths(tl, T);
  const fresh = reducedMotion ? [] : k.jumps.filter(j => j.landedAt && j.t <= T && T - j.t < PUFF_MS);
  const puffs = fresh.map(j => <LandingPuff key={j.seq} at={j.landedAt!} age={T - j.t} bornAt={j.t} />);
  if (!xray) return <group>{puffs}</group>;
  const paste = k.pastes.filter(p => p.t <= T).at(-1);
  const rem = frame.rem;
  const interpolating = rem !== null && track.length > 0 && (rem.mode === 'interp' || rem.mode === 'linear');
  return (
    <group>
      {puffs}
      {runs.filter(r => r.length > 1).map((r, n) => <Line key={n} points={r} color='#f472b6' lineWidth={2} />)}
      <SampleDots track={track} />
      <InterpLine from={interpolating ? track.at(-1)! : null} to={interpolating ? [rem.p[0], rem.p[1] + 0.05, rem.p[2]] : null} />
      {ghosts.filter(g => g.path.length > 1).map(g => <Line key={g.key} points={g.path} color='#60a5fa' lineWidth={1.5} dashed dashSize={0.2} gapSize={0.12} transparent opacity={0.75} />)}
      {k.jumps.filter(j => j.landedAt && j.t <= T).map(j => (
        <mesh key={j.seq} position={[j.landedAt![0], j.landedAt![1] + 0.03, j.landedAt![2]]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.18, j.seq === selected ? 0.32 : 0.26, 28]} />
          <meshBasicMaterial color={BAND[marginBand(j.predictedMargin)]} transparent opacity={0.9} depthWrite={false} />
        </mesh>
      ))}
      {routeStops(paste?.route?.waypoints ?? []).map(st => (
        <group key={st.key} position={[st.at[0] + 0.5, st.at[1] + 1.1, st.at[2] + 0.5]}>
          <mesh><sphereGeometry args={[0.12, 10, 10]} /><meshBasicMaterial color={st.toggle ? '#a78bfa' : '#38bdf8'} transparent opacity={0.8} /></mesh>
          <Html center zIndexRange={[20, 0]} aria-hidden='true' style={{ pointerEvents: 'none' }}><span className='whitespace-nowrap rounded bg-background/85 px-1 text-[10px] font-medium tabular-nums text-foreground'>{st.label}</span></Html>
        </group>
      ))}
      {corrections.map(({ rec, seg }) => (
        <group key={`${rec.t}:${rec.seq}`}>
          <mesh position={rec.server}><sphereGeometry args={[0.09, 8, 8]} /><meshBasicMaterial color='#fb923c' /></mesh>
          {seg && <Line points={seg} color='#fb923c' lineWidth={1} />}
        </group>
      ))}
    </group>
  );
}
