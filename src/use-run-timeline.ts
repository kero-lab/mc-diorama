'use client';
import { useEffect, useRef, useState } from 'react';
import { useDioramaHost } from './host';
import type { LiveFeed, TimelineSource } from './live-feed';
import { mergeSeed, seedTimeline, type Buffered } from './seed';
import { emptyTimeline, timelineReducer } from './timeline';
import type { Timeline, TimelineInput } from './types';

export type TimelineStatus = 'loading' | 'ready' | 'idle' | 'missing' | 'error' | 'reconnecting';
export interface RunTimeline { tl: Timeline; status: TimelineStatus; error: string | null }
const BATCH_MS = 50;   // live events are folded in batches: one React update per 50 ms, not per event
export const MAX_BUFFER = 5_000;   // events held while unseeded
const RETRY_MS = 1_000, RETRY_MAX_MS = 15_000;   // a failed live seed retries at 1 s, 2 s, 4 s ... capped at 15 s
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** A run as a Timeline: a stored recording (replay), or the open run's seed plus the live feed (live). */
export function useRunTimeline(source: TimelineSource, feed?: LiveFeed): RunTimeline {
  const live = 'live' in source;
  const runId = 'runId' in source ? source.runId : null;
  const [state, setState] = useState<RunTimeline>({ tl: emptyTimeline(), status: 'loading', error: null });
  const feedRef = useRef(feed);
  feedRef.current = feed;
  const host = useDioramaHost();
  const hostRef = useRef(host);
  hostRef.current = host;

  useEffect(() => {
    if (live || !runId) return;
    let off = false;
    setState({ tl: emptyTimeline(), status: 'loading', error: null });
    hostRef.current.loadRecording({ runId }, undefined)
      .then(r => { if (!off) setState(typeof r === 'string' ? { tl: emptyTimeline(), status: 'missing', error: null } : { tl: seedTimeline(r), status: 'ready', error: null }); })
      .catch(e => { if (!off) setState({ tl: emptyTimeline(), status: 'error', error: msg(e) }); });
    return () => { off = true; };
  }, [live, runId]);

  // Every epoch (re)seeds. The page's stream starts at epoch 0 before it opens, and its first open bumps it to 1: so the
  // first seed is always superseded on first open (one extra fetch per load). That re-seed is required, not waste: a fresh
  // stream has no replay, so events published between the epoch-0 seed and the open would otherwise be lost (Ruling 10).
  const epoch = feed?.epoch;
  useEffect(() => {
    const f = feedRef.current;
    if (!live || !f) return;
    const ac = new AbortController();
    let off = false, seeded = false, attempt = 0, droppedId = -Infinity;   // droppedId: newest id dropped during this fetch
    let timer: ReturnType<typeof setTimeout> | null = null, retry: ReturnType<typeof setTimeout> | null = null;
    let buffer: Buffered[] = [], queue: TimelineInput[] = [];
    // Hold what is on screen while (re)seeding: never clear it, never fill the hole (spec §5).
    setState(s => ({ ...s, status: s.tl.runId ? 'reconnecting' : 'loading' }));
    // Only ever runs once seeded: live events are never folded onto an unseeded Timeline. No open run → 'idle', as at the seed.
    const flush = () => {
      timer = null; const batch = queue; queue = [];
      if (batch.length && !off) setState(s => { const tl = timelineReducer(s.tl, batch); return { tl, status: tl.runId ? 'ready' : 'idle', error: null }; });
    };
    // Subscribe BEFORE the fetch: whatever arrives while the seed loads is buffered, and mergeSeed drops the overlap by id.
    const unsub = f.subscribe((e, id) => {
      if (!seeded) {
        buffer.push({ e, id });
        // Bounded while unseeded (a seed can keep failing): drop the oldest. A seed fetched after the drop holds it; one
        // already in flight may not, so the seed's lastId is checked against droppedId before it is used (below).
        if (buffer.length > MAX_BUFFER) { const d = buffer.shift()!; if (d.id !== null) droppedId = Math.max(droppedId, d.id); }
        return;
      }
      queue.push({ e, id });
      timer ??= setTimeout(flush, BATCH_MS);
    });
    const seed = () => {
      retry = null; droppedId = -Infinity;   // drops before this fetch starts are in its seed; only drops during it are not
      hostRef.current.loadRecording({ live: true }, ac.signal)
        .then(r => {
          if (off) return;
          // A seed taken before the overflow dropped events it does not hold would fold across that hole: take a new one.
          if (droppedId > -Infinity && (typeof r === 'string' || r.lastId === null || r.lastId < droppedId)) throw new Error('live seed older than the buffered stream');
          // A re-seed REPLACES the Timeline with a fresh one (new arrays and BlockChange objects); it never mutates the old one.
          // frame.ts's blocksAt cache relies on blockChanges being append-only within one Timeline lineage, and a re-seed's
          // head can be earlier than the clock's T, so playback must not assume T is monotonic across it.
          const base = typeof r === 'string' ? emptyTimeline() : seedTimeline(r);
          const rest = typeof r === 'string' ? buffer.map(b => ({ e: b.e, id: b.id })) : mergeSeed(r, buffer);
          const tl = timelineReducer(base, rest);
          seeded = true; buffer = [];   // only once the fold succeeded: a throw stays unseeded, keeps the buffer and retries
          setState({ tl, status: tl.runId ? 'ready' : 'idle', error: null });
        })
        .catch(e => {
          if (off) return;
          // Stay UNSEEDED: keep buffering, keep the held Timeline, retry with backoff. Folding live events now would draw
          // straight across the hole (spec §5). The first failure says 'error'; the retries after it say 'reconnecting'.
          // Nothing else can overwrite either: flush only runs once seeded.
          const status: TimelineStatus = attempt === 0 ? 'error' : 'reconnecting';   // read now: the updater runs later
          setState(s => ({ ...s, status, error: msg(e) }));
          retry = setTimeout(seed, Math.min(RETRY_MAX_MS, RETRY_MS * 2 ** attempt++));
        });
    };
    seed();
    return () => {
      off = true; ac.abort(); unsub();               // abort: a superseded seed (e.g. the epoch-0 one) stops downloading
      if (timer) clearTimeout(timer);
      if (retry) clearTimeout(retry);
      buffer = []; queue = [];
    };
  }, [live, epoch]);

  return state;
}
