import { CAMERA_IDS, type CameraId } from './registry/cameras';
import { DEFAULT_CUSTOM, sanitizeCustom, type CustomCameraParams } from './registry/custom-camera';

export interface DioramaPrefs { camera: CameraId; xray: boolean; rotation: 0 | 1 | 2 | 3; custom: CustomCameraParams }
export const DEFAULT_PREFS: DioramaPrefs = { camera: 'iso', xray: false, rotation: 0, custom: DEFAULT_CUSTOM };
const ROTATIONS = [0, 1, 2, 3] as const;
/** Per viewer, per browser (spec §4.6). Storage can be absent or throw (private windows, blocked site data): defaults then. */
export function readPrefs(key: string): DioramaPrefs {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? 'null') as Partial<DioramaPrefs> | null;
    if (!v || typeof v !== 'object') return DEFAULT_PREFS;
    return {
      camera: CAMERA_IDS.includes(v.camera as CameraId) ? (v.camera as CameraId) : DEFAULT_PREFS.camera,
      xray: v.xray === true,
      rotation: ROTATIONS.find(r => r === v.rotation) ?? DEFAULT_PREFS.rotation,
      custom: sanitizeCustom(v.custom),
    };
  } catch { return DEFAULT_PREFS; }
}
export function writePrefs(key: string, p: DioramaPrefs): void { try { localStorage.setItem(key, JSON.stringify(p)); } catch { /* a convenience only */ } }
