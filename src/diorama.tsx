'use client';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useReducedMotion } from './use-reduced-motion';
import { useDioramaHost } from './host';
import type { LiveFeed, TimelineSource } from './live-feed';
import type { ActivityModule } from './activity';
import { Controls } from './controls';
import { stateAt } from './frame';
import { PUBLIC_LAYERS } from './layers';
import { bounds, goLive, initialPlayback, seek, step, type Playback } from './playback';
import { readPrefs, writePrefs, type DioramaPrefs } from './prefs';
import { BUILTIN_CAMERA_IDS, type CameraId } from './registry/cameras';
import { layerFor, type LayerDef } from './registry/layers';
import { ShowOverlay } from './show-overlay';
import { useRunTimeline, type TimelineStatus } from './use-run-timeline';

const DioramaCanvas = lazy(() => import('./canvas'));
const canvasFallback = <div className='absolute inset-0 animate-pulse bg-muted/30' />;

let webglProbe: boolean | undefined;
/** WebGL without creating a context in environments that cannot have one (jsdom, very old browsers). Probed once per page
 *  and the probe's context released at once: browsers cap live WebGL contexts (~16), and History mounts a Diorama per run. */
export function hasWebGL(): boolean {
  if (typeof window === 'undefined') return false;
  if (webglProbe !== undefined) return webglProbe;
  if (typeof (window as { WebGLRenderingContext?: unknown }).WebGLRenderingContext === 'undefined') return (webglProbe = false);
  try {
    const c = document.createElement('canvas'), gl = c.getContext('webgl2') ?? c.getContext('webgl');
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    webglProbe = !!gl;
  } catch { webglProbe = false; }
  return webglProbe;
}

const STATUS_TEXT: Record<Exclude<TimelineStatus, 'ready'>, string> = {
  loading: 'Loading the run…', idle: 'No run is open. The next one appears here as it starts.', missing: 'No recording for this run (it ran before the flight recorder, or its start has fallen out of the controller recording buffer).',
  reconnecting: 'Reconnecting: holding the last state; nothing is filled in across the gap.', error: 'Could not load the run.',
};

/** One line under the view, or null when there is nothing to say. Live, a dropped connection (browser↔relay or
 *  relay↔controller) wins over the Timeline's own status: the frame on screen is held, never filled in (spec §5). */
function statusLine(live: boolean, feed: LiveFeed | undefined, connected: boolean, status: TimelineStatus, error: string | null): string | null {
  if (live && !feed) return 'Waiting for the live feed…';
  if (live && !connected) return STATUS_TEXT.reconnecting;
  if (status === 'ready') return null;
  if (status === 'error') return `${STATUS_TEXT.error}${error ? ` ${error}` : ''}`;
  return STATUS_TEXT[status];
}

/** A run in 3D (spec §4): the live run (`{ live: true }` + the page's feed) or a stored one (`{ runId }`). `connected` is
 *  the live connection state (`live.connected && live.upstream`); ignored for a replay. */
