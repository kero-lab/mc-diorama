import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { emptyTimeline, timelineReducer } from '../src/timeline';
import { stateAt } from '../src/frame';
import { PARKOUR_ACTIVITY } from '../src/layers/parkour/activity';
import { DEATH_CAUSE_WORDS, END_WORDS } from '../src/index';
import { toPublic } from './fixtures/public-allowlist';

const dir = join(__dirname, 'fixtures/rem-mc');
const load = (f: string) => { const j = JSON.parse(readFileSync(join(dir, f), 'utf8')); return (Array.isArray(j) ? j : j.events) as Record<string, unknown>[]; };
const fixture = readdirSync(dir).filter(f => f.startsWith('run-') && f.endsWith('.json'))
  .map(f => ({ f, ev: load(f) })).find(x => x.ev.some(e => e.type === 'run_ended' && e.death))!;
const runId = String(fixture.ev.find(e => e.type === 'run_started')!.runId);
const fold = (events: readonly unknown[]) => timelineReducer(emptyTimeline(), events.map(e => ({ e })));

describe('the public stream folds like the private one (Rem Live)', () => {
  const priv = fold(fixture.ev), pub = fold(toPublic(fixture.ev, runId));
  it('same final score and the same score steps', () => {
    expect(pub.ended?.score).toBe(priv.ended?.score);
    expect(pub.scores.map(s => s.score)).toEqual(priv.scores.map(s => s.score));
  });
  it('the death cause survives the projection, so the attempt reads in plain words', () => {
    expect(pub.ended?.death?.cause).toBe(priv.ended?.death?.cause);
    const end = stateAt(pub, pub.endT!);
    expect(PARKOUR_ACTIVITY.attempt(pub, end).ended).toBe(PARKOUR_ACTIVITY.attempt(priv, stateAt(priv, priv.endT!)).ended);
  });
  it('same jumps, schematics and samples; Rem has a pose mid-run', () => {
    expect(pub.layers.parkour.jumps.length).toBe(priv.layers.parkour.jumps.length);
    expect(pub.layers.parkour.schematics.map(s => s.ok)).toEqual(priv.layers.parkour.schematics.map(s => s.ok));
    expect(pub.samples.length).toBe(priv.samples.length);
    const mid = (pub.startT! + pub.endT!) / 2;
    expect(stateAt(pub, mid).rem).not.toBeNull();
  });
  it('the word maps are public', () => {
    expect(typeof DEATH_CAUSE_WORDS.no_solution).toBe('string');
    expect(END_WORDS.death).toBe('fell');
  });
});
