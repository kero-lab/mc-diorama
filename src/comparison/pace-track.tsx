'use client';
import type { ActivityModule } from '../activity';
import type { Timeline } from '../types';
import { paceAt, type PaceIndex } from './pace';

const n = (v: number) => v.toLocaleString('en-US');
const s = (ms: number) => (ms / 1000).toFixed(1);

/** One line + a bar: ahead/behind the record run at the same score (spec §3.4). Text carries the meaning; colour only repeats it. */
export function PaceTrack({ live, T, record, activity }: { live: Timeline; T: number; record: PaceIndex | null; activity: ActivityModule }) {
  const p = paceAt(live, T, record, activity);
  const text = p.kind === 'no_record' ? 'No record yet'
    : p.kind === 'not_started' ? 'Waiting for the first point'
    : p.kind === 'past_record' ? `Past the record run (${n(p.recordEnd)})`
    : p.kind === 'level' ? `Level with the record at ${n(p.at)}`
    : `${p.kind === 'ahead' ? '+' : '−'}${s(p.deltaMs)} s ${p.kind} at ${n(p.at)}`;
  const tone = p.kind === 'ahead' || p.kind === 'past_record' ? 'text-emerald-600 dark:text-emerald-400' : p.kind === 'behind' ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground';
  return <p role='status' aria-live='polite' data-pace={p.kind} className={`text-sm tabular-nums ${tone}`}>{text}</p>;
}
