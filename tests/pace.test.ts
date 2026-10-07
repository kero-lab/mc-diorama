import { paceAt, paceIndex } from '../src/comparison/pace';
import { PARKOUR_ACTIVITY } from '../src/activity';
import { emptyTimeline } from '../src/timeline';
import type { Timeline } from '../src/types';

/** A timeline whose score reaches each value at the given time (ms since start 0). */
function run(points: [t: number, score: number][]): Timeline {
  return { ...emptyTimeline(), runId: 'x', startT: 0, lastT: points.at(-1)![0], scores: points.map(([t, score]) => ({ t, score })) };
}
const record = run([[0, 0], [10_000, 100], [20_000, 200], [30_000, 300]]);
const idx = paceIndex(record, PARKOUR_ACTIVITY);

describe('pace by score', () => {
  it('indexes the first time each score was reached', () => {
    expect(idx.progress).toEqual([0, 100, 200, 300]);
    expect(idx.t).toEqual([0, 10_000, 20_000, 30_000]);
  });
  it('ahead: she reached 200 at 15 s, the record at 20 s', () => {
    const live = run([[0, 0], [15_000, 200]]);
    expect(paceAt(live, 15_000, idx, PARKOUR_ACTIVITY)).toEqual({ kind: 'ahead', deltaMs: 5_000, at: 200 });
  });
  it('behind: she reached 100 at 14 s, the record at 10 s', () => {
    const live = run([[0, 0], [14_000, 100]]);
    expect(paceAt(live, 14_000, idx, PARKOUR_ACTIVITY)).toEqual({ kind: 'behind', deltaMs: 4_000, at: 100 });
  });
  it('between recorded values: compares at the last value both runs reached', () => {
    const live = run([[0, 0], [12_000, 150]]);
    expect(paceAt(live, 12_000, idx, PARKOUR_ACTIVITY)).toEqual({ kind: 'behind', deltaMs: 2_000, at: 100 });
  });
  it('paceAt beyond the record run (Review Focus 1): past the record, no extrapolation', () => {
    const live = run([[0, 0], [25_000, 340]]);
    expect(paceAt(live, 25_000, idx, PARKOUR_ACTIVITY)).toEqual({ kind: 'past_record', recordEnd: 300 });
  });
  it('no record (Review Focus 2) and not started', () => {
    expect(paceAt(run([[0, 0], [5000, 50]]), 5000, null, PARKOUR_ACTIVITY)).toEqual({ kind: 'no_record' });
    expect(paceAt(run([[0, 0]]), 0, idx, PARKOUR_ACTIVITY)).toEqual({ kind: 'not_started' });
  });
  it('level within 250 ms', () => {
    const live = run([[0, 0], [10_100, 100]]);
    expect(paceAt(live, 10_100, idx, PARKOUR_ACTIVITY).kind).toBe('level');
  });
});
