'use client';
import { memo, useMemo } from 'react';
import { Footprints } from 'lucide-react';
import { blockDef } from '../registry/blocks';
import type { LayerPanelProps } from '../registry/layers';
import { deathCard, landingValues, thinkingRows, type ThinkingRow } from '../layers/parkour/derive';

const PX = 6;   // pixels per tick
const ticks = (n: number) => `${n} tick${n === 1 ? '' : 's'}`;
function label(r: ThinkingRow): string {
  const ms = r.plannerMs !== null ? `, planner ${Math.round(r.plannerMs)} ms` : '';
  const margin = r.margin !== null ? `, margin ${r.margin.toFixed(2)}` : '';
  if (r.requestTick === null && r.takeoffTick === null) return `jump ${r.seq}: no timing (recorded before Plan 8)${ms}${margin}`;
  return `jump ${r.seq}: planned at tick ${r.requestTick ?? '?'}, ready at ${r.readyTick ?? '?'}${r.how ? ` (${r.how})` : ''}, took off at ${r.takeoffTick ?? '?'}, landed at ${r.landTick ?? '?'}, waited ${r.waitTicks === null ? '?' : ticks(r.waitTicks)}${ms}${margin}${r.late ? ', LATE: ready after the landing she took off from' : ''}`;
}

/** Planner time against air time, one row per jump (spec §4.5). Scrolls inside itself, never the page (390 px). Memoised:
 *  the diorama re-renders every animation frame while playing, and the rows change only when the Timeline does. */
export const ThinkingStrip = memo(function ThinkingStrip({ rows, onSeek }: { rows: ThinkingRow[]; onSeek(t: number): void }) {
  const ts = rows.flatMap(r => [r.requestTick, r.readyTick, r.takeoffTick, r.landTick, r.takeoffTick !== null && r.waitTicks ? r.takeoffTick - r.waitTicks : null].filter((x): x is number => x !== null));
  const t0 = ts.length ? Math.min(...ts) : 0, t1 = ts.length ? Math.max(...ts) : 0;
  const x = (tick: number) => 64 + (tick - t0) * PX;
  const bar = (a: number | null, b: number | null, cls: string, what: string) =>
    a !== null && b !== null && b >= a ? <span title={`${what}: tick ${a} → ${b}`} className={`absolute top-1/2 h-3 -translate-y-1/2 rounded-sm ${cls}`} style={{ left: x(a), width: Math.max(2, (b - a) * PX) }} /> : null;
  return (
    <div role='region' aria-label='Thinking strip' tabIndex={0} className='max-h-72 max-w-full overflow-auto overscroll-contain rounded-md border bg-card text-xs focus-visible:outline-2 focus-visible:outline-ring'>
      <div className='relative min-w-full py-1' style={{ width: x(t1) + 80 }}>
        {rows.map(r => (
          <button key={r.seq} type='button' aria-label={label(r)} title={label(r)} onClick={() => onSeek(r.t)}
            className='relative block h-7 w-full cursor-pointer text-left hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none active:bg-muted pointer-coarse:h-11'>
            <span className='sticky left-0 z-10 inline-flex h-full w-14 items-center bg-card px-2 tabular-nums text-muted-foreground'>#{r.seq}</span>
            {bar(r.requestTick, r.readyTick, r.slow ? 'bg-sky-400' : 'bg-sky-600', 'planner')}
            {r.waitTicks ? bar(r.takeoffTick !== null ? r.takeoffTick - r.waitTicks : null, r.takeoffTick, 'bg-[repeating-linear-gradient(45deg,var(--color-amber-500)_0_3px,transparent_3px_6px)]', 'waiting on the ground') : null}
            {bar(r.takeoffTick, r.landTick, 'bg-emerald-500/70', 'in the air')}
            {r.late && r.readyTick !== null && <span className='absolute top-1/2 -translate-y-1/2 rounded bg-red-600 px-1 text-[10px] font-semibold text-white' style={{ left: x(r.readyTick) + 4 }}>late</span>}
            {r.requestTick === null && r.takeoffTick === null && <span className='absolute left-16 top-1/2 -translate-y-1/2 whitespace-nowrap text-muted-foreground'>Timing unavailable{r.plannerMs !== null ? ` · ${Math.round(r.plannerMs)} ms` : ''}</span>}
          </button>
        ))}
      </div>
    </div>
  );
});

