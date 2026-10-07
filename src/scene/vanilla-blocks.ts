import { BufferGeometry, Float32BufferAttribute, Matrix4, Vector3 } from 'three';
import type { BlockStateProps } from '../model';
import bundle from '../registry/vanilla-blocks.json';

type FaceName = 'north' | 'south' | 'east' | 'west' | 'up' | 'down';
interface Face { texture: string; uv?: number[]; rotation?: number }
interface Element { from: number[]; to: number[]; faces: Partial<Record<FaceName, Face>> }
interface Variant { model: string; x?: number; y?: number; uvlock?: boolean }
type Condition = Record<string, string | Condition[]>;
interface State { variants?: Record<string, Variant | Variant[]>; multipart?: { when?: Condition; apply: Variant | Variant[] }[] }
const data = bundle as unknown as { states: Record<string, State>; models: Record<string, { elements: Element[] }> };
const canonical = (name: string) => name.replace(/^minecraft:/, '');

function matches(when: Condition, state: BlockStateProps): boolean {
  return Object.entries(when).every(([key, value]) => {
    if (key === 'OR' || key === 'AND') return (value as Condition[])[key === 'OR' ? 'some' : 'every'](c => matches(c, state));
    return (value as string).split('|').includes(String(state[key]));
  });
}

/** Recorded properties select vanilla variants/multipart components, including pane/fence connections.
 * Missing properties use explicit neutral defaults; never infer a connection from an unrecorded neighbour. */
export function modelsFor(name: string, props: BlockStateProps | null): Variant[] {
  const def = data.states[name];
  if (!def) return [];
  const state = { north: false, south: false, east: false, west: false, waterlogged: false, bottom: false, unstable: false, facing: 'east', half: name.endsWith('_trapdoor') ? 'bottom' : 'lower', hinge: 'left', open: false, type: 'bottom', ...props };
  const first = (v: Variant | Variant[]) => Array.isArray(v) ? v[0] : v; // Stable replay; no random texture changes on seeks.
  if (def.variants) {
    const found = Object.entries(def.variants).find(([key]) => !key || matches(Object.fromEntries(key.split(',').map(p => p.split('='))), state));
    return found ? [first(found[1])] : [];
  }
  return (def.multipart ?? []).filter(p => !p.when || matches(p.when, state)).map(p => first(p.apply));
}

function corners(face: FaceName, a: number[], b: number[]): number[][] {
  const [x, y, z] = a, [X, Y, Z] = b;
  switch (face) {
    case 'north': return [[X,Y,z],[x,Y,z],[X,y,z],[x,y,z]];
    case 'south': return [[x,Y,Z],[X,Y,Z],[x,y,Z],[X,y,Z]];
    case 'east': return [[X,Y,Z],[X,Y,z],[X,y,Z],[X,y,z]];
    case 'west': return [[x,Y,z],[x,Y,Z],[x,y,z],[x,y,Z]];
    case 'up': return [[x,Y,z],[X,Y,z],[x,Y,Z],[X,Y,Z]];
    case 'down': return [[x,y,Z],[X,y,Z],[x,y,z],[X,y,z]];
  }
}
function defaultUV(face: FaceName, a: number[], b: number[]): number[] {
  const [x,y,z] = a, [X,Y,Z] = b;
  switch (face) {
    case 'north': return [16-X,16-Y,16-x,16-y];
    case 'south': return [x,16-Y,X,16-y];
    case 'east': return [16-Z,16-Y,16-z,16-y];
    case 'west': return [z,16-Y,Z,16-y];
    case 'up': return [x,z,X,Z];
    case 'down': return [x,16-Z,X,16-z];
  }
}

