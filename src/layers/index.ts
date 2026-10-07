import type { LayerDef } from '../registry/layers';
import { PARKOUR_LAYER } from './parkour';

/** Activity → layer, the public set (no X-ray; the debug set lives in @kero-lab/mc-diorama/debug). A new activity adds its entry here (spec goal 4). */
export const PUBLIC_LAYERS: Readonly<Record<string, LayerDef>> = { parkour: PARKOUR_LAYER };
