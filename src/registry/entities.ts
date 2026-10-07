import type { Vec3T } from '../model';

export interface EntityDef { kind: string; label: string; model: 'rem' | 'box'; size: Vec3T; color: string; known: boolean }
const DEFS: Record<string, Omit<EntityDef, 'kind' | 'known'>> = {
  rem: { label: 'Rem', model: 'rem', size: [0.6, 1.8, 0.6], color: '#5b8def' },
};
/** A later activity registers boats, TNT, arrows here; until then they render as a labelled box. */
export function entityDef(kind: string): EntityDef {
  const d = Object.hasOwn(DEFS, kind) ? DEFS[kind] : undefined;
  return d ? { kind, known: true, ...d } : { kind, known: false, label: kind.replace(/_/g, ' '), model: 'box', size: [0.8, 0.8, 0.8], color: '#9ca3af' };
}
