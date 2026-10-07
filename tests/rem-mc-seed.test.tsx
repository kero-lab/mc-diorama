import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mergeSeed, seedTimeline } from '../src/seed';
import type { DioramaHost } from '../src/host';
import { emptyTimeline, timelineReducer } from '../src/timeline';
import { MAX_BUFFER, useRunTimeline } from '../src/use-run-timeline';
import type { LiveFeed, TimelineSource } from '../src/live-feed';
type ControllerEvent = unknown;   // the package's LiveFeed carries opaque events (live-feed.ts)
import { syntheticRun } from './fixtures/rem-mc/synthetic-p8';
import { recordingResponse } from './recording-stub';
import { withHost } from './test-host';

const events = syntheticRun();
const ids = events.map((_, i) => 1000 + i);
const whole = timelineReducer(emptyTimeline(), events.map((e, i) => ({ e, id: ids[i] })));
/** The seam inside tick 40: the controller published her door click, then the seed was taken, then the trapdoor change of the
 *  same tick. (The door halves themselves are staggered 41/42 since Task 6's Ruling 26, so they no longer share a tick.) */
const k = events.findIndex(e => e.type === 'action') + 1;
const rec = (n: number) => ({ events: events.slice(0, n), truncated: false, version: 1, lastId: ids[n - 1], runId: String(events[0].runId) });

describe('the live seam (Review Focus 2)', () => {
  it('a seed taken between two events of one tick, plus SSE events buffered with overlap, folds to exactly the whole stream', () => {
    expect(events[k - 1].tick).toBe(events[k].tick);                                 // control: really a mid-tick seam
    expect(events[k].type).toBe('block');
    const buffered = events.map((e, i) => ({ e, id: ids[i] })).slice(k - 3);           // subscribed before the fetch: 3 overlap
    const tl = timelineReducer(seedTimeline(rec(k)), mergeSeed(rec(k), buffered));
    expect(tl).toEqual(whole);
  });

  it('every seam in the run, with any overlap, folds to exactly the whole stream', () => {
    for (let n = 1; n < events.length; n++) {
      for (const overlap of [0, 1, 5]) {
        const buffered = events.map((e, i) => ({ e, id: ids[i] })).slice(Math.max(0, n - overlap));
        expect(timelineReducer(seedTimeline(rec(n)), mergeSeed(rec(n), buffered)), `seam ${n}, overlap ${overlap}`).toEqual(whole);
      }
    }
  });

  it('positive control: deduping by tick alone would lose the rest of the seam tick', () => {
    const noIds = events.map(e => ({ e, id: null })).slice(k - 3);
    const byTick = timelineReducer(seedTimeline({ ...rec(k), lastId: null }), mergeSeed({ events: rec(k).events, lastId: null }, noIds));
    expect(byTick.blocksNow['8,102,0']).toBeUndefined();                              // the lossy fallback, shown
    expect(whole.blocksNow['8,102,0'].state).toMatchObject({ open: true });
  });

  it('a new run_started after the seed always passes, even on the tick fallback', () => {
    const next = { type: 'run_started', runId: 'r2', at: 'x', settings: {}, plannerVersion: 'v3', server: 's', difficulty: 0.8, tick: 0 };
    expect(mergeSeed({ events: rec(k).events, lastId: null }, [{ e: next, id: null }])).toHaveLength(1);
  });
});

