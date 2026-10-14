// src/vanilla/particles.ts: vanilla sprint dust and fall bursts (spec §5, VANILLA-RENDER.md §7). Pure: the particles alive
// at T are re-simulated from their seeded birth every call; nothing persists between calls, so seeking is exact.
//
// Source blocks come from the CURRENT frame's blocks (callers pass frame.blocks), looked up in a Map memoised per blocks
// array. Not blocksAt(tl, pastT) per sample: its memo is one fold per run that rebuilds from scratch whenever it is asked
// for an earlier index, and stateAt shares it, so per-frame past lookups would rebuild the whole world every frame. The
// cost: a block placed or removed in the last ~2 s is judged as it is now, not as it was at the particle's birth.
import bundle from '../registry/vanilla-blocks.json';
import { indexAt } from '../interp';
import type { Vec3T } from '../model';
import { blockKey, TICK_MS, type Sample, type Timeline, type WorldBlock } from '../types';

/** u/v: the quarter-window origin in the sprite, 0..0.75 (TerrainParticle uo/4, vo/4; u is drawn flipped). size: half-extent. */
export interface Particle { p: Vec3T; size: number; texture: string; u: number; v: number }
export const MAX_PARTICLES = 512;
/** Particle(): lifetime = (int)(4 / (r·0.9 + 0.1)) <= 40. Particle#tick removes on the tick where age (before ++) >= lifetime,
 *  so a particle is drawn for lifetime + 1 tick intervals after its birth. */
const MAX_LIFE = 40;
const LOOKBACK_MS = (MAX_LIFE + 1) * TICK_MS;
/** Bounded scan back for the start of a fall (samples are one per tick). */
const MAX_FALL_SCAN = 600;
const particleTextures = (bundle as unknown as { particles: Record<string, string> }).particles;
export const particleTexture = (block: string) => particleTextures[block] ?? 'block/stone';

function mulberry32(a: number) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const gauss = (r: () => number) => Math.sqrt(-2 * Math.log(Math.max(1e-12, r()))) * Math.cos(2 * Math.PI * r());

const indexes = new WeakMap<readonly WorldBlock[], Map<string, WorldBlock>>();
function blockIndex(blocks: readonly WorldBlock[]): Map<string, WorldBlock> {
  let m = indexes.get(blocks);
  if (!m) { m = new Map(blocks.map(b => [blockKey(b.at), b])); indexes.set(blocks, m); }
  return m;
}
const get = (m: Map<string, WorldBlock>, x: number, y: number, z: number) => m.get(`${x},${y},${z}`);
const climbable = (b: WorldBlock | undefined) => !!b && /ladder|vine|scaffolding/.test(b.name);

/** Entity#getOnPosLegacy = getOnPos(0.2): the main supporting block's column at floor(y − 0.2) when on ground, else the
 *  entity's own column. The supporting block is the one under the 0.6-wide box nearest the entity's position (vanilla
 *  CollisionGetter#findSupportingBlock, by distToCenterSqr; not in the decompile, behaviour as known). */
function onPos(s: Sample, m: Map<string, WorldBlock>): Vec3T {
  const [x, y, z] = s.p, oy = Math.floor(y - 0.2);
  if (s.g) {
    const by = Math.floor(y - 1e-6);
    let best: Vec3T | null = null, bestD = Infinity;
    for (let bx = Math.floor(x - 0.3); bx <= Math.floor(x + 0.3); bx++) for (let bz = Math.floor(z - 0.3); bz <= Math.floor(z + 0.3); bz++) {
      if (!get(m, bx, by, bz)) continue;
      const d = (bx + 0.5 - x) ** 2 + (by + 0.5 - y) ** 2 + (bz + 0.5 - z) ** 2;
      if (d < bestD) { bestD = d; best = [bx, oy, bz]; }
    }
    if (best) return best;
  }
  return [Math.floor(x), oy, Math.floor(z)];
}

/** fallDistance as LivingEntity#checkFallDamage reads it on the landing sample k: the downward travel of every tick since
 *  the last on-ground tick (Entity#checkFallDamage adds −dy when dy < 0), the landing tick's own dy excluded (LivingEntity
 *  reads it before calling super). Reset by a teleport/respawn and, when blocks are given, by a climbable
 *  (LivingEntity#handleOnClimbable). 0 unless k is a landing. */
export function fallDistanceAt(samples: readonly Sample[], k: number, blocks?: Map<string, WorldBlock>): number {
  if (k < 1 || !samples[k].g || samples[k - 1].g) return 0;
  let d = 0;
  for (let j = k - 1; j >= 1 && k - j <= MAX_FALL_SCAN; j--) {
    const s = samples[j];
    if (s.reset || (blocks && climbable(get(blocks, Math.floor(s.p[0]), Math.floor(s.p[1]), Math.floor(s.p[2]))))) break;
    d += Math.max(0, samples[j - 1].p[1] - s.p[1]);
    if (samples[j - 1].g) break;
  }
  return d;
}

/** One particle's seeded birth, before the Particle constructor runs. */
interface Birth { t: number; at: Vec3T; dir: Vec3T; floor: number; texture: string; r: () => number }

