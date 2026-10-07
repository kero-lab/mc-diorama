// src/index.ts — the public entry. Never import from ./debug here (spec §3.1; enforced in Task 5).
export const PACKAGE = '@kero-lab/mc-diorama';
export * from './model';
export * from './live-feed';
export * from './host';
export * from './types';
export * from './timeline';
export * from './seed';
export * from './playback';
export * from './frame';
export * from './interp';
export * from './render-clock';
export * from './prefs';
export { useReducedMotion } from './use-reduced-motion';
