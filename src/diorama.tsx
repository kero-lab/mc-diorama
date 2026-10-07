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
import { DEFAULT_PREFS, readPrefs, writePrefs, type DioramaPrefs } from './prefs';
import { BUILTIN_CAMERA_IDS, type CameraId } from './registry/cameras';
import { sanitizeCustom, type CustomCameraParams } from './registry/custom-camera';
import { layerFor, type LayerDef } from './registry/layers';
import type { FrameState } from './frame';
import type { Timeline } from './types';
import { ShowOverlay } from './show-overlay';
import { OrbitSurface } from './orbit-surface';
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
export interface DioramaFrameInfo { tl: Timeline; frame: FrameState; T: number; live: boolean; behindMs: number | null; status: TimelineStatus }
export interface DioramaProps {
  source: TimelineSource; feed?: LiveFeed; connected?: boolean; className?: string; label?: string;
  layers?: Readonly<Record<string, LayerDef>>; cameras?: readonly CameraId[];
  seekToProgress?: { value: number; activity: ActivityModule }; compact?: boolean; rewindWindowMs?: number | null;
  camera?: CameraId; onCameraChange?: (id: CameraId) => void;
  customParams?: CustomCameraParams; onCustomParamsChange?: (p: CustomCameraParams) => void;
  /** Default true; false = never read or write the host's prefsKey. */
  persistPrefs?: boolean;
  /** Default true; false = hide the camera/rotation/X-ray picker (the timeline stays). */
  viewControls?: boolean;
  /** Default true; false = hide the layer's panels under the stage. */
  panels?: boolean;
  /** About 10 Hz while playing or live, and on every seek, pause and new data. */
  onFrame?: (f: DioramaFrameInfo) => void;
}

