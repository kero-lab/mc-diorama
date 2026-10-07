import { createContext, type RefObject } from 'react';
import type { FrameState } from './frame';

/** The same stateAt-derived frame for all moving scene parts. DOM readouts publish
 * at 10 Hz; mesh/camera transforms read this ref on the graphics render clock. */
export const RenderFrameContext = createContext<RefObject<FrameState> | null>(null);