export interface BlockMesh { key: string; geometry: BufferGeometry; textures: string[] }
const cache = new Map<string, BlockMesh>();
/** Bake the selected vanilla faces/UVs into one reusable instanced geometry per state. No per-frame mesh rebuilding. */
export function vanillaMesh(name: string, props: BlockStateProps | null): BlockMesh | null {
  const variants = modelsFor(name, props);
  if (!variants.length) return null;
  const key = JSON.stringify(variants);
  const cached = cache.get(key); if (cached) return cached;
  const geometry = new BufferGeometry(), positions: number[] = [], uvs: number[] = [], textures: string[] = [];
  for (const variant of variants) {
    const transform = new Matrix4().makeTranslation(.5,.5,.5)
      .multiply(new Matrix4().makeRotationY(-(variant.y ?? 0) * Math.PI / 180))
      .multiply(new Matrix4().makeRotationX(-(variant.x ?? 0) * Math.PI / 180))
      .multiply(new Matrix4().makeTranslation(-.5,-.5,-.5));
    for (const e of data.models[canonical(variant.model)].elements) {
      for (const [side, face] of Object.entries(e.faces) as [FaceName, Face][]) {
        const start = positions.length / 3;
        const pts = corners(side,e.from,e.to).map(p => new Vector3(...p as [number,number,number]).multiplyScalar(1/16).applyMatrix4(transform));
        const [u,v,U,V] = face.uv ?? defaultUV(side,e.from,e.to);
        const uv = [[u,v],[U,v],[u,V],[U,V]];
        // Texture rotation follows the perimeter, rather than swapping rectangular UV bounds.
        const perimeter = [0,1,3,2], shift = (face.rotation ?? 0) / 90;
        let rotated = uv.map((_,i) => uv[perimeter[(perimeter.indexOf(i) + shift) % 4]]);
        if (variant.uvlock && (variant.x || variant.y)) {
          const normal = pts[2].clone().sub(pts[0]).cross(pts[1].clone().sub(pts[0]));
          const worldSide: FaceName = Math.abs(normal.y) > Math.abs(normal.x) && Math.abs(normal.y) > Math.abs(normal.z) ? (normal.y>0 ? 'up' : 'down') : Math.abs(normal.x)>Math.abs(normal.z) ? (normal.x>0 ? 'east' : 'west') : (normal.z>0 ? 'south' : 'north');
          const min=new Vector3(Infinity,Infinity,Infinity), max=new Vector3(-Infinity,-Infinity,-Infinity);
          pts.forEach(p=>{min.min(p);max.max(p);});
          const reference=corners(worldSide,min.toArray(),max.toArray()).map(p=>new Vector3(...p as [number,number,number]));
          const locked=rotated;
          rotated=pts.map(p=>locked[reference.findIndex(q=>q.distanceToSquared(p)<1e-12)]);
        }
        for (const i of [0,2,1,2,3,1]) {
          positions.push(pts[i].x,pts[i].y,pts[i].z);
          uvs.push(rotated[i][0]/16,1-rotated[i][1]/16);
        }
        let material = textures.indexOf(face.texture);
        if (material < 0) { material = textures.length; textures.push(face.texture); }
        geometry.addGroup(start,6,material);
      }
    }
  }
  // One draw group per texture, not per face (especially important for scaffolding).
  const groupedPositions: number[] = [], groupedUVs: number[] = [];
  const groups = [...geometry.groups]; geometry.clearGroups();
  textures.forEach((_,material) => {
    const start = groupedPositions.length/3;
    for (const group of groups) if (group.materialIndex === material) {
      groupedPositions.push(...positions.slice(group.start*3,(group.start+group.count)*3));
      groupedUVs.push(...uvs.slice(group.start*2,(group.start+group.count)*2));
    }
    geometry.addGroup(start,groupedPositions.length/3-start,material);
  });
  geometry.setAttribute('position',new Float32BufferAttribute(groupedPositions,3));
  geometry.setAttribute('uv',new Float32BufferAttribute(groupedUVs,2));
  geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  const result = { key, geometry, textures }; cache.set(key,result); return result;
}

/** Base orientation of a closed east-facing vanilla door. Three.js and Minecraft Y rotation signs differ. */
export function doorHinge(state: BlockStateProps | null) {
  const y = ({ east: 0, south: 90, west: 180, north: 270 } as Record<string, number>)[String(state?.facing)] ?? 0;
  return { base: -y * Math.PI / 180, x: 1.5/16, z: state?.hinge === 'right' ? 14.5/16 : 1.5/16, direction: state?.hinge === 'right' ? -1 : 1 };
}
