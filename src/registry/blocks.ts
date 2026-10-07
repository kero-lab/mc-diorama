import type { BlockStateProps, Vec3T } from '../model';

export type BlockShape = 'cube' | 'slab-bottom' | 'slab-top' | 'pane' | 'fence-post' | 'ladder' | 'door' | 'scaffolding' | 'carpet';
export type Pattern = 'wool' | 'terracotta' | 'concrete' | 'glass' | 'ice' | 'quartz' | 'planks' | 'slime' | 'honey' | 'stone' | 'scaffold' | 'plain';
export interface MaterialDef { key: string; base: string; accent: string; pattern: Pattern; opacity: number }
export interface BlockDef { name: string; label: string; shape: BlockShape; material: MaterialDef; known: boolean }
export interface Box { size: Vec3T; center: Vec3T }

const M = (key: string, base: string, accent: string, pattern: Pattern, opacity = 1): MaterialDef => ({ key, base, accent, pattern, opacity });
const DEFS: Record<string, { label: string; shape: BlockShape; material: MaterialDef }> = {
  red_wool: { label: 'Red wool', shape: 'cube', material: M('red_wool', '#a12722', '#c43a33', 'wool') },
  lime_wool: { label: 'Lime wool', shape: 'cube', material: M('lime_wool', '#70b919', '#8fd13a', 'wool') },
  red_terracotta: { label: 'Red terracotta', shape: 'cube', material: M('red_terracotta', '#8e3c2e', '#a24c3c', 'terracotta') },
  red_concrete: { label: 'Red concrete', shape: 'cube', material: M('red_concrete', '#8e2121', '#9c2b2b', 'concrete') },
  red_stained_glass: { label: 'Red stained glass', shape: 'cube', material: M('red_stained_glass', '#993333', '#c25050', 'glass', 0.55) },
  packed_ice: { label: 'Packed ice', shape: 'cube', material: M('packed_ice', '#8db4fe', '#b3cdff', 'ice') },
  smooth_quartz_slab: { label: 'Smooth quartz slab', shape: 'slab-bottom', material: M('quartz', '#ebe5de', '#f7f3ee', 'quartz') },
  quartz_block: { label: 'Quartz block', shape: 'cube', material: M('quartz', '#ebe5de', '#f7f3ee', 'quartz') },
  smooth_quartz: { label: 'Smooth quartz', shape: 'cube', material: M('quartz', '#ebe5de', '#f7f3ee', 'quartz') },
  glass_pane: { label: 'Glass pane', shape: 'pane', material: M('glass', '#c8e6f0', '#eef8fb', 'glass', 0.45) },
  oak_fence: { label: 'Oak fence', shape: 'fence-post', material: M('oak', '#a2834f', '#b8955c', 'planks') },
  slime_block: { label: 'Slime block', shape: 'cube', material: M('slime', '#6fc05a', '#94dd7e', 'slime', 0.85) },
  honey_block: { label: 'Honey block', shape: 'cube', material: M('honey', '#f2a51f', '#fbc650', 'honey', 0.9) },
  ladder: { label: 'Ladder', shape: 'ladder', material: M('ladder', '#8b6a3a', '#a57d47', 'planks') },
  oak_door: { label: 'Oak door', shape: 'door', material: M('oak_door', '#9c7b4a', '#b39060', 'planks') },
  scaffolding: { label: 'Scaffolding', shape: 'scaffolding', material: M('scaffolding', '#c9a35a', '#e0bb6d', 'scaffold') },
  stone: { label: 'Stone', shape: 'cube', material: M('stone', '#7d7d7d', '#919191', 'stone') },
};
const FAMILIES: [RegExp, BlockShape][] = [[/_slab$/, 'slab-bottom'], [/_door$/, 'door'], [/_carpet$/, 'carpet'], [/_pane$/, 'pane'], [/_fence$/, 'fence-post'], [/^ladder$/, 'ladder']];
const UNKNOWN = M('unknown', '#6b7280', '#9ca3af', 'plain');
const label = (name: string) => name.replace(/_/g, ' ');

export function blockDef(name: string): BlockDef {
  const d = Object.hasOwn(DEFS, name) ? DEFS[name] : undefined;   // own keys only: 'constructor' is a block name here
  if (d) return { name, known: true, ...d };
  const fam = FAMILIES.find(([re]) => re.test(name));
  return { name, known: false, label: label(name), shape: fam ? fam[1] : 'cube', material: UNKNOWN };
}

export function shapeOf(def: BlockDef, state: BlockStateProps | null): BlockShape {
  if (def.shape === 'slab-bottom' || def.shape === 'slab-top') return state?.type === 'top' ? 'slab-top' : state?.type === 'double' ? 'cube' : 'slab-bottom';
  return def.shape;
}

const box = (min: Vec3T, max: Vec3T): Box => ({ size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]], center: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2] });
const T3 = 3 / 16;
/** A door's thin box (3/16) for its facing, open state and hinge: shut, it lies on the side it faces away from; open, it
 *  swings to the side its hinge names. In our own words, from the in-game behaviour; no game code is copied. */
const SIDE = { west: box([0, 0, 0], [T3, 1, 1]), east: box([1 - T3, 0, 0], [1, 1, 1]), north: box([0, 0, 0], [1, 1, T3]), south: box([0, 0, 1 - T3], [1, 1, 1]) } as const;
type Side = keyof typeof SIDE;
const SHUT: Record<string, Side> = { east: 'west', west: 'east', south: 'north', north: 'south' };
const OPEN_LEFT: Record<string, Side> = { east: 'north', south: 'east', west: 'south', north: 'west' };
const OPEN_RIGHT: Record<string, Side> = { east: 'south', south: 'west', west: 'north', north: 'east' };
function doorBox(state: BlockStateProps | null): Box {
  const facing = typeof state?.facing === 'string' && Object.hasOwn(SHUT, state.facing) ? state.facing : 'east';
  const side = state?.open === true ? (state?.hinge === 'right' ? OPEN_RIGHT : OPEN_LEFT)[facing] : SHUT[facing];
  return SIDE[side];
}
/** A ladder hangs on the wall behind it: facing north = on the south side of its cell. */
const LADDER_SIDE: Record<string, Side> = { north: 'south', south: 'north', east: 'west', west: 'east' };

export function boxesOf(def: BlockDef, state: BlockStateProps | null): Box[] {
  switch (shapeOf(def, state)) {
    case 'slab-bottom': return [box([0, 0, 0], [1, 0.5, 1])];
    case 'slab-top': return [box([0, 0.5, 0], [1, 1, 1])];
    case 'carpet': return [box([0, 0, 0], [1, 1 / 16, 1])];
    case 'fence-post': return [box([0.375, 0, 0.375], [0.625, 1, 0.625])];
    case 'pane': return [box([0, 0, 0.4375], [1, 1, 0.5625]), box([0.4375, 0, 0], [0.5625, 1, 1])];
    case 'ladder': return [SIDE[typeof state?.facing === 'string' && Object.hasOwn(LADDER_SIDE, state.facing) ? LADDER_SIDE[state.facing] : 'south']];
    case 'door': return [doorBox(state)];
    case 'scaffolding': return [box([0, 14 / 16, 0], [1, 1, 1]), ...[[0, 0], [14 / 16, 0], [0, 14 / 16], [14 / 16, 14 / 16]].map(([x, z]) => box([x, 0, z], [x + 2 / 16, 14 / 16, z + 2 / 16]))];
    default: return [box([0, 0, 0], [1, 1, 1])];
  }
}
