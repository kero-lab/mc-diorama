import { useRef, type KeyboardEvent, type PointerEvent, type WheelEvent } from 'react';
import { orbit, type CustomCameraParams } from './registry/custom-camera';

const KEY_STEP_PX = 10;
/** A transparent layer over the 3D view while the custom camera is active: drag to orbit, wheel to zoom, keys for both. */
export function OrbitSurface({ value, onChange }: { value: CustomCameraParams; onChange(p: CustomCameraParams): void }) {
  const drag = useRef<{ id: number; x: number; y: number; base: CustomCameraParams } | null>(null);
  const down = (e: PointerEvent<HTMLDivElement>) => { e.currentTarget.setPointerCapture?.(e.pointerId); drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, base: value }; };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current; if (!d || d.id !== e.pointerId) return;
    onChange(orbit(d.base, { dx: e.clientX - d.x, dy: e.clientY - d.y }));
  };
  const up = () => { drag.current = null; };
  const wheel = (e: WheelEvent<HTMLDivElement>) => { onChange(orbit(value, { zoomSteps: Math.sign(e.deltaY) })); };
  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    const k: Record<string, Parameters<typeof orbit>[1]> = {
      ArrowLeft: { dx: -KEY_STEP_PX }, ArrowRight: { dx: KEY_STEP_PX }, ArrowUp: { dy: -KEY_STEP_PX }, ArrowDown: { dy: KEY_STEP_PX },
      '+': { zoomSteps: -1 }, '=': { zoomSteps: -1 }, '-': { zoomSteps: 1 },
    };
    const d = k[e.key]; if (!d) return;
    e.preventDefault(); onChange(orbit(value, d));
  };
  return (
    <div role='application' aria-label='Custom camera: drag or use arrow keys to orbit, scroll or +/- to zoom' tabIndex={0}
      className='absolute inset-0 cursor-grab touch-none outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing'
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onWheel={wheel} onKeyDown={key} />
  );
}