export function Diorama({ source, feed, connected = true, className, label = 'Run diorama', layers = PUBLIC_LAYERS, cameras = BUILTIN_CAMERA_IDS, seekToProgress, compact = false, rewindWindowMs = null,
  camera: cameraProp, onCameraChange, customParams: customProp, onCustomParamsChange, persistPrefs = true, viewControls = true, panels = true, onFrame }: DioramaProps) {
  const live = 'live' in source;
  const win = live ? (rewindWindowMs ?? null) : null;   // the window clips the live run only, never a replay
  const camIds = cameras.length ? cameras : BUILTIN_CAMERA_IDS;
  const host = useDioramaHost();
  const { tl, status, error } = useRunTimeline(source, feed);
  const reducedMotion = useReducedMotion();
  const [prefs, setPrefs] = useState<DioramaPrefs>(() => persistPrefs ? readPrefs(host.prefsKey) : DEFAULT_PREFS);
  const [pb, setPb] = useState<Playback>(() => initialPlayback(tl, live, win));
  const [selected, setSelected] = useState<number | null>(null);
  const [webgl, setWebgl] = useState<boolean | null>(null);   // null until probed (after mount): render neither the canvas nor the fallback
  const timeScale = useRef(1);
  const clock = useRef(pb);
  const renderFrame = useRef(stateAt(tl, pb.T));
  const [visible, setVisible] = useState(true);
  const tlRef = useRef(tl);
  tlRef.current = tl;
  useEffect(() => { setWebgl(hasWebGL()); }, []);
  useEffect(() => { if (persistPrefs) writePrefs(host.prefsKey, prefs); }, [prefs, host.prefsKey, persistPrefs]);
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
  useEffect(() => { if (!live && status === 'ready') updatePlayback(() => ({ ...initialPlayback(tlRef.current, false, win), playing: true })); }, [live, status, tl.runId, updatePlayback, win]);
  // Side window: pause at the first moment the run's progress reaches `value`, and follow it when it changes.
  const seekValue = seekToProgress?.value, seekActivity = seekToProgress?.activity;
  useEffect(() => {
    if (seekValue === undefined || !seekActivity || live || status !== 'ready') return;
    const cur = tlRef.current, b = bounds(cur, win);
    if (!b) return;
    const hit = cur.scores.find(sc => sc.t >= b.start && seekActivity.progressAt(cur, sc.t) >= seekValue);
    updatePlayback(p => ({ ...seek(p, cur, hit ? hit.t : b.end, win), playing: false }));
  }, [seekValue, seekActivity, live, status, tl.runId, updatePlayback, win]);
  // A windowed viewer who is paused (no rAF loop) is not stepped, so reconcile on new data: once the moving floor passes their T,
  // they land on the window's start (not on live). Unwindowed: untouched.
  useEffect(() => {
    if (typeof win !== 'number') return;
    const b = bounds(tl, win);
    if (b && !clock.current.live && clock.current.T < b.start) updatePlayback(p => ({ ...p, T: b.start }));
  }, [tl, win, updatePlayback]);
  // The clock: one step per animation frame while playing or live; nothing while paused or the page is hidden.
  useEffect(() => {
    if (!pb.playing && !pb.live) return;
    let raf = 0, last = performance.now(), published = last;
    const loop = (now: number) => {
      const dt = Math.min(100, now - last); last = now;
      if (!document.hidden) {
        const previous = clock.current;
        const next = step(previous, tlRef.current, dt, timeScale.current, win);
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
  }, [pb.playing, pb.live, win]);
  const frame = useMemo(() => stateAt(tl, pb.T), [tl, pb.T]);
  // State out for a page that drives the camera or shows the playhead itself. The callback goes through a ref, so a new
  // closure each render never re-fires this; it runs on real changes only (10 Hz publishes, seeks, pauses, new data).
  const onFrameRef = useRef(onFrame);
  onFrameRef.current = onFrame;
  useEffect(() => {
    const b = bounds(tl, win);
    onFrameRef.current?.({ tl, frame, T: pb.T, live: pb.live, behindMs: b && !pb.live ? Math.max(0, b.end - pb.T) : null, status });
  }, [tl, frame, pb.T, pb.live, status, win]);
  // Handlers read the Timeline through tlRef, so they stay the same functions across frames (memoised children).
  const onSeek = useCallback((T: number) => updatePlayback(p => ({ ...seek(p, tlRef.current, T, win), playing: false })), [updatePlayback, win]);
  const onPlay = useCallback((playing: boolean) => updatePlayback(p => {
    const b = bounds(tlRef.current, win);
    return playing && b && p.T >= b.end ? { ...p, live: false, playing, T: b.start } : { ...p, live: false, playing };   // Play at the end starts over
  }), [updatePlayback, win]);
  const onSpeed = useCallback((speed: number) => updatePlayback(p => ({ ...p, speed })), [updatePlayback]);
  const onLive = useCallback(() => updatePlayback(p => goLive(p, tlRef.current, win)), [updatePlayback, win]);
  const wanted = cameraProp ?? prefs.camera;
  const camera = camIds.includes(wanted) ? wanted : camIds[0];   // a hidden camera is never the active one
  const custom = useMemo(() => customProp ? sanitizeCustom(customProp) : prefs.custom, [customProp, prefs.custom]);
  const onPrefs = useCallback((next: DioramaPrefs) => {
    if (next.camera !== camera && onCameraChange) onCameraChange(next.camera);
    if (next.custom !== custom && onCustomParamsChange) onCustomParamsChange(next.custom);
    setPrefs(p => ({ ...next, camera: cameraProp !== undefined ? p.camera : next.camera, custom: customProp ? p.custom : next.custom }));
  }, [camera, custom, cameraProp, customProp, onCameraChange, onCustomParamsChange]);
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
        {shown && webgl && <Suspense fallback={canvasFallback}><DioramaCanvas tl={tl} frame={frame} camera={camera} custom={custom} rotation={prefs.rotation} xray={xray} reducedMotion={reducedMotion} layer={layer} selected={selected} active={visible && (pb.playing || pb.live) && !frame.atEnd} timeScale={timeScale} renderFrame={renderFrame} /></Suspense>}
        {shown && webgl === false && <p className='absolute inset-0 grid place-items-center p-6 text-center text-sm text-muted-foreground'>3D view unavailable (WebGL is off in this browser).{compact ? '' : ' Every number is listed below.'}</p>}
        {shown && webgl && camera === 'custom' && onCustomParamsChange && <OrbitSurface value={custom} onChange={onCustomParamsChange} />}
        {shown && <ShowOverlay tl={tl} frame={frame} />}
        {shown && <Overlay tl={tl} frame={frame} />}
        {line && <p role='status' className='absolute inset-x-0 bottom-0 bg-background/80 px-3 py-1.5 text-xs text-muted-foreground'>{line}</p>}
        {cutShort && <p role='status' className='absolute right-3 top-3 rounded bg-amber-500/90 px-2 py-0.5 text-xs text-black'>Recording ends early: it was cut short</p>}
      </div>
      {shown && !compact && <Controls viewControls={viewControls} tl={tl} pb={pb} live={live} markers={markers} prefs={camera === prefs.camera && custom === prefs.custom ? prefs : { ...prefs, camera, custom }} reducedMotion={reducedMotion}
        cameras={camIds} rewindWindowMs={win} canXray={layer.xray} onPrefs={onPrefs} onSeek={onSeek} onPlay={onPlay} onSpeed={onSpeed} onLive={onLive} />}
      {panels && !compact && <Panels tl={tl} frame={frame} xray={xray} selected={selected} onSelect={setSelected} onSeek={onSeek} />}
    </section>
  );
}
