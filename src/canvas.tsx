'use client';
import type { RefObject } from 'react';
import { RenderFrameContext } from './render-clock';
import { Canvas } from '@react-three/fiber';
import type { FrameState } from './frame';
import type { CameraId } from './registry/cameras';
import type { CustomCameraParams } from './registry/custom-camera';
import type { LayerDef } from './registry/layers';
import { CourseField } from './scene/course-field';
import { EnvironmentView, VANILLA_NOON } from './scene/environment';
import { CameraRig } from './scene/camera-rig';
import { EntityModel } from './scene/entity-model';
import { PlayerModel } from './scene/player-model';
import type { Timeline } from './types';

export interface DioramaCanvasProps { tl: Timeline; frame: FrameState; camera: CameraId; custom?: CustomCameraParams; rotation: 0 | 1 | 2 | 3; xray: boolean; reducedMotion: boolean; layer: LayerDef; selected: number | null; active: boolean; timeScale: { current: number }; renderFrame: RefObject<FrameState> }

/** The 3D view. `flat`: NoToneMapping, as vanilla (R3F defaults to ACES). Decorative for screen readers (every number is in the DOM). Renders on demand unless playing. */
export default function DioramaCanvas(p: DioramaCanvasProps) {
  const { frame, layer: { Scene } } = p;
  return (
    <Canvas aria-hidden='true' flat frameloop={p.active ? 'always' : 'demand'} dpr={[1, 2]} gl={{ antialias: true, alpha: false }} className='!absolute inset-0'>
      <RenderFrameContext.Provider value={p.renderFrame}>
      <EnvironmentView env={VANILLA_NOON} />
      <CameraRig id={p.camera} custom={p.custom} tl={p.tl} frame={frame} rotation={p.rotation} reducedMotion={p.reducedMotion} timeScale={p.timeScale} />
      <CourseField blocks={frame.blocks} />
      {frame.rem && p.camera !== 'first' && <PlayerModel samples={p.tl.samples} T={frame.T} reducedMotion={p.reducedMotion} />}
      {frame.entities.map(e => e.pose && <EntityModel key={e.id} kind={e.kind} pose={e.pose} />)}
      <Scene tl={p.tl} frame={frame} xray={p.xray} selected={p.selected} />
      </RenderFrameContext.Provider>
    </Canvas>
  );
}
