'use client';
import { useMemo } from 'react';
import { useReducedMotion } from '../../use-reduced-motion';
import type { LayerSceneProps } from '../../registry/layers';
import { LandingPuff, PUFF_MS } from '../../scene/landing-puff';

/** Public: landing puffs only. The X-ray (paths, plans, corrections) lives in src/debug (spec §3.1). */
export function ParkourScene({ tl, frame }: LayerSceneProps) {
  const reducedMotion = useReducedMotion();
  const k = tl.layers.parkour, T = frame.T;
  const fresh = reducedMotion ? [] : k.jumps.filter(j => j.landedAt && j.t <= T && T - j.t < PUFF_MS);
  const puffs = fresh.map(j => <LandingPuff key={j.seq} at={j.landedAt!} age={T - j.t} bornAt={j.t} />);
  return <group>{puffs}</group>;
}