/** Every landing as a button (spec §4.6): the keyboard and touch way to each one, with its exact values beside the list.
 *  Shown always, X-ray or not. Memoised like the strip: nothing here changes with the clock, and selection survives playback. */
const LandingList = memo(function LandingList({ tl, rows, selected, onSelect, onSeek }: Pick<LayerPanelProps, 'tl' | 'selected' | 'onSelect' | 'onSeek'> & { rows: ThinkingRow[] }) {
  const jumps = tl.layers.parkour.jumps;
  const sel = jumps.find(j => j.seq === selected);
  if (jumps.length === 0) return null;
  return (
    <div className='grid min-w-0 gap-3 md:grid-cols-2 rounded-lg border bg-card p-3'>
      <div className='min-w-0'><h3 className='mb-2 flex items-center gap-1.5 text-xs font-medium'><Footprints aria-hidden='true' className='size-3.5 text-blue-500' />Landings<span className='text-muted-foreground'>{jumps.length}</span></h3><ol aria-label='Landings' className='flex max-h-48 min-w-0 flex-wrap content-start gap-1 overflow-y-auto overscroll-contain'>
        {jumps.map(j => (
          <li key={j.seq}>
            <button type='button' aria-label={`landing ${j.seq} on ${j.blockType}`} title={`landing ${j.seq} on ${j.blockType}`} aria-pressed={j.seq === selected}
              onClick={() => { onSelect(j.seq === selected ? null : j.seq); onSeek(j.t); }}
              className={`min-h-9 min-w-11 cursor-pointer rounded border px-1.5 text-xs tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-ring pointer-coarse:min-h-11 ${j.seq === selected ? 'border-primary bg-primary/15' : 'hover:bg-muted'}`}>
              <span aria-hidden='true' className='mr-1.5 inline-block size-1.5 rounded-sm' style={{ backgroundColor: blockDef(j.blockType).material.base }} />{j.seq}
            </button>
          </li>
        ))}
      </ol></div>
      {sel ? (
        <dl role='group' aria-label={`landing ${sel.seq} values`} className='grid grid-cols-2 content-start gap-x-3 gap-y-1 rounded-md border p-2 text-xs'>
          {landingValues(sel, rows.find(r => r.seq === sel.seq)).map(([k, v]) => (
            <div key={k} className='contents'><dt className='text-muted-foreground'>{k}</dt><dd className='text-right font-medium tabular-nums'>{(() => { const match = v.match(/^(.*?)( b\/tick| ms| ticks?| b)$/); return match ? <>{match[1]}<span className='font-normal text-muted-foreground'>{match[2]}</span></> : v; })()}</dd></div>
          ))}
        </dl>
      ) : <p className='text-xs text-muted-foreground md:pt-1'>Pick a landing to see its exact values.</p>}
    </div>
  );
});

/** The DOM half of the layer (spec §4.5/4.6): the death card and the thinking strip with the X-ray on (or without WebGL);
 *  the landing list always. */
export function XrayParkourPanels({ tl, xray, selected, onSelect, onSeek }: LayerPanelProps) {
  const death = useMemo(() => deathCard(tl), [tl]);
  const rows = useMemo(() => thinkingRows(tl), [tl]);
  return (
    <div className='grid min-w-0 gap-3'>
      {xray && death && <div role='note' className='rounded-md border border-red-500/40 bg-red-500/5 px-3 py-2 text-sm'><span className='font-semibold'>Why she fell: </span>{death}</div>}
      {xray && rows.length > 0 && <ThinkingStrip rows={rows} onSeek={onSeek} />}
      {xray && rows.length > 0 && <p className='text-xs text-muted-foreground'><span className='text-sky-600 dark:text-sky-400'>Blue</span>: planner (request → ready; lighter = over 500 ms). <span className='text-amber-600 dark:text-amber-400'>Hatched</span>: holding on the ground. <span className='text-emerald-600 dark:text-emerald-400'>Green</span>: in the air. <span className='font-semibold text-red-600 dark:text-red-400'>late</span> = ready after the landing she took off from.</p>}
      <LandingList tl={tl} rows={rows} selected={selected} onSelect={onSelect} onSeek={onSeek} />
    </div>
  );
}
