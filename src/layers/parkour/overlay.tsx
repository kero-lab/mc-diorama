'use client';
import { useDioramaHost } from '../../host';
import type { LayerOverlayProps } from '../../registry/layers';
import { moveKindOf } from './derive';

export const TITLE_MS = 2500;
/** The paste title card (spec §4.4), e.g. "Door climb · c086c587", for 2.5 s after the paste appears. */
export function ParkourOverlay({ tl, frame }: LayerOverlayProps) {
  const { schematicLabel } = useDioramaHost();
  const p = tl.layers.parkour.pastes.filter(x => x.t <= frame.T && frame.T - x.t < TITLE_MS).at(-1);
  if (!p) return null;
  return (
    <div className='pointer-events-none absolute inset-x-0 top-3 flex justify-end pl-24 pr-3 sm:justify-center sm:px-24' aria-live='polite'>
      <div className='rounded-md border bg-background/85 px-2.5 py-1 text-xs font-medium sm:px-3 sm:py-1.5 sm:text-sm shadow-sm backdrop-blur'>
        {p.drifted ? moveKindOf(p) : (schematicLabel(p.id)?.name ?? moveKindOf(p))} <span className='text-muted-foreground'>· {p.id}{p.drifted ? ' (drifted)' : ''}</span>
      </div>
    </div>
  );
}
