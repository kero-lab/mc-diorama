import type { ComponentType } from 'react';
import { gapsOf, type FrameState } from '../frame';
import type { Timeline } from '../types';

export interface TimelineMarker { t: number; kind: 'paste' | 'slow_plan' | 'late_plan' | 'correction' | 'death' | 'gap' | 'reset' | 'truncated' | 'end'; label: string }
export interface LayerSceneProps { tl: Timeline; frame: FrameState; xray: boolean; selected: number | null }
export interface LayerOverlayProps { tl: Timeline; frame: FrameState }
export interface LayerPanelProps { tl: Timeline; frame: FrameState; xray: boolean; selected: number | null; onSelect(seq: number | null): void; onSeek(t: number): void }
/** One activity's contribution (spec §4.3): R3F scene parts, a DOM overlay on the canvas, DOM panels, timeline markers. */
export interface LayerDef { activity: string; label: string; Scene: ComponentType<LayerSceneProps>; Overlay: ComponentType<LayerOverlayProps>; Panels: ComponentType<LayerPanelProps>; markers(tl: Timeline): TimelineMarker[] }

const Nothing = () => null;
export const GENERIC_LAYER: LayerDef = { activity: '*', label: 'Run', Scene: Nothing, Overlay: Nothing, Panels: Nothing, markers: () => [] };
export function layerFor(activity: string, layers: Readonly<Record<string, LayerDef>>): LayerDef { return Object.hasOwn(layers, activity) ? layers[activity] : GENERIC_LAYER; }

/** Markers every activity shares: where the feed had a hole, where she was reset, where a truncated recording stops, the end. */
export function commonMarkers(tl: Timeline): TimelineMarker[] {
  const out: TimelineMarker[] = gapsOf(tl.samples).map(g => g.reset
    ? { t: g.from, kind: 'reset' as const, label: 'position reset (not interpolated)' }
    : { t: g.from, kind: 'gap' as const, label: `no samples for ${Math.round((g.to - g.from) / 100) / 10} s` });
  if (tl.truncated && tl.lastT !== null) out.push({ t: tl.lastT, kind: 'truncated', label: 'recording ends here' });
  else if (tl.endT !== null) out.push({ t: tl.endT, kind: 'end', label: `run ended: ${tl.ended?.reason ?? 'unknown'}` });
  return out;
}
