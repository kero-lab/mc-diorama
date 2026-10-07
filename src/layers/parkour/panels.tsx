'use client';
import { memo, useMemo } from 'react';
import { Footprints } from 'lucide-react';
import { blockDef } from '../../registry/blocks';
import type { LayerPanelProps } from '../../registry/layers';
import { landingValues, thinkingRows, type ThinkingRow } from './derive';

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

/** The DOM half of the layer, public build (spec §4.6, §3.1): the landing list. The thinking strip, death card and legend are X-ray
 *  and live in src/debug. */
export function ParkourPanels({ tl, selected, onSelect, onSeek }: LayerPanelProps) {
  const rows = useMemo(() => thinkingRows(tl), [tl]);
  return (
    <div className='grid min-w-0 gap-3'>
      <LandingList tl={tl} rows={rows} selected={selected} onSelect={onSelect} onSeek={onSeek} />
    </div>
  );
}
