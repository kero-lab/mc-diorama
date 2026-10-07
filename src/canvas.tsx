'use client';
import type { RefObject } from 'react';
import { RenderFrameContext } from './render-clock';
import { Canvas } from '@react-three/fiber';
import type { FrameState } from './frame';
import type { CameraId } from './registry/cameras';
import type { CustomCameraParams } from './registry/custom-camera';
import type { LayerDef } from './registry/layers';
import { BlocksField } from './scene/blocks-field';
import { CameraRig } from './scene/camera-rig';
import { EntityModel, RemModel } from './scene/rem-model';
import type { Timeline } from './types';

export interface DioramaCanvasProps { tl: Timeline; frame: FrameState; camera: CameraId; custom?: CustomCameraParams; rotation: 0 | 1 | 2 | 3; xray: boolean; reducedMotion: boolean; layer: LayerDef; selected: number | null; active: boolean; timeScale: { current: number }; renderFrame: RefObject<FrameState> }

/** The 3D view. Decorative for screen readers (every number is in the DOM). Renders on demand unless playing. */
export default function DioramaCanvas(p: DioramaCanvasProps) {
  const { frame, layer: { Scene } } = p;
  return (
    <Canvas aria-hidden='true' frameloop={p.active ? 'always' : 'demand'} dpr={[1, 2]} gl={{ antialias: true, alpha: true }} className='!absolute inset-0'>
      <RenderFrameContext.Provider value={p.renderFrame}>
      <ambientLight intensity={0.75} />
      <directionalLight position={[12, 24, 8]} intensity={1.1} />
      <hemisphereLight args={['#dbeafe', '#3f3f46', 0.35]} />
      <CameraRig id={p.camera} custom={p.custom} tl={p.tl} frame={frame} rotation={p.rotation} reducedMotion={p.reducedMotion} timeScale={p.timeScale} />
      <BlocksField tl={p.tl} blocks={frame.blocks} index={frame.blockIndex} focus={frame.rem?.p ?? null} heading={frame.heading} T={frame.T} reducedMotion={p.reducedMotion} />
      {frame.rem && p.camera !== 'first' && <RemModel samples={p.tl.samples} pose={frame.rem} T={frame.T} reducedMotion={p.reducedMotion} />}
      {frame.entities.map(e => e.pose && <EntityModel key={e.id} kind={e.kind} pose={e.pose} />)}
      <Scene tl={p.tl} frame={frame} xray={p.xray} selected={p.selected} />
      </RenderFrameContext.Provider>
    </Canvas>
  );
}
