'use client';
import { Boxes, Map, PanelsTopLeft, Footprints, Eye, Clapperboard, Pause, Play, Radio, RotateCw, ScanEye, Crosshair } from 'lucide-react';
import { memo, useMemo, useRef, type KeyboardEvent } from 'react';
import { useDioramaHost } from './host';
import { bounds, SPEEDS, type Playback } from './playback';
import type { DioramaPrefs } from './prefs';
import { BUILTIN_CAMERA_IDS, CAMERAS, type CameraId } from './registry/cameras';
import type { TimelineMarker } from './registry/layers';
import type { Timeline } from './types';

/** m:ss.d of a run-relative time; negative clamps to 0. */
export function formatClock(ms: number): string {
  const s = Math.max(0, ms) / 1000, m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}`;
}
/** A marker's position on the track, in percent, clamped to 0-100. */
export function markerLeft(t: number, b: { start: number; end: number }): number {
  return b.end <= b.start ? 0 : Math.min(100, Math.max(0, ((t - b.start) / (b.end - b.start)) * 100));
}
const MARK: Record<TimelineMarker['kind'], string> = {
  paste: 'bg-lime-500', slow_plan: 'bg-sky-400', late_plan: 'bg-red-500', correction: 'bg-orange-400', death: 'bg-red-700', gap: 'bg-zinc-400', reset: 'bg-zinc-600', truncated: 'bg-amber-500', end: 'bg-foreground',
};
const CAMERA_ICONS = { iso: Boxes, top: Map, side: PanelsTopLeft, shoulder: Footprints, first: Eye, cinematic: Clapperboard, custom: Crosshair };
const TOUCH = 'min-h-9 pointer-coarse:min-h-11';

/** The markers above the scrubber, each a button that seeks. Memoised: they change only with the Timeline, while the
 *  scrubber around them moves every animation frame. Inset by half the range thumb, so a marker sits over the thumb's
 *  centre at that time and the end markers stay inside the frame. */
const MarkerTrack = memo(function MarkerTrack({ markers, b, onSeek }: { markers: TimelineMarker[]; b: { start: number; end: number }; onSeek(T: number): void }) {
  return (
    <div className='pointer-events-none absolute inset-x-2 top-0 h-3'>
      {markers.map((m, n) => (
        <button key={n} type='button' aria-label={m.label} title={m.label} onClick={() => onSeek(m.t)}
          className={`pointer-events-auto absolute top-0 h-3 w-1.5 -translate-x-1/2 cursor-pointer rounded-sm outline-offset-2 hover:scale-y-125 focus-visible:outline-2 focus-visible:outline-ring ${MARK[m.kind]}`} style={{ left: `${markerLeft(m.t, b)}%` }} />
      ))}
    </div>
  );
});

/** Camera radios (arrow keys move between them, one tab stop), the iso turn, and the X-ray switch. Memoised on prefs. */
const ViewControls = memo(function ViewControls({ prefs, reducedMotion, onPrefs, cameras, canXray }: { prefs: DioramaPrefs; reducedMotion: boolean; onPrefs(p: DioramaPrefs): void; cameras: readonly CameraId[]; canXray: boolean }) {
  const { Button } = useDioramaHost();
  const group = useRef<HTMLDivElement>(null);
  const pick = (id: CameraId) => onPrefs({ ...prefs, camera: id });
  const onKey = (e: KeyboardEvent) => {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const next = cameras[(cameras.indexOf(prefs.camera) + d + cameras.length) % cameras.length];
    pick(next);
    group.current?.querySelector<HTMLButtonElement>(`[data-camera="${next}"]`)?.focus();
  };
  return (
    <div className='flex flex-wrap items-center gap-2'>
      <div ref={group} role='radiogroup' aria-label='Camera' onKeyDown={onKey} className='flex flex-wrap gap-1'>
        {cameras.map(id => { const Icon = CAMERA_ICONS[id]; return (
          <button key={id} type='button' role='radio' data-camera={id} aria-checked={prefs.camera === id} tabIndex={prefs.camera === id ? 0 : -1} onClick={() => pick(id)}
            className={`${TOUCH} inline-flex items-center gap-1.5 cursor-pointer rounded-md border px-2.5 text-xs transition-colors duration-200 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-ring ${prefs.camera === id ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'}`}>
            <Icon aria-hidden='true' className='size-3.5 shrink-0' />{CAMERAS[id].label}{id === 'cinematic' && reducedMotion ? ' (isometric: reduced motion)' : ''}
          </button>
        ); })}
      </div>
      {prefs.camera === 'iso' && <Button size='sm' variant='ghost' className={TOUCH} aria-label='Turn the view 90°' title='Turn the view 90°' onClick={() => onPrefs({ ...prefs, rotation: ((prefs.rotation + 1) % 4) as 0 | 1 | 2 | 3 })}><RotateCw className='size-4' /></Button>}
      {canXray && <button type='button' role='switch' aria-checked={prefs.xray} onClick={() => onPrefs({ ...prefs, xray: !prefs.xray })}
        className={`${TOUCH} ml-auto flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-ring ${prefs.xray ? 'border-sky-500 bg-sky-500/15' : 'bg-background hover:bg-muted'}`}>
        <ScanEye className='size-4' /> X-ray
      </button>}
    </div>
  );
});

