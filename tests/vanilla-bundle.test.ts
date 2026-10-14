// tests/vanilla-bundle.test.ts: the extractor's additions (spec §3.2, §5).
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import bundle from '../src/registry/vanilla-blocks.json';

const b = bundle as unknown as { ambientOcclusion: Record<string, false>; particles: Record<string, string> };
describe('vanilla bundle additions', () => {
  it('records the models vanilla draws without smooth lighting', () => {
    expect(b.ambientOcclusion['block/ladder']).toBe(false);
    expect(b.ambientOcclusion['block/glass_pane_post']).toBe(false);
    expect(b.ambientOcclusion['block/oak_door_bottom_left']).toBe(false);
    expect(b.ambientOcclusion['block/oak_fence_post']).toBeUndefined();   // fences keep AO
    expect(b.ambientOcclusion['block/red_wool']).toBeUndefined();
  });
  it('names every block particle texture', () => {
    expect(b.particles.red_wool).toBe('block/red_wool');
    expect(b.particles.smooth_quartz).toBe('block/quartz_block_bottom');
    expect(b.particles.oak_fence).toBe('block/oak_planks');
    for (const name of Object.keys((bundle as { states: object }).states)) expect(b.particles[name], name).toMatch(/^block\//);
  });
  it('ships the sun', () => {
    expect(fs.existsSync(new URL('../assets/minecraft/1.21.11/environment/sun.png', import.meta.url))).toBe(true);
  });
});
