'use client';
import type { FrameState } from './frame';
import type { Timeline } from './types';

/** Generic show overlay (spec §4.4): the score, and the run-end card once T reaches the end. */
export function ShowOverlay({ tl, frame }: { tl: Timeline; frame: FrameState }) {
  return (
    <>
      <div className='pointer-events-none absolute left-3 top-3 rounded-md bg-background/80 px-2.5 py-1 shadow-sm backdrop-blur'>
        <div data-testid='diorama-score' className='text-2xl font-semibold tabular-nums leading-none'>{frame.score}</div>
        <div className='text-[10px] uppercase tracking-wider text-muted-foreground'>score</div>
      </div>
      {frame.atEnd && tl.ended && (
        <div className='absolute inset-x-0 bottom-10 flex justify-center px-3'>
          <div role='status' className='rounded-md border bg-background/90 px-3 py-1.5 text-center text-xs shadow sm:px-4 sm:py-2 sm:text-sm'>
            Run over · <span className='font-semibold tabular-nums'>{tl.ended.score}</span> · {tl.ended.reason}{tl.ended.death ? ` (${tl.ended.death.cause})` : ''} · {Math.round(tl.ended.durationMs / 1000)} s
          </div>
        </div>
      )}
    </>
  );
}
