// src/registry/held-items.ts: the hand slot (spec A6). Ships empty: no recorded run holds anything yet. A future
// activity (mace or spear parkour) registers its item here with its art; an unregistered item draws nothing.
// An item component is authored in vanilla item-model coordinates, in blocks (the slot applies ItemInHandLayer's frame).
import type { ComponentType } from 'react';

export const HELD_ITEMS: Record<string, ComponentType> = {};
export const heldItemFor = (item: string | null): ComponentType | null => (item && Object.hasOwn(HELD_ITEMS, item) ? HELD_ITEMS[item] : null);
