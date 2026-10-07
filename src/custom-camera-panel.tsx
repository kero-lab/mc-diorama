'use client';
import type { ReactNode } from 'react';
import { CUSTOM_LIMITS, sanitizeCustom, type CustomCameraParams } from './registry/custom-camera';

type NumField = 'yaw' | 'pitch' | 'distance' | 'height' | 'fov' | 'smoothing' | 'lookAhead';
const NUMERIC: { field: NumField; label: string; range: readonly [number, number]; step: number }[] = [
  { field: 'yaw', label: 'Yaw', range: [-Math.PI, Math.PI], step: 0.01 },
  { field: 'pitch', label: 'Pitch', range: CUSTOM_LIMITS.pitch, step: 0.01 },
  { field: 'distance', label: 'Distance', range: CUSTOM_LIMITS.distance, step: 0.5 },
  { field: 'height', label: 'Height', range: CUSTOM_LIMITS.height, step: 0.5 },
  { field: 'fov', label: 'Field of view', range: CUSTOM_LIMITS.fov, step: 1 },
  { field: 'smoothing', label: 'Smoothing', range: CUSTOM_LIMITS.smoothing, step: 50 },
  { field: 'lookAhead', label: 'Look ahead', range: CUSTOM_LIMITS.lookAhead, step: 0.5 },
];

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <label className='grid gap-1'><span>{label}</span>{children}</label>
);

/** A plain form for every custom-camera field; each change emits sanitised params. */
export function CustomCameraPanel({ value, onChange, className }: { value: CustomCameraParams; onChange(p: CustomCameraParams): void; className?: string }) {
  const set = (patch: Partial<CustomCameraParams>) => onChange(sanitizeCustom({ ...value, ...patch }));
  return (
    <div className={`grid gap-3 text-sm${className ? ` ${className}` : ''}`}>
      <Row label='Anchor'>
        <select value={value.anchor} onChange={e => set({ anchor: e.target.value as CustomCameraParams['anchor'] })}>
          <option value='rem'>Follow Rem</option><option value='next_jump'>Next jump</option>{value.world && <option value='world'>Fixed point</option>}
        </select>
      </Row>
      {NUMERIC.map(({ field, label, range, step }) => (
        <Row key={field} label={label}>
          <span className='flex items-center gap-2'>
            <input type='range' className='w-full accent-[var(--rem,currentColor)]' min={range[0]} max={range[1]} step={step} value={value[field]}
              onChange={e => set({ [field]: Number(e.target.value) })} />
            <span className='tabular-nums'>{Number(value[field].toFixed(2))}</span>
          </span>
        </Row>
      ))}
      <Row label='Lock roll'>
        <input type='checkbox' checked={value.lockRoll} onChange={e => set({ lockRoll: e.target.checked })} />
      </Row>
      <Row label='Projection'>
        <select value={value.projection} onChange={e => set({ projection: e.target.value as CustomCameraParams['projection'] })}>
          <option value='persp'>Perspective</option><option value='ortho'>Flat</option>
        </select>
      </Row>
    </div>
  );
}