function sprintBirth(s: Sample, i: number, m: Map<string, WorldBlock>): Birth | null {
  // Entity#canSpawnSprintParticle: sprinting, not crouching (no onGround check: an airborne Rem simply has air at onPos).
  if (!s.c.includes('s') || s.c.includes('k') || !s.v) return null;
  const on = onPos(s, m), b = get(m, on[0], on[1], on[2]);
  if (!b) return null;                                                   // air: RenderShape.INVISIBLE
  const r = mulberry32(i * 1009);
  // Entity#spawnSprintParticle: ±width/2 (player width 0.6), clamped into the onPos column when it is not her own
  let x = s.p[0] + (r() - 0.5) * 0.6, z = s.p[2] + (r() - 0.5) * 0.6;
  if (Math.floor(s.p[0]) !== on[0]) x = Math.min(on[0] + 1, Math.max(on[0], x));
  if (Math.floor(s.p[2]) !== on[2]) z = Math.min(on[2] + 1, Math.max(on[2], z));
  return { t: s.t, at: [x, s.p[1] + 0.1, z], dir: [-4 * s.v[0], 1.5, -4 * s.v[2]], floor: b.at[1] + 1, texture: particleTexture(b.name), r };
}

function fallBirths(samples: readonly Sample[], i: number, m: Map<string, WorldBlock>, out: Birth[]): void {
  const s = samples[i];
  // LivingEntity#checkFallDamage: power = floor(fallDistance + 1e-6 − safe_fall_distance 3), count = (int)(150·min(0.2 + power/15, 2.5))
  const power = Math.max(0, Math.floor(fallDistanceAt(samples, i, m) + 1e-6 - 3));
  if (power <= 0) return;
  const on = onPos(s, m), b = get(m, on[0], on[1], on[2]);
  if (!b) return;                                                         // !state.isAir()
  let x = s.p[0], z = s.p[2];
  if (on[0] !== Math.floor(x) || on[2] !== Math.floor(z)) {               // pulled to the supporting block's edge
    const dx = x - on[0] - 0.5, dz = z - on[2] - 0.5, d = Math.max(Math.abs(dx), Math.abs(dz));
    x = on[0] + 0.5 + dx / d * 0.5; z = on[2] + 0.5 + dz / d * 0.5;
  }
  const n = Math.floor(150 * Math.min(0.2 + power / 15, 2.5)), texture = particleTexture(b.name);
  // ServerLevel#sendParticles(count, offset 0, speed 0.15): each particle at the point, direction gaussian·0.15 per axis
  for (let k = 1; k <= n; k++) {
    const r = mulberry32(i * 1009 + k);
    out.push({ t: s.t, at: [x, s.p[1], z], dir: [gauss(r) * 0.15, gauss(r) * 0.15, gauss(r) * 0.15], floor: b.at[1] + 1, texture, r });
  }
}

/** Particle constructor + TerrainParticle constructor + Particle#tick, drawn at `e` ticks (fractional) after birth.
 *  Collision is simplified to the source block's top (vanilla collides the 0.2 box with every block). */
function simulate(b: Birth, e: number): Particle | null {
  const r = b.r;
  const lifetime = Math.floor(4 / (r() * 0.9 + 0.1));                  // Particle(level, x, y, z)
  const n = Math.floor(e), f = e - n;
  if (n > lifetime) return null;
  let vx = b.dir[0] + (r() * 2 - 1) * 0.4, vy = b.dir[1] + (r() * 2 - 1) * 0.4, vz = b.dir[2] + (r() * 2 - 1) * 0.4;
  const speed = (r() + r() + 1) * 0.15, len = Math.hypot(vx, vy, vz) || 1;
  vx = vx / len * speed * 0.4; vy = vy / len * speed * 0.4 + 0.1; vz = vz / len * speed * 0.4;
  const size = 0.1 * (r() * 0.5 + 0.5) * 2 / 2;                        // SingleQuadParticle quadSize, TerrainParticle /= 2
  const u = r() * 3 / 4, v = r() * 3 / 4;                               // TerrainParticle uo, vo = r·3 (not floored)
  let x = b.at[0], y = b.at[1], z = b.at[2], xo = x, yo = y, zo = z, stopped = false, onGround = false;
  for (let t = 1; t <= n; t++) {
    xo = x; yo = y; zo = z;
    vy -= 0.04;                                                          // gravity 1.0 (TerrainParticle), before move
    if (!stopped) {                                                      // Particle#move (a no-op once stopped)
      const dy = vy, ay = y >= b.floor && y + dy < b.floor ? b.floor - y : dy;
      x += vx; y += ay; z += vz;
      if (Math.abs(dy) >= 1e-5 && Math.abs(ay) < 1e-5) stopped = true;   // stoppedByCollision: frozen for good
      onGround = ay !== dy && dy < 0;
    }
    vx *= 0.98; vy *= 0.98; vz *= 0.98;                                 // friction 0.98, after move
    if (onGround) { vx *= 0.7; vz *= 0.7; }
  }
  // SingleQuadParticle#extractRotatedQuad: lerp(partialTick, xo, x); interval 0 has xo = x = spawn
  return { p: [xo + (x - xo) * f, yo + (y - yo) * f, zo + (z - zo) * f], size, texture: b.texture, u, v };
}

/** Every particle alive at T, oldest first, capped at MAX_PARTICLES (newest kept). `blocks`: the current frame's blocks. */
export function particlesAt(tl: Timeline, T: number, blocks: readonly WorldBlock[]): Particle[] {
  const ss = tl.samples, last = indexAt(ss, T);
  if (last < 0) return [];
  const m = blockIndex(blocks), births: Birth[] = [];
  for (let i = indexAt(ss, T - LOOKBACK_MS) + 1; i <= last; i++) {
    const s = ss[i];
    // ParticleEngine#tick adds new particles after ticking the old, so a particle spawned in a tick is first ticked in the next
    const sprint = sprintBirth(s, i, m);
    if (sprint) births.push(sprint);
    fallBirths(ss, i, m, births);
  }
  const out: Particle[] = [];
  for (const b of births) { const p = simulate(b, (T - b.t) / TICK_MS); if (p) out.push(p); }
  return out.length > MAX_PARTICLES ? out.slice(out.length - MAX_PARTICLES) : out;
}