export function Diorama({ source, feed, connected = true, className, label = 'Run diorama', layers = PUBLIC_LAYERS, cameras = BUILTIN_CAMERA_IDS, seekToProgress, compact = false, rewindWindowMs = null }: { source: TimelineSource; feed?: LiveFeed; connected?: boolean; className?: string; label?: string; layers?: Readonly<Record<string, LayerDef>>; cameras?: readonly CameraId[]; seekToProgress?: { value: number; activity: ActivityModule }; compact?: boolean; rewindWindowMs?: number | null }) {
  const live = 'live' in source;
  const host = useDioramaHost();
  const { tl, status, error } = useRunTimeline(source, feed);
  const reducedMotion = useReducedMotion();
  const [prefs, setPrefs] = useState<DioramaPrefs>(() => readPrefs(host.prefsKey));
  const [pb, setPb] = useState<Playback>(() => initialPlayback(tl, live, rewindWindowMs));
  const [selected, setSelected] = useState<number | null>(null);
  const [webgl, setWebgl] = useState<boolean | null>(null);   // null until probed (after mount): render neither the canvas nor the fallback
  const timeScale = useRef(1);
  const clock = useRef(pb);
  const renderFrame = useRef(stateAt(tl, pb.T));
  const [visible, setVisible] = useState(true);
  const tlRef = useRef(tl);
  tlRef.current = tl;
  useEffect(() => { setWebgl(hasWebGL()); }, []);
  useEffect(() => { writePrefs(host.prefsKey, prefs); }, [prefs, host.prefsKey]);
  const updatePlayback = useCallback((update: (current: Playback) => Playback) => {
    const next = update(clock.current);
    clock.current = next;
    renderFrame.current = stateAt(tlRef.current, next.T);
    setPb(next);
  }, []);
  useEffect(() => { renderFrame.current = stateAt(tl, clock.current.T); }, [tl]);
  useEffect(() => {
    const visibility = () => setVisible(!document.hidden);
    visibility();
    document.addEventListener('visibilitychange', visibility);
    return () => document.removeEventListener('visibilitychange', visibility);
  }, []);
  // A replay starts from its beginning and plays once it is loaded.
  useEffect(() => { if (!live && status === 'ready') updatePlayback(() => ({ ...initialPlayback(tlRef.current, false, rewindWindowMs), playing: true })); }, [live, status, tl.runId, updatePlayback, rewindWindowMs]);
  // Side window: pause at the first moment the run's progress reaches `value`, and follow it when it changes.
  const seekValue = seekToProgress?.value, seekActivity = seekToProgress?.activity;
  useEffect(() => {
    if (seekValue === undefined || !seekActivity || live || status !== 'ready') return;
    const cur = tlRef.current, b = bounds(cur, rewindWindowMs);
    if (!b) return;
    const hit = cur.scores.find(sc => sc.t >= b.start && seekActivity.progressAt(cur, sc.t) >= seekValue);
    updatePlayback(p => ({ ...seek(p, cur, hit ? hit.t : b.end, rewindWindowMs), playing: false }));
  }, [seekValue, seekActivity, live, status, tl.runId, updatePlayback, rewindWindowMs]);
  // The clock: one step per animation frame while playing or live; nothing while paused or the page is hidden.
  useEffect(() => {
    if (!pb.playing && !pb.live) return;
    let raf = 0, last = performance.now(), published = last;
    const loop = (now: number) => {
      const dt = Math.min(100, now - last); last = now;
      if (!document.hidden) {
        const previous = clock.current;
        const next = step(previous, tlRef.current, dt, timeScale.current, rewindWindowMs);
        if (next !== previous) {
          clock.current = next;
          renderFrame.current = stateAt(tlRef.current, next.T);
          // Mesh transforms stay on animation frames. DOM readouts and scene
          // membership need 10 Hz, plus immediate pause/end/mode transitions.
          if (now - published >= 100 || next.playing !== previous.playing || renderFrame.current.atEnd) {
            published = now;
            setPb(next);
          }
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [pb.playing, pb.live, rewindWindowMs]);
  const frame = useMemo(() => stateAt(tl, pb.T), [tl, pb.T]);
  // Handlers read the Timeline through tlRef, so they stay the same functions across frames (memoised children).
  const onSeek = useCallback((T: number) => updatePlayback(p => ({ ...seek(p, tlRef.current, T, rewindWindowMs), playing: false })), [updatePlayback, rewindWindowMs]);
  const onPlay = useCallback((playing: boolean) => updatePlayback(p => {
    const b = bounds(tlRef.current, rewindWindowMs);
    return playing && b && p.T >= b.end ? { ...p, live: false, playing, T: b.start } : { ...p, live: false, playing };   // Play at the end starts over
  }), [updatePlayback, rewindWindowMs]);
  const onSpeed = useCallback((speed: number) => updatePlayback(p => ({ ...p, speed })), [updatePlayback]);
  const onLive = useCallback(() => updatePlayback(p => goLive(p, tlRef.current, rewindWindowMs)), [updatePlayback, rewindWindowMs]);
  const camera = cameras.includes(prefs.camera) ? prefs.camera : cameras[0];   // a hidden camera is never the active one
  const layer = layerFor(tl.activity, layers);
  const xray = layer.xray && (prefs.xray || webgl === false);   // a layer set without X-ray ignores the pref
  // A capped open run is truncated while live but still folding: "cut short" (notice and marker) only once it is over.
  const cutShort = tl.truncated && (!live || tl.ended !== null);
  const markers = useMemo(() => layer.markers(tl.truncated && !cutShort ? { ...tl, truncated: false } : tl, host), [layer, tl, cutShort, host]);
  const { Overlay, Panels } = layer;
  const shown = status === 'ready' || status === 'reconnecting' || (status === 'error' && tl.runId !== null) || (status === 'idle' && tl.runId !== null);
  const line = statusLine(live, feed, connected, status, error);
  return (
    <section aria-label={label} data-status={status} data-connected={live ? String(connected) : undefined} className={className ?? 'space-y-3'}>
      <div className='relative aspect-[4/3] w-full overflow-hidden rounded-lg border bg-gradient-to-b from-zinc-100 to-zinc-200 dark:from-zinc-900 dark:to-zinc-950 sm:aspect-[16/9]'>
        {shown && webgl && <Suspense fallback={canvasFallback}><DioramaCanvas tl={tl} frame={frame} camera={camera} custom={prefs.custom} rotation={prefs.rotation} xray={xray} reducedMotion={reducedMotion} layer={layer} selected={selected} active={visible && (pb.playing || pb.live) && !frame.atEnd} timeScale={timeScale} renderFrame={renderFrame} /></Suspense>}
        {shown && webgl === false && <p className='absolute inset-0 grid place-items-center p-6 text-center text-sm text-muted-foreground'>3D view unavailable (WebGL is off in this browser). Every number is listed below.</p>}
        {shown && <ShowOverlay tl={tl} frame={frame} />}
        {shown && <Overlay tl={tl} frame={frame} />}
        {line && <p role='status' className='absolute inset-x-0 bottom-0 bg-background/80 px-3 py-1.5 text-xs text-muted-foreground'>{line}</p>}
        {cutShort && <p role='status' className='absolute right-3 top-3 rounded bg-amber-500/90 px-2 py-0.5 text-xs text-black'>Recording ends early: it was cut short</p>}
      </div>
      {shown && !compact && <Controls tl={tl} pb={pb} live={live} markers={markers} prefs={camera === prefs.camera ? prefs : { ...prefs, camera }} reducedMotion={reducedMotion}
        cameras={cameras} rewindWindowMs={rewindWindowMs} canXray={layer.xray} onPrefs={setPrefs} onSeek={onSeek} onPlay={onPlay} onSpeed={onSpeed} onLive={onLive} />}
      {!compact && <Panels tl={tl} frame={frame} xray={xray} selected={selected} onSelect={setSelected} onSeek={onSeek} />}
    </section>
  );
}
