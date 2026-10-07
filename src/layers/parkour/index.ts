import type { LayerDef } from '../../registry/layers';
import { publicParkourMarkers } from './derive';
import { ParkourOverlay } from './overlay';
import { ParkourPanels } from './panels';
import { ParkourScene } from './scene';

export const PARKOUR_LAYER: LayerDef = { activity: 'parkour', label: 'Parkour', xray: false, Scene: ParkourScene, Overlay: ParkourOverlay, Panels: ParkourPanels, markers: publicParkourMarkers };
