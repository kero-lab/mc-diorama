// tests/environment.test.ts: vanilla noon, plains, render distance 12 (VANILLA-RENDER.md §8).
import { describe, expect, it } from 'vitest';
import { VANILLA_NOON, skyColorAt } from '../src/scene/environment';

const hex = (c: [number, number, number]) => '#' + c.map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
describe('vanilla noon', () => {
  it('fog and clear colour at RD 12', () => {
    expect(VANILLA_NOON.clearColor).toBe('#b5d0ff');
    expect(VANILLA_NOON.fog).toEqual({ color: '#b5d0ff', near: 172.8, far: 192 });
  });
  it('sky: horizon and below are the fog colour; the zenith is fogged too (disc at y=16 → d=16)', () => {
    expect(hex(skyColorAt(0))).toBe('#b5d0ff');
    expect(hex(skyColorAt(-0.3))).toBe('#b5d0ff');
    const f = 16 / 192, sky = [0x78, 0xa7, 0xff], fog = [0xb5, 0xd0, 0xff];
    const want = '#' + sky.map((s, i) => Math.round(s + (fog[i] - s) * f).toString(16).padStart(2, '0')).join('');
    expect(hex(skyColorAt(Math.PI / 2))).toBe(want);
  });
  it('blends by the cylindrical fog distance to the sky disc', () => {
    // elevation 30°: disc at y=16 → xz = 16/tan30 = 27.7 → factor 27.7/192 ≈ 0.144
    const c = skyColorAt(Math.PI / 6);
    expect(c[0]).toBeCloseTo((0x78 + (0xb5 - 0x78) * 0.1443) / 255, 2);
  });
});

describe('sky shaders', () => {
  it('every #include starts its own line (three only expands includes at line start)', async () => {
    const { skyVertex, skyFragment } = await import('../src/scene/environment');
    for (const src of [skyVertex, skyFragment]) {
      for (const line of src.split('\n')) if (line.includes('#include')) expect(line.startsWith('#include')).toBe(true);
    }
    expect(skyFragment).toContain('#include <colorspace_fragment>');
  });
});
