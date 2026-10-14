// Spec §7.2: pose = f(recording, time). 1x, 0.5x and a seek backwards visit the same times and must give identical
// model poses and particles.
import { describe, expect, it } from 'vitest';
import { seedTimeline } from '../src/seed';
import { blocksAt } from '../src/frame';
import { spectatorPoseAt } from '../src/vanilla/spectator';
import { particlesAt } from '../src/vanilla/particles';
import { loadReal, type RealId } from './fixtures/real';

const seed = (id: RealId) => seedTimeline({ events: loadReal(id), truncated: false, version: 1, lastId: null, runId: null } as never);

describe('determinism on a real run (d1fae16b)', () => {
  const tl = seed('d1fae16b');
  const t0 = tl.samples[0].t, t1 = tl.samples.at(-1)!.t;
  const probes = Array.from({ length: 40 }, (_, k) => t0 + (t1 - t0) * (k + 0.37) / 40);
  const snap = (T: number) => ({ pose: spectatorPoseAt(tl.samples, T), particles: particlesAt(tl, T, blocksAt(tl, T).blocks) });
  it('1x forward, 0.5x forward and backwards seeks agree', () => {
    const forward = probes.map(snap);
    const slow: ReturnType<typeof snap>[] = [];
    for (let T = t0, k = 0; k < probes.length; T += 25) if (T >= probes[k]) { slow.push(snap(probes[k])); k++; } else snap(T);
    const backward = [...probes].reverse().map(snap).reverse();
    expect(forward.some(s => s.pose !== null)).toBe(true);
    expect(forward.some(s => s.particles.length > 0)).toBe(true);
    expect(slow).toEqual(forward);
    expect(backward).toEqual(forward);
  });
  it('the death run folds and poses to the end', () => {
    const d = seed('22dd4e13');
    expect(spectatorPoseAt(d.samples, d.samples.at(-1)!.t)).not.toBeNull();
  });
});
