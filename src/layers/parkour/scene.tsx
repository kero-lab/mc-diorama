'use client';
import type { LayerSceneProps } from '../../registry/layers';

/** Public: nothing in the scene; the base is vanilla (spec 2026-10-14 A4). The X-ray (paths, plans, corrections) lives in src/debug (spec §3.1). */
export function ParkourScene(_: LayerSceneProps) {
  return null;
}
