// tests/particles.test.ts: vanilla sprint dust and fall bursts (VANILLA-RENDER.md §7), on a real run.
import { describe, expect, it } from 'vitest';
import { blocksAt } from '../src/frame';
import { fallDistanceAt, MAX_PARTICLES, particlesAt, particleTexture } from '../src/vanilla/particles';
import { seedTimeline } from '../src/seed';
import { loadReal } from './fixtures/real';
import type { Timeline } from '../src/types';

const tl = seedTimeline({ events: loadReal('d1fae16b'), truncated: false, version: 1, lastId: null, runId: null });
/** Tests may ask blocksAt for any T; the renderer passes the current frame's blocks. */
const at = (t: Timeline, T: number) => particlesAt(t, T, blocksAt(t, T).blocks);
const sprinting = (c: string) => c.includes('s') && !c.includes('k');
/** A sprint sample on ground with a recorded block under her feet (the start platform is not in the recording). */
const dusty = (t: Timeline, from: number) => t.samples.findIndex((s, k) => k > from && sprinting(s.c) && s.g && s.v
  && blocksAt(t, s.t).blocks.some(b => b.at[0] === Math.floor(s.p[0]) && b.at[1] === Math.floor(s.p[1] - 0.2) && b.at[2] === Math.floor(s.p[2])));

describe('particles', () => {
  it('uses the block particle texture', () => {
    expect(particleTexture('red_wool')).toBe('block/red_wool');
    expect(particleTexture('oak_door')).toBe('block/oak_door_bottom');
  });

  it('same T, same particles (seek-safe)', () => {
    const T = tl.samples[dusty(tl, 1500)].t + 17;
    const a = at(tl, T);
    expect(a.length).toBeGreaterThan(0);
    expect(at(tl, T)).toEqual(a);
    at(tl, tl.samples[2500].t);                                       // render something else in between
    expect(at(tl, T)).toEqual(a);
  });

  it('sprinting on ground leaves dust with vanilla size and UV window', () => {
    const i = dusty(tl, 50);
    expect(i).toBeGreaterThan(0);
    const ps = at(tl, tl.samples[i].t + 10);
    expect(ps.length).toBeGreaterThan(0);
    for (const p of ps) {
      expect(p.size).toBeGreaterThanOrEqual(0.05); expect(p.size).toBeLessThan(0.1);   // 0.1·(r·0.5+0.5)·2 / 2
      expect(p.u).toBeGreaterThanOrEqual(0); expect(p.u).toBeLessThan(0.75);          // uo/4, uo = r·3
      expect(p.v).toBeGreaterThanOrEqual(0); expect(p.v).toBeLessThan(0.75);
    }
  });

  it('a particle is born at rest, moves, then is removed after its lifetime', () => {
    const i = dusty(tl, 50);
    const t0 = tl.samples[i].t;
    const birth = at(tl, t0), later = at(tl, t0 + 30);              // interval 0: xo = x = spawn, nothing moves
    expect(later.slice(-1)[0].p).toEqual(birth.slice(-1)[0].p);
    // 41 ticks on, every particle born at or before t0 is gone (lifetime <= 40, removed on tick lifetime + 1)
    const far = blocksAt(tl, t0 + 41 * 50 + 1).blocks;
    const keys = (ps: { p: number[] }[]) => new Set(ps.map(p => p.p.join()));
    const before = keys(at(tl, t0));
    const after = particlesAt(tl, t0 + 41 * 50 + 1, far);
    for (const p of after) expect(before.has(p.p.join())).toBe(false);
  });

  it('a fall of 4+ blocks bursts; the count follows vanilla', () => {
    // d1fae16b's longest fall is 3.25 blocks: power floor(0.25) = 0, no burst. 22dd4e13 has one of 6.66.
    const tl = seedTimeline({ events: loadReal('22dd4e13'), truncated: false, version: 1, lastId: null, runId: null });
    // fallDistance as the server counts it (Entity#checkFallDamage): downward travel since the last on-ground tick, the
    // landing tick's own movement excluded (LivingEntity#checkFallDamage reads it before super adds dy).
    let found = -1, fall = 0;
    for (let k = 1; k < tl.samples.length && found < 0; k++) {
      const s = tl.samples[k];
      if (!s.g || tl.samples[k - 1].g) continue;
      let d = 0;
      for (let j = k - 1; j >= 1; j--) { d += Math.max(0, tl.samples[j - 1].p[1] - tl.samples[j].p[1]); if (tl.samples[j - 1].g) break; }
      if (d > 4) { found = k; fall = d; }
    }
    expect(found).toBeGreaterThan(0);
    expect(fallDistanceAt(tl.samples, found)).toBeCloseTo(fall, 9);
    const power = Math.floor(fall + 1e-6 - 3), expected = Math.floor(150 * Math.min(0.2 + power / 15, 2.5));
    const n = at(tl, tl.samples[found].t).length;
    expect(expected).toBeGreaterThan(0);
    expect(n).toBeGreaterThanOrEqual(Math.min(MAX_PARTICLES, expected));
  });

  it('falls of 3.25 blocks (power 0) never burst', () => {
    for (let k = 1; k < tl.samples.length; k++) {
      const f = fallDistanceAt(tl.samples, k);
      if (f > 0) expect(Math.floor(f + 1e-6 - 3)).toBeLessThanOrEqual(0);
    }
    for (let i = 0; i < tl.samples.length; i += 13) expect(at(tl, tl.samples[i].t).length).toBeLessThan(42);   // sprint dust only: <= 1 per tick
  });

  it('null velocity spawns no sprint particle', () => {
    const t2 = structuredClone(tl); t2.samples.forEach(s => { s.v = null; });
    // a sprint sample with no landing in the 40 ticks before it: only sprint dust could be alive there
    const i = t2.samples.findIndex((s, k) => k > 50 && s.c.includes('s') && s.g && t2.samples.slice(k - 41, k + 1).every(x => x.g));
    expect(i).toBeGreaterThan(0);
    expect(at(t2, t2.samples[i].t + 10)).toEqual([]);
  });

  it('never exceeds the pool', () => {
    for (let i = 0; i < tl.samples.length; i += 97) expect(at(tl, tl.samples[i].t).length).toBeLessThanOrEqual(MAX_PARTICLES);
  });
});
