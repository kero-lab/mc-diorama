'use client';
import { useContext, useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { FrameState } from '../frame';
import { CAMERAS, dampPose, direct, type CameraId, type CameraPose, type DirectorState } from '../registry/cameras';
import type { CustomCameraParams } from '../registry/custom-camera';
import { RenderFrameContext } from '../render-clock';
import type { Timeline } from '../types';

/** Drives the default camera from the camera registry every frame, damped (spec §4.3). In demand mode it keeps asking
 *  for frames until the camera has settled. `timeScale` reports the director's slow motion to the playback clock.
 *  The projection comes from the POSE, not the camera's definition: the cinematic entry is perspective, but under reduced
 *  motion it hands back the orthographic isometric pose. */
export function CameraRig({ id, custom, tl, frame, rotation, reducedMotion, timeScale }: { id: CameraId; custom?: CustomCameraParams; tl: Timeline; frame: FrameState; rotation: 0 | 1 | 2 | 3; reducedMotion: boolean; timeScale: { current: number } }) {
  const renderFrame = useContext(RenderFrameContext);
  const { camera, set, size, invalidate } = useThree();
  const ortho = useMemo(() => new THREE.OrthographicCamera(), []);
  const persp = useMemo(() => new THREE.PerspectiveCamera(), []);
  const pose = useRef<CameraPose | null>(null);
  const director = useRef<DirectorState | null>(null);
  // Demand mode: a new frame, camera or rotation needs a render even when no mesh changed (the rig itself draws nothing).
  useEffect(() => { invalidate(); }, [invalidate, frame, id, custom, rotation, reducedMotion, size.width, size.height]);
  useFrame((_, delta) => {
    const input = { frame: renderFrame?.current ?? frame, tl, rotation, reducedMotion, viewport: size };
    let next: CameraPose;
    if (id === 'cinematic') { const d = direct(director.current, input); director.current = d.state; next = d.pose; timeScale.current = d.timeScale; }
    else { director.current = null; next = CAMERAS[id].pose(input, id === 'custom' ? custom : undefined); timeScale.current = 1; }
    const p = dampPose(pose.current, next, Math.min(100, delta * 1000), reducedMotion, id === 'custom' && custom ? custom.smoothing : 250);
    pose.current = p;
    const cam = p.projection === 'ortho' ? ortho : persp;
    if (camera !== cam) set({ camera: cam });
    cam.position.set(...p.position);
    cam.up.set(...p.up);
    cam.lookAt(...p.target);
    if (cam instanceof THREE.OrthographicCamera) {
      Object.assign(cam, { zoom: p.zoom, left: -size.width / 2, right: size.width / 2, top: size.height / 2, bottom: -size.height / 2, near: -1000, far: 1000 });
    } else Object.assign(cam, { fov: p.fov, aspect: size.width / Math.max(1, size.height), near: 0.05, far: 500 });
    cam.updateProjectionMatrix();
    const distance = (a: number[], b: number[]) => Math.hypot(...a.map((x,i) => x-b[i]));
    const d = Math.max(distance(p.position,next.position), distance(p.target,next.target), distance(p.up,next.up), Math.abs(p.zoom-next.zoom), Math.abs(p.fov-next.fov));
    if (d > 1e-3) invalidate();
  });
  return null;
}
