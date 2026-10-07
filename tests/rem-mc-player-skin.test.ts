import { describe, expect, it } from 'vitest';
import { skinBox } from '../src/scene/player-skin';

describe('Minecraft player skin UVs', () => {
  it('maps the head front to the face, not the hat or back', () => {
    const geometry = skinBox(8, 8, 8, 0, 0);
    const uv = geometry.getAttribute('uv');
    expect([uv.getX(16), uv.getY(16)]).toEqual([8 / 64, 1 - 8 / 64]);
    expect([uv.getX(19), uv.getY(19)]).toEqual([16 / 64, 1 - 16 / 64]);
    geometry.dispose();
  });
  it('inflates the outer layer without changing its texture footprint', () => {
    const base = skinBox(3, 12, 4, 40, 32), outer = skinBox(3, 12, 4, 40, 32, 0.5);
    expect(outer.getAttribute('uv').array).toEqual(base.getAttribute('uv').array);
    expect(outer.parameters.width).toBe(3.5);
    for (const value of outer.getAttribute('uv').array) expect(value).toBeGreaterThanOrEqual(0);
    for (const value of outer.getAttribute('uv').array) expect(value).toBeLessThanOrEqual(1);
    base.dispose(); outer.dispose();
  });
});
