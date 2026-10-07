// @kero-lab/mc-diorama/debug — X-ray, planner timings, death cards. RemHub only (spec §3.1).
import type { LayerDef } from '../registry/layers';
import { PARKOUR_LAYER } from '../layers/parkour';
import { parkourMarkers } from '../layers/parkour/derive';
import { XrayParkourPanels } from './parkour-panels';
import { XrayParkourScene } from './parkour-scene';

export const DEBUG_PARKOUR_LAYER: LayerDef = { ...PARKOUR_LAYER, Scene: XrayParkourScene, Panels: XrayParkourPanels, markers: parkourMarkers, xray: true };
export const DEBUG_LAYERS: Readonly<Record<string, LayerDef>> = { parkour: DEBUG_PARKOUR_LAYER };
export { ThinkingStrip } from './parkour-panels';
export { parkourMarkers, thinkingRows, deathCard, planFor, sneakTicksAfter, SLOW_PLAN_MS } from '../layers/parkour/derive';
