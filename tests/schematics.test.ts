import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import manifest from '../assets/minecraft/1.21.11/schematics/manifest.json';
import { schematicLabel, schematicName, schematicPreview } from '../src/index';

const ids = Object.keys(manifest.entries);
describe('schematic catalogue', () => {
  it('has the 35 validated schematics, each with a preview file on disk', () => {
    expect(ids.length).toBe(35);
    for (const id of ids) expect(existsSync(join(__dirname, '../assets/minecraft', schematicPreview(id)!))).toBe(true);
  });
  it('names resolve; a stale sha never does; unknown ids are "Unknown schematic"', () => {
    const [id] = ids; const e = manifest.entries[id as keyof typeof manifest.entries];
    expect(schematicName(id)).toBe(e.name);
    expect(schematicLabel(id, 'stale')).toBeNull();
    expect(schematicName('nope')).toBe('Unknown schematic');
    expect(schematicPreview(null)).toBeNull();
  });
  it('a prototype key is not a schematic', () => { expect(schematicLabel('__proto__')).toBeNull(); });
});
