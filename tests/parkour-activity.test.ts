import { PARKOUR_ACTIVITY, activityFor } from '../src/activity';
import { END_WORDS } from '../src/layers/parkour/activity';
import { DEATH_CAUSE_WORDS } from '../src/layers/parkour/derive';
import { stateAt } from '../src/frame';
import { seedTimeline } from '../src/seed';
import { syntheticRun } from './fixtures/rem-mc/synthetic-p8';

const tl = seedTimeline({ events: syntheticRun(), truncated: false, version: 1, lastId: null, runId: 'r' });
const end = tl.endT ?? tl.lastT!;

describe('parkour activity module', () => {
  it('is found by id and says random courses are not repeatable', () => {
    expect(activityFor('parkour')).toBe(PARKOUR_ACTIVITY);
    expect(activityFor('mining')).toBeNull();
    expect(PARKOUR_ACTIVITY.repeatableWorld).toBe(false);
  });
  it('live stats: score, time in run, jumps per minute, schematics cleared, clean streak', () => {
    const s = PARKOUR_ACTIVITY.liveStats(tl, stateAt(tl, end));
    expect(s.map(x => x.id)).toEqual(['score', 'time', 'jpm', 'schematics', 'streak']);
    const by = Object.fromEntries(s.map(x => [x.id, x.value]));
    expect(by.score).toBe(stateAt(tl, end).score);
    expect(by.time).toBe(end - tl.startT!);
    expect(by.jpm).toBeNull(); // the fixture run is 3.2 s: under the 5 s floor
    expect(by.schematics).toBe(tl.layers.parkour.schematics.filter(x => x.ok && x.t <= end).length);
  });
  it('jumps per minute is jumps over minutes once the run passes 5 s', () => {
    const long = { ...tl, endT: tl.startT! + 60000, ended: null };
    const jpm = PARKOUR_ACTIVITY.liveStats(long, stateAt(long, long.endT!)).find(x => x.id === 'jpm')!.value;
    expect(jpm).toBeCloseTo(tl.layers.parkour.jumps.length, 5);
  });
  it('jumps per minute is null in the first 5 s (no silly 600/min after one jump)', () => {
    const s = PARKOUR_ACTIVITY.liveStats(tl, stateAt(tl, tl.startT! + 1000));
    expect(s.find(x => x.id === 'jpm')!.value).toBeNull();
  });
  it('attempt: ended in plain words once the run ends, null while running', () => {
    expect(PARKOUR_ACTIVITY.attempt(tl, stateAt(tl, tl.startT! + 1000)).ended).toBeNull();
    const a = PARKOUR_ACTIVITY.attempt(tl, stateAt(tl, end));
    if (tl.ended) expect(typeof a.ended).toBe('string');
    expect(a.score).toBe(stateAt(tl, end).score);
  });
  it('a death is worded by the same cause map the timeline markers use', () => {
    const a = PARKOUR_ACTIVITY.attempt(tl, stateAt(tl, end));
    if (tl.ended?.death) expect(a.ended).toBe(DEATH_CAUSE_WORDS[tl.ended.death.cause]);
  });
  it('progressAt is the score at T', () => {
    expect(PARKOUR_ACTIVITY.progressAt(tl, end)).toBe(stateAt(tl, end).score);
  });
  it('plain-words maps are never empty and never leak snake_case', () => {
    for (const w of [...Object.values(END_WORDS), ...Object.values(DEATH_CAUSE_WORDS)]) expect(w).toMatch(/^[a-z][a-z ,'-]*$/i);
  });
});
