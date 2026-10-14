// src/vanilla/course-mesh.ts: the course as vanilla meshes a chunk section (spec §3.2): hidden faces culled, every
// vertex lit by smooth-lighting AO × face shade, one buffer per texture and render pass. Built once per world change.
import { Color, SRGBColorSpace } from 'three';
import { vanillaQuads } from '../scene/vanilla-blocks';
import { blockKey, type WorldBlock } from '../types';
import { FACE_NORMAL, FACE_SHADE, aoAt, faceCornerAO, hidesFace, shadeBrightness } from './light';

export type RenderPass = 'opaque' | 'cutout' | 'translucent';
/** ItemBlockRenderTypes (1.21.11): stained glass, slime and honey translucent; textures with holes cutout. */
export const RENDER_PASS: Record<string, RenderPass> = {
  red_stained_glass: 'translucent', slime_block: 'translucent', honey_block: 'translucent',
  glass_pane: 'cutout', ladder: 'cutout', oak_door: 'cutout', oak_trapdoor: 'cutout', scaffolding: 'cutout',
};
export interface CoursePart { key: string; texture: string; pass: RenderPass; positions: Float32Array; uvs: Float32Array; colors: Float32Array; blockOfTriangle: string[] }
export interface CourseMesh { parts: CoursePart[]; fallback: WorldBlock[] }

const memo = new WeakMap<readonly WorldBlock[], CourseMesh>();
const ORDER = [0, 2, 1, 2, 3, 1];
const linear = (s: number) => new Color().setRGB(s, s, s, SRGBColorSpace).r;   // vanilla multiplies in sRGB; three blends in linear

export function buildCourseMesh(blocks: readonly WorldBlock[]): CourseMesh {
  const hit = memo.get(blocks); if (hit) return hit;
  const at = new Map(blocks.map(x => [blockKey(x.at), x]));
  const cell = (x: number, y: number, z: number) => at.get(`${x},${y},${z}`);
  const shadeAt = (x: number, y: number, z: number) => shadeBrightness(cell(x, y, z));
  const acc = new Map<string, { texture: string; pass: RenderPass; p: number[]; uv: number[]; c: number[]; tri: string[] }>();
  const fallback: WorldBlock[] = [];
  for (const block of blocks) {
    const quads = vanillaQuads(block.name, block.state);
    if (!quads.length) { fallback.push(block); continue; }
    const pass = RENDER_PASS[block.name] ?? 'opaque', key = blockKey(block.at);
    for (const q of quads) {
      if (q.cull) { const n = FACE_NORMAL[q.cull]; if (hidesFace(q.cull, block.name, cell(block.at[0] + n[0], block.at[1] + n[1], block.at[2] + n[2]))) continue; }
      const shade = q.shade ? FACE_SHADE[q.face] : 1;
      const ao = q.ao ? faceCornerAO(block.at, q.face, q.onBoundary, shadeAt) : null;
      const gk = `${q.texture}|${pass}`;
      const g = acc.get(gk) ?? { texture: q.texture, pass, p: [], uv: [], c: [], tri: [] };
      for (const i of ORDER) {
        const v = q.pts[i];
        g.p.push(block.at[0] + v[0], block.at[1] + v[1], block.at[2] + v[2]);
        g.uv.push(q.uv[i][0], q.uv[i][1]);
        const s = linear(shade * (ao ? aoAt(ao, v) : 1));
        g.c.push(s, s, s);
      }
      g.tri.push(key, key);
      acc.set(gk, g);
    }
  }
  const parts = [...acc.entries()].map(([k, g]) => ({ key: k, texture: g.texture, pass: g.pass, positions: new Float32Array(g.p), uvs: new Float32Array(g.uv), colors: new Float32Array(g.c), blockOfTriangle: g.tri }));
  const mesh = { parts, fallback }; memo.set(blocks, mesh); return mesh;
}