/** Play/pause, speed, Live, the clock, the scrubber with its markers, and the view controls (spec §4.6). */
export function Controls({ tl, pb, live, markers, prefs, reducedMotion, onPrefs, onSeek, onPlay, onSpeed, onLive, cameras = BUILTIN_CAMERA_IDS, canXray, rewindWindowMs = null }: {
  tl: Timeline; pb: Playback; live: boolean; markers: TimelineMarker[]; prefs: DioramaPrefs; reducedMotion: boolean; cameras?: readonly CameraId[]; canXray: boolean; rewindWindowMs?: number | null;
  onPrefs(p: DioramaPrefs): void; onSeek(T: number): void; onPlay(playing: boolean): void; onSpeed(s: number): void; onLive(): void;
}) {
  const { Button } = useDioramaHost();
  const b = useMemo(() => bounds(tl, rewindWindowMs), [tl, rewindWindowMs]);
  if (!b) return null;
  return (
    <div className='grid min-w-0 gap-2'>
      <div className='flex flex-wrap items-center gap-2'>
        <Button size='sm' variant='outline' className={TOUCH} aria-label={pb.playing ? 'Pause' : 'Play'} title={pb.playing ? 'Pause' : 'Play'} onClick={() => onPlay(!pb.playing)}>
          {pb.playing ? <Pause className='size-4' /> : <Play className='size-4' />}
        </Button>
        <label className='flex items-center gap-1 text-xs text-muted-foreground'>Speed
          <select aria-label='Speed' className={`${TOUCH} cursor-pointer rounded border bg-background px-1 py-0.5 text-foreground`} value={String(pb.speed)} onChange={e => onSpeed(Number(e.target.value))}>
            {SPEEDS.map(s => <option key={s} value={String(s)}>{s}×</option>)}
          </select>
        </label>
        {live && <Button size='sm' variant={pb.live ? 'secondary' : 'default'} className={TOUCH} disabled={pb.live} onClick={onLive}><Radio className='mr-1 size-4' />{pb.live ? 'Live' : 'Back to live'}</Button>}
        {live && !pb.live && <span className='tabular-nums text-xs text-muted-foreground'>−{formatClock(b.end - pb.T)}</span>}
        <span className='ml-auto text-xs tabular-nums text-muted-foreground'>{formatClock(pb.T - b.start)} / {formatClock(b.end - b.start)}</span>
      </div>
      <div className='relative pt-3'>
        <MarkerTrack markers={markers} b={b} onSeek={onSeek} />
        <input type='range' aria-label='Timeline' aria-valuetext={`${formatClock(pb.T - b.start)} of ${formatClock(b.end - b.start)}`} className='w-full cursor-pointer accent-primary'
          min={b.start} max={b.end} step={50} value={Math.round(pb.T)} onChange={e => onSeek(Number(e.target.value))} />
      </div>
      <ViewControls prefs={prefs} reducedMotion={reducedMotion} onPrefs={onPrefs} cameras={cameras} canXray={canXray} />
    </div>
  );
}
