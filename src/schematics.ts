import manifest from '../assets/minecraft/1.21.11/schematics/manifest.json';

export interface SchematicEntry { name: string; description: string; file: string; blueprint: string; dataSha: string; tags: string[] }
const entries = manifest.entries as Record<string, SchematicEntry>;
const DIR = '1.21.11/schematics';

/** Names are presentation metadata; ids stay the API/recording keys. A supplied stale sha never resolves (RemHub's rule). */
export function schematicLabel(id?: string | null, dataSha?: string): SchematicEntry | null {
  if (!id || !Object.hasOwn(entries, id)) return null;
  const e = entries[id];
  return dataSha !== undefined && e.dataSha !== dataSha ? null : e;
}
export function schematicName(id?: string | null, dataSha?: string): string { return schematicLabel(id, dataSha)?.name ?? 'Unknown schematic'; }
/** The preview image, relative to the host's assetBase. */
export function schematicPreview(id?: string | null): string | null { const e = schematicLabel(id); return e ? `${DIR}/${e.file}` : null; }
