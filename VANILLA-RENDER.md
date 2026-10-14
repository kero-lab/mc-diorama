# Vanilla rules this package follows

Reference: Minecraft Java 1.21.11 client (sha1 ba2df812c2d12e0219c489c4cd9a5e1f0760f5bd), Mojang mappings,
decompiled with Vineflower for reading only. No decompiled code is in this repository; this file records method
names and constants. Minecraft is © Mojang AB / Microsoft.

Each section: the rule, the constants, the client citation (class#method), and the package file that implements it.
"Implemented in" names the file that owns the rule.

## 1. Walk animation state

`WalkAnimationState#update(target, factor, scale)`: `speedOld = speed; speed += (target - speed) * factor; position += speed`.
Reads: `speed(pt) = min(lerp(pt, speedOld, speed), 1)`; `position(pt) = (position - speed * (1 - pt)) * scale`.
`LivingEntity#calculateEntityAnimation(includeY=false)` (called from `RemotePlayer#tick`): `d = length(dx, 0, dz)` of the
interpolated position against the previous tick; `update(min(d * 4, 1), 0.4, 1)`.
Implemented in: `src/vanilla/spectator.ts`.

## 2. Humanoid pose (`HumanoidModel#setupAnim`)

With `p` = walk position, `v` = walk speed:

- right arm `xRot = cos(p * 0.6662 + PI) * 2 * v * 0.5`; left arm `xRot = cos(p * 0.6662) * 2 * v * 0.5`
- right leg `xRot = cos(p * 0.6662) * 1.4 * v`; left leg `xRot = cos(p * 0.6662 + PI) * 1.4 * v`; legs `yRot`/`zRot` +-0.005
- head `xRot = pitch`, `yRot = headYaw - bodyYaw` (degrees to radians)
- crouch: `body.xRot = 0.5`; arms `xRot += 0.4`; legs `z += 4`; head `y += 4.2`; body and arms `y += 3.2`; render `y -= scale * 2 / 16`
- idle bob (`AnimationUtils#bobModelPart`, `age = tickCount + pt`): `zRot += s * (cos(age * 0.09) * 0.05 + 0.05)`;
  `xRot += s * sin(age * 0.067) * 0.05`; `s = +1` right arm, `-1` left arm

Mesh (pixels, 64x64 skin): head `0,0` box `(-4,-8,-4)` 8^3 pivot `(0,0,0)`; hat `32,0` +0.5; body `16,16` `(-4,0,-2)` 8x12x4;
jacket `16,32` +0.25; slim left arm `32,48` `(-1,-2,-2)` 3x12x4 pivot `(5,2,0)`; slim right arm `40,16` `(-2,-2,-2)` 3x12x4
pivot `(-5,2,0)`; sleeves left `48,48` / right `40,32` +0.25; right leg `0,16` `(-2,0,-2)` 4x12x4 pivot `(-1.9,12,0)`;
left leg `16,48` pivot `(1.9,12,0)`; pants right `0,32` / left `0,48` +0.25.
Render transform: `YP(180 - bodyRot)`, `scale(-1,-1,1)`, `scale(0.9375)`, `translate(0,-1.501,0)`.
Implemented in: `src/vanilla/humanoid.ts`, `src/scene/player-model.tsx`, `src/scene/player-skin.ts`.

## 3. Body yaw (`LivingEntity#tick`, `tickHeadTurn`)

`d2 = dx^2 + dz^2`. If `d2 > 0.0025000002`: `move = atan2(dz, dx) * 180/PI - 90`; if `95 < |wrap(yRot) - move| < 265`
the target is `move - 180`, otherwise `move`. Else the target is the current `yBodyRot`.
`tickHeadTurn`: `yBodyRot += wrap(target - yBodyRot) * 0.3`; clamp `|wrap(yRot - yBodyRot)| <= 50`.
Render uses `rotLerp(pt, ...)` for body and head with no extra clamp.
Implemented in: `src/vanilla/spectator.ts`.

## 4. Interpolation (`InterpolationHandler`)

3 steps. Per tick: `pos = lerp(1/steps, cur, target)`, `yRot = rotLerp`, `xRot = lerp`, `steps--`, so the fractions are
1/3, 1/2, 1. Head: `lerpHeadTo(yHeadRot, 3)` follows the same scheme, but the 3-step interpolation restarts only when the
head-yaw target changes (the server sends RotateHead only on a change); otherwise it keeps running. Per frame: `lerp(pt, old, cur)`.
Implemented in: `src/vanilla/spectator.ts` (`src/interp.ts` supplies only `breaksBetween`).

## 5. Sneak

The CROUCHING pose comes from server entity data and drives the crouch block in section 2.
Implemented in: `src/vanilla/humanoid.ts`.

## 6. Ambient occlusion and face shade (`ModelBlockRenderer`, `ClientLevel#getShade`)

- Neighbour shade is `0.2` if `isCollisionShapeFullBlock`, else `1.0` (glass counts as `1.0`).
- Vertex value `= (sideA + sideB + corner + centre) / 4` (`AmbientOcclusionRenderStorage#calculate`). A side is
  "walled in" only when the cell one further out along the face normal is view-blocking with light block > 0; the shade
  of the side itself does not decide it. When both sides of a vertex are walled in, the corner is replaced by the shade
  of `AdjacencyInfo.corners[0]` for that face (up E, down W, north UP, south W, west UP, east DOWN), even when that cell
  is not one of the vertex's own sides.
- Culling: opaque full cubes hide touching faces; the glass family (`HalfTransparentBlock#skipRendering`) hides only
  faces against the same block; a bottom/top slab hides the face pressed against its full side.
- Face shade (`ClientLevel#getShade`): down `0.5`, up `1.0`, north/south `0.8`, east/west `0.6`.
- A model with `ambientocclusion: false` gets no AO but keeps face shade; elements with `shade: false` use `1.0`.
  Ladder, glass panes and doors carry the flag; fences do not. A child model inherits the flag from its parent unless it
  sets its own. The extractor records the set as the bundle's `ambientOcclusion` map (`{ modelName: false }`).
Implemented in: `scripts/extract-minecraft.py` (flag), `src/vanilla/light.ts` and `src/vanilla/course-mesh.ts` (AO, face shade, culling), `src/scene/vanilla-blocks.ts` (block data). `src/scene/vanilla-material.ts` holds the legacy host material and the entity light.

## 7. Particles

Sprint particles (`Entity#baseTick`, client, remote entities included): sprinting and not crouching and not in a fluid and alive;
block from `getOnPos(0.2)`; position `x + (r - 0.5) * width`, `y + 0.1`, `z + (r - 0.5) * width`; direction `(-4 vx, 1.5, -4 vz)`.
Fall dust (`LivingEntity#checkFallDamage`, server): `power = floor(fall + 1e-6 - 3) > 0` (`safe_fall_distance` 3.0);
`count = (int)(150 * min(0.2 + power / 15, 2.5))`; velocity gaussian `* 0.15`.
Particle constructor: direction `+-0.4` random, normalised to `(r + r + 1) * 0.15 * 0.4`, `y += 0.1`; life `(int)(4 / (r * 0.9 + 0.1))`;
per tick `yd -= 0.04 * gravity`, velocity `*= 0.98`, on ground `x, z *= 0.7`.
`TerrainParticle`: gravity `1`, colour `0.6`, half-size `0.05` to `0.1`, UV a random 1/4 x 1/4 window (u flipped).
The texture is the block model's `particle` texture (falling back to `#all`); the bundle's `particles` map is
`{ blockName: texturePath }`, taken from the first model of the block's blockstate.
Details the implementation follows (client decompile; they correct the first draft of this section):
- No onGround check for sprint dust: an airborne player simply has air at `getOnPos(0.2)` (`RenderShape.INVISIBLE`). On ground
  `getOnPos` uses the main supporting block's column (nearest under the 0.6-wide box); off-column positions are clamped into it.
- `fall` is the server's `fallDistance`: the summed downward travel since the last on-ground tick, the landing tick's own dy
  excluded (`LivingEntity#checkFallDamage` reads it before `super` adds dy); `power = floor(fall + 1e-6 - 3)`. A 3.25-block
  drop has power 0: no burst. Off-column landings are pulled to the supporting block's edge.
- `Particle#tick` order: `xo = x`; `if (age++ >= lifetime) remove`; `yd -= 0.04 * gravity`; `move`; `* 0.98`; on ground
  `x, z * 0.7`. So gravity applies BEFORE the move, and a particle is drawn for `lifetime + 1` tick intervals. A new particle
  is queued and first ticked the tick after its spawn (`ParticleEngine#tick`), so interval 0 draws it still at the spawn point.
- `Particle#move`: a vertical move cut to ~0 by a collision sets `stoppedByCollision`; the particle never moves again. `yd`
  is not zeroed by a collision. The diorama collides only with the source block's top; vanilla collides the 0.2 box with
  every block.
- Drawn at `lerp(partialTick, xo, x)`; half-extent `quadSize = 0.1 * (r * 0.5 + 0.5) * 2 / 2`; `uo, vo = r * 3` (not
  floored), window `[uo/4, (uo+1)/4]` with U0 at local x -1. Pipeline `TRANSLUCENT_PARTICLE`: blended, alpha < 0.1 discarded.
Implemented in: `scripts/extract-minecraft.py` (texture map), `src/vanilla/particles.ts`, `src/scene/particles.tsx`.

## 8. Sky, fog and sun (noon, plains)

Sky `0x78A7FF`; fog base `0xC0D8FF`; fog colour at render distance 12 `#B5D0FF` (also the clear colour);
fog start/end at RD12 `172.8` / `192` (`end = rd * 16`, `start = end - clamp(end / 10, 4, 64)`), measured by cylindrical
distance `max(len(xz), |y|)`. Sky disc fan centre `(0,16,0)`, radius 512, sky colour, fogged over `0..min(rd * 16, 512)`.
Sun: 60x60 quad at distance 100 overhead. In 1.21.11 the texture lives at `textures/environment/celestial/sun.png`
(not `environment/sun.png`); the extractor publishes it as `assets/minecraft/1.21.11/environment/sun.png`.
Implemented in `src/scene/environment.tsx` (`VANILLA_NOON`, `EnvironmentView`): scene background and `THREE.Fog` use the
values above; the sky is a back-faced sphere (r 400, follows the camera each frame) whose fragment shader blends sky to fog
by `d / 192`, with `d = max(16 / tan(elevation), 16)` (the sky disc at y = 16, so even the zenith is fogged by 16/192) and
the pure fog colour at or below the horizon (`skyColorAt` is the same formula, unit-tested); the sun is a 60x60 additive
quad at distance 100 overhead, drawn for perspective cameras only (the orthographic views start at near = -1000, behind the
eye, and the sun washed the top view white).

Known difference: the sky shader mixes sky to fog in linear space, while `skyColorAt` mixes in sRGB, so "same formula" is not
the same colour (about 3-4/255 mid-ramp; three's fog mixes in linear too). Both are to be fixed in one colour-space pass.

Known difference: three's linear fog measures spherical distance, vanilla measures `max(|xz|, |y|)`. The two agree to
within a few percent inside ~60 blocks of the camera, where fog is zero in both (it starts at 172.8), so it is not
emulated with a custom fog chunk.

## 9. Lighting model (`light.glsl`)

`assets/minecraft/shaders/include/light.glsl`:

```
MINECRAFT_LIGHT_POWER   0.6
MINECRAFT_AMBIENT_LIGHT 0.4
light = vec2(dot(Light0_Direction, n), dot(Light1_Direction, n))
lightAccum = min(1.0, (max(0, light.x) + max(0, light.y)) * 0.6 + 0.4)
rgb *= lightAccum
```

Light directions, `com.mojang.blaze3d.platform.Lighting` (static initialiser, each vector normalised):

| Name | Vector (before normalise) | Used for |
|------|---------------------------|----------|
| `DIFFUSE_LIGHT_0` | `(0.2, 1.0, -0.7)` | `Entry.LEVEL` for `CardinalLightType.DEFAULT` (overworld entities), also `ITEMS_FLAT`/`ITEMS_3D` |
| `DIFFUSE_LIGHT_1` | `(-0.2, 1.0, 0.7)` | same |
| `NETHER_DIFFUSE_LIGHT_0` | `(0.2, 1.0, -0.7)` | `Entry.LEVEL` for `CardinalLightType.NETHER` |
| `NETHER_DIFFUSE_LIGHT_1` | `(-0.2, -1.0, 0.7)` | same |
| `INVENTORY_DIFFUSE_LIGHT_0` | `(0.2, -1.0, 1.0)` | `ENTITY_IN_UI`, `PLAYER_SKIN` |
| `INVENTORY_DIFFUSE_LIGHT_1` | `(-0.2, -1.0, 0.0)` | same |

Confirmed 2026-10-14 by disassembling the remapped client jar with `javap -p -c -constants` (eclipse-temurin:21-jdk);
`Lighting#updateLevel(CardinalLightType)` selects `DIFFUSE_LIGHT_0/1` for the default case (switch case 1) and the NETHER pair for case 2.
Entities in the overworld level use the `DIFFUSE_LIGHT_0/1` pair. Implemented in: `src/scene/vanilla-material.ts` (entity material and light).
