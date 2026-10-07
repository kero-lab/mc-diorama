'use client';
import { createContext, useContext, type ButtonHTMLAttributes, type ComponentType, type ReactNode } from 'react';
import type { Recording } from './model';
import type { TimelineSource } from './live-feed';

/** Everything site-specific the diorama needs. The package itself makes no network calls and knows no URLs (spec §3.1). */
export interface DioramaHost {
  /** A stored run (`{ runId }`) or the open run's seed (`{ live: true }`). 'none': no open run; 'missing': nothing stored. */
  loadRecording(source: TimelineSource, signal?: AbortSignal): Promise<Recording | 'none' | 'missing'>;
  /** Base URL of the Minecraft art: textures at `${assetBase}/1.21.11/<name>.png`, her skin at `${assetBase}/rem-skin.png`. */
  assetBase: string;
  /** localStorage key for the viewer's camera/X-ray/rotation prefs. */
  prefsKey: string;
  /** Display metadata for a schematic id (null when unknown); `dataSha` pins the catalogue version. */
  schematicLabel(id?: string | null, dataSha?: string): SchematicLabel | null;
  schematicName(id?: string | null, dataSha?: string): string;
  /** The site's button (RemHub: shadcn). Must accept `variant` and `size` as the shadcn button does. */
  Button: ComponentType<DioramaButtonProps>;
}
export interface SchematicLabel { name: string; dataSha: string; [k: string]: unknown }
export type DioramaButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'default' | 'outline' | 'secondary' | 'ghost'; size?: 'sm' | 'default' | 'icon' };

const HostContext = createContext<DioramaHost | null>(null);
export function DioramaHostProvider({ host, children }: { host: DioramaHost; children: ReactNode }) {
  return <HostContext.Provider value={host}>{children}</HostContext.Provider>;
}
export function useDioramaHost(): DioramaHost {
  const h = useContext(HostContext);
  if (!h) throw new Error('@kero-lab/mc-diorama: wrap the diorama in <DioramaHostProvider host={…}>');
  return h;
}
