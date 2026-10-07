import { indexAt } from '../interp';
import { blockKey, type BlockChange, type WorldBlock } from '../types';

/** Both halves of a vanilla door are one rigid object. Recorder events can arrive a tick apart;
 * the cosmetic sweep starts on the first observed state change, and duplicate confirmations do not restart it.
 * This does not modify the authoritative block-state timeline. */
export function doorTrack(changes: readonly BlockChange[], block: WorldBlock): { t: number; open: boolean }[] {
  const [x,y,z]=block.at, baseY=y-(block.state?.half==='upper' ? 1 : 0);
  const keys=new Set([blockKey([x,baseY,z]),blockKey([x,baseY+1,z])]);
  const track: {t:number;open:boolean}[]=[];
  for (const change of changes) {
    if (!keys.has(change.key) || change.block?.name!==block.name) continue;
    const open=change.block.state?.open===true;
    if (!track.length || track.at(-1)!.open!==open) track.push({t:change.t,open});
  }
  return track;
}

export function doorOpenAt(track: readonly { t:number; open:boolean }[], T: number, reducedMotion=false): number {
  const i=indexAt(track,T), now=track[i], before=track[i-1];
  if (!now) return 0;
  const to=now.open ? 1 : 0, from=before ? (before.open ? 1 : 0) : to;
  const t=reducedMotion ? 1 : Math.max(0,Math.min(1,(T-now.t)/250));
  return from+(to-from)*t*t*(3-2*t);
}