describe('useRunTimeline', () => {
  afterEach(() => vi.unstubAllGlobals());
  let load: DioramaHost['loadRecording'];   // the host's loader, swapped per test (was a global.fetch stub)
  const wrapper = ({ children }: { children: ReactNode }) => withHost(<>{children}</>, { loadRecording: (...a) => load(...a) });
  const answer = (status: number, body: unknown = null, headers: Record<string, string> = {}) => recordingResponse(status, body, headers)({ live: true });
  function fakeFeed(epoch: number) {
    const subs = new Set<(e: ControllerEvent, id: number | null) => void>();
    const feed: LiveFeed = { epoch, subscribe: fn => { subs.add(fn); return () => { subs.delete(fn); }; } };
    const emit = (e: unknown, id: number | null) => { for (const f of subs) f(e as ControllerEvent, id); };
    return { feed, emit, send: (i: number) => emit(events[i], ids[i]) };
  }
  function stubLive(n: number) {
    let release!: () => void;
    const gate = new Promise<void>(r => { release = r; });
    load = vi.fn(async () => { await gate; return answer(200, events.slice(0, n), { 'x-recording-last-id': String(ids[n - 1]), 'x-recording-run': 'r' }); });
    return release;
  }

  it('live: buffers the stream while the seed loads, then folds seed + stream into the whole run (ids reach the reducer)', async () => {
    const release = stubLive(k);
    const { feed, send } = fakeFeed(1);
    const { result } = renderHook(() => useRunTimeline({ live: true }, feed), { wrapper });
    act(() => { for (let i = k - 3; i < k + 5; i++) send(i); });                    // arrive before the seed
    release();
    await waitFor(() => expect(result.current.status).toBe('ready'));
    act(() => { for (let i = k + 5; i < events.length; i++) send(i); });
    await waitFor(() => expect(result.current.tl.lastId).toBe(ids.at(-1)));          // only an SSE id can set this
    expect(result.current.tl).toEqual(whole);
  });

  it('a new feed epoch (a reconnect) keeps the last state on screen as reconnecting, then re-seeds', async () => {
    let release = stubLive(events.length);
    const a = fakeFeed(1);
    const { result, rerender } = renderHook(({ f }) => useRunTimeline({ live: true }, f), { initialProps: { f: a.feed }, wrapper });
    release();
    await waitFor(() => expect(result.current.status).toBe('ready'));
    const shown = result.current.tl;
    release = stubLive(events.length);
    const b = fakeFeed(2);
    rerender({ f: b.feed });
    expect(result.current.status).toBe('reconnecting');
    expect(result.current.tl).toBe(shown);                                           // held, not cleared or invented
    release();
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.tl).toEqual(whole);
    expect(result.current.tl).not.toBe(shown);                                       // a fresh Timeline, never the old one mutated
    expect(result.current.tl.blockChanges[0]).not.toBe(shown.blockChanges[0]);
  });

  it('a failed live seed stays unseeded: buffers, never says ready, retries, then folds to the whole run', async () => {
    const statuses: string[] = [];
    let n = 0;
    load = vi.fn(async () => (++n === 1
      ? answer(502, { error: 'controller unreachable' })
      : answer(200, events.slice(0, k), { 'x-recording-last-id': String(ids[k - 1]), 'x-recording-run': 'r' })));
    const { feed, send } = fakeFeed(1);
    const { result } = renderHook(() => { const r = useRunTimeline({ live: true }, feed); statuses.push(r.status); return r; }, { wrapper });
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('controller unreachable');
    act(() => { for (let i = k - 3; i < events.length; i++) send(i); });            // the whole tail arrives while unseeded
    await act(async () => { await new Promise(r => setTimeout(r, 200)); });          // well past a batch: nothing folded
    expect(result.current.status).toBe('error');
    expect(result.current.tl).toEqual(emptyTimeline());
    await waitFor(() => expect(result.current.status).toBe('ready'), { timeout: 3_000 });   // the 1 s retry
    expect(n).toBe(2);
    expect(statuses.slice(0, statuses.indexOf('ready'))).toContain('error');
    expect(statuses.slice(0, statuses.indexOf('ready'))).not.toContain('ready');
    expect(result.current.tl).toEqual(whole);
  });

  it('a second failure says reconnecting, never ready, and the error stays', async () => {
    let n = 0;
    load = vi.fn(async () => (++n <= 2
      ? answer(502, { error: `down ${n}` })
      : answer(200, events, { 'x-recording-last-id': String(ids.at(-1)), 'x-recording-run': 'r' })));
    const { result } = renderHook(() => useRunTimeline({ live: true }, fakeFeed(1).feed), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('error'));
    await waitFor(() => expect(result.current.status).toBe('reconnecting'), { timeout: 2_000 });   // the 1 s retry failed
    expect(result.current.error).toBe('down 2');
    await waitFor(() => expect(result.current.status).toBe('ready'), { timeout: 4_000 });         // the 2 s retry
    expect(n).toBe(3);
    expect(result.current.tl).toEqual(whole);
  }, 10_000);

  it('an overflow during an in-flight seed: a seed older than the dropped events is refused and re-taken', async () => {
    let n = 0, release!: () => void;
    const gate = new Promise<void>(r => { release = r; });
    const lock = (i: number) => ({ e: { type: 'lock', lock: { kind: 'offline' } }, id: 5000 + i });
    load = vi.fn(async () => {
      if (++n === 1) { await gate; return answer(200, events, { 'x-recording-last-id': String(ids.at(-1)), 'x-recording-run': 'r' }); }
      // The re-take holds everything the overflow dropped (ids up to 5000 + 2 here).
      return answer(200, events, { 'x-recording-last-id': '5002', 'x-recording-run': 'r' });
    });
    const { feed, emit } = fakeFeed(1);
    const { result } = renderHook(() => useRunTimeline({ live: true }, feed), { wrapper });
    act(() => { for (let i = 0; i < MAX_BUFFER + 3; i++) { const b = lock(i); emit(b.e, b.id); } });   // 3 dropped: 5000..5002
    release();
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toMatch(/older than the buffered stream/);
    await waitFor(() => expect(result.current.status).toBe('ready'), { timeout: 3_000 });
    expect(n).toBe(2);
    expect(result.current.tl.lastId).toBe(5000 + MAX_BUFFER + 2);                     // the buffered tail past the re-take folded
  });

  it('no open run (204): a later id-carrying event keeps the status idle', async () => {
    load = vi.fn(async () => answer(204));
    const { feed, emit } = fakeFeed(1);
    const { result } = renderHook(() => useRunTimeline({ live: true }, feed), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('idle'));
    act(() => emit({ type: 'lock', lock: { kind: 'offline' } }, 5000));
    await waitFor(() => expect(result.current.tl.lastId).toBe(5000));
    expect(result.current.status).toBe('idle');
    expect(result.current.tl.runId).toBeNull();
  });

  it('an unmount (or a new epoch) aborts the in-flight seed fetch', async () => {
    let signal: AbortSignal | undefined;
    load = vi.fn((_s: TimelineSource, sig?: AbortSignal) => { signal = sig; return new Promise<never>(() => {}); });
    const { unmount } = renderHook(() => useRunTimeline({ live: true }, fakeFeed(1).feed), { wrapper });
    await waitFor(() => expect(signal).toBeDefined());
    expect(signal!.aborted).toBe(false);
    unmount();
    expect(signal!.aborted).toBe(true);
  });

  it('replay: a stored recording is ready; a missing one says so', async () => {
    load = vi.fn(async () => answer(200, events, { 'x-recording-truncated': 'true' }));
    const { result } = renderHook(() => useRunTimeline({ runId: 'r1' }), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.tl.truncated).toBe(true);
    load = vi.fn(async () => answer(404, { error: 'no recording' }));
    const missing = renderHook(() => useRunTimeline({ runId: 'r2' }), { wrapper });
    await waitFor(() => expect(missing.result.current.status).toBe('missing'));
  });
});
