// Vanilla slim player model, entity lighting (light.glsl) and the hand slot (ItemInHandLayer), 1.21.11.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { HAND_SLOT, PLAYER_PARTS, entityLight, partCentre } from '../src/scene/player-model';
import { ENTITY_LIGHT_0, ENTITY_LIGHT_1, entityMaterial } from '../src/scene/vanilla-material';
import { heldItemFor, HELD_ITEMS } from '../src/registry/held-items';
import { poseObject3D, THREE_EULER_ORDER, toThree } from '../src/vanilla/humanoid';

describe('player model', () => {
  it('slim arms are 3 px wide; the right arm box starts at -2', () => {
    const r = PLAYER_PARTS.find(p => p.part === 'rightArm')!, l = PLAYER_PARTS.find(p => p.part === 'leftArm')!;
    expect(r.box).toEqual([-2, -2, -2, 3, 12, 4]);
    expect(l.box).toEqual([-1, -2, -2, 3, 12, 4]);
    expect(r.uv).toEqual([40, 16]); expect(r.outer).toEqual([40, 32]);
    expect(l.uv).toEqual([32, 48]); expect(l.outer).toEqual([48, 48]);
  });
  it('box centres in three space (relative to the pivot): head above, limbs below', () => {
    expect(partCentre(PLAYER_PARTS.find(p => p.part === 'head')!)).toEqual([0, 4, -0]);
    expect(partCentre(PLAYER_PARTS.find(p => p.part === 'rightArm')!)).toEqual([-0.5, -4, -0]);
  });
  it('the feet land at y = 0 in three model space', () => {
    const leg = PLAYER_PARTS.find(p => p.part === 'rightLeg')!;
    const pivotY = toThree({ x: -1.9, y: 12, z: 0, xRot: 0, yRot: 0, zRot: 0 }).position[1];
    expect(pivotY + partCentre(leg)[1] - leg.box[4] / 2).toBe(0);
  });
});

describe('entity lighting (light.glsl minecraft_mix_light, Lighting DIFFUSE_LIGHT_0/1)', () => {
  it('uses the normalised overworld light directions', () => {
    const n0 = Math.hypot(0.2, 1, -0.7), n1 = Math.hypot(-0.2, 1, 0.7);
    expect(ENTITY_LIGHT_0[0]).toBeCloseTo(0.2 / n0); expect(ENTITY_LIGHT_0[2]).toBeCloseTo(-0.7 / n0);
    expect(ENTITY_LIGHT_1[0]).toBeCloseTo(-0.2 / n1); expect(ENTITY_LIGHT_1[2]).toBeCloseTo(0.7 / n1);
  });
  it('ambient 0.4 + 0.6 per light, capped at 1', () => {
    expect(entityLight([0, 1, 0])).toBeCloseTo(1);
    expect(entityLight([0, -1, 0])).toBeCloseTo(0.4);
    const n0 = Math.hypot(0.2, 1, -0.7);
    expect(entityLight([1, 0, 0])).toBeCloseTo(0.4 + 0.6 * 0.2 / n0);   // only L0 faces +x
    expect(entityLight([0, 0, -1])).toBeCloseTo(0.4 + 0.6 * 0.7 / n0);
  });
  it('the shader computes the same factor from the world-space normal, per face, in sRGB', () => {
    const m = entityMaterial(new THREE.Texture(), 'inner');
    const shader = { vertexShader: THREE.ShaderLib.basic.vertexShader, fragmentShader: THREE.ShaderLib.basic.fragmentShader, uniforms: {} } as unknown as THREE.WebGLProgramParametersWithUniforms;
    m.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
    expect(shader.vertexShader).toContain('mat3( modelMatrix ) * normal');
    expect(shader.vertexShader).toContain(ENTITY_LIGHT_0.map(v => v.toFixed(8)).join(', '));
    expect(shader.vertexShader).toContain(ENTITY_LIGHT_1.map(v => v.toFixed(8)).join(', '));
    expect(shader.vertexShader).toMatch(/#include <project_vertex>[\s\S]*vEntityLightFront/);
    expect(shader.fragmentShader).toMatch(/#include <map_fragment>[\s\S]*sRGBTransferEOTF\( vec4\( sRGBTransferOETF[\s\S]*gl_FrontFacing \? vEntityLightFront : vEntityLightBack/);
    expect(m.fog).toBe(true);
    expect(m.side).toBe(THREE.DoubleSide);   // entity_translucent: withCull(false)
    expect(m.alphaTest).toBeCloseTo(0.1);    // ALPHA_CUTOUT 0.1
    expect(entityMaterial(m.map!, 'inner')).toBe(m);   // shared per texture
  });
});

describe('hand slot', () => {
  it('ships empty and draws nothing for an unknown item', () => {
    expect(Object.keys(HELD_ITEMS)).toEqual([]);
    expect(heldItemFor('mace')).toBeNull();
    expect(heldItemFor(null)).toBeNull();
    expect(heldItemFor('toString')).toBeNull();
  });
  it('matches PlayerModel#translateToHand (slim) + ItemInHandLayer for a posed right arm', () => {
    const arm = { x: -5, y: 2, z: 0, xRot: -0.7, yRot: 0.3, zRot: 0.2 };
    // vanilla model space (px): T(pivot + slim 0.5 x) · Rzyx(arm) · Rx(-90°) · Ry(180°) · T(1, 2, -10)
    const v = new THREE.Matrix4().makeTranslation(arm.x + 0.5, arm.y, arm.z)
      .multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(arm.xRot, arm.yRot, arm.zRot, 'ZYX')))
      .multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2)).multiply(new THREE.Matrix4().makeRotationY(Math.PI))
      .multiply(new THREE.Matrix4().makeTranslation(1 / 16 * 16, 0.125 * 16, -0.625 * 16));
    // vanilla -> three model space: y = 24 - y, z = -z (a rotation by π about x after the lift). The item's own frame is
    // left in vanilla item coordinates, so an item component is authored exactly as the vanilla item model.
    const C = new THREE.Matrix4().makeTranslation(0, 24, 0).multiply(new THREE.Matrix4().makeScale(1, -1, -1));
    const expected = C.clone().multiply(v);
    const t = toThree(arm);
    const got = new THREE.Matrix4().makeTranslation(t.position[0] + HAND_SLOT.slimShift, t.position[1], t.position[2])
      .multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...t.rotation, THREE_EULER_ORDER)))
      .multiply(new THREE.Matrix4().makeTranslation(...HAND_SLOT.position))
      .multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...HAND_SLOT.rotation, HAND_SLOT.order)));
    got.elements.forEach((e, i) => expect(e).toBeCloseTo(expected.elements[i], 6));
    expect(HAND_SLOT.position).toEqual([-1, -10, 2]);
  });
});

describe('poseObject3D', () => {
  it('matches toThree and sets the ZYX order', () => {
    const part = { x: -5, y: 2, z: 1, xRot: 0.3, yRot: -0.2, zRot: 0.1 }, g = new THREE.Group(), t = toThree(part);
    poseObject3D(part, g);
    expect(g.position.toArray()).toEqual(t.position);
    expect([g.rotation.x, g.rotation.y, g.rotation.z]).toEqual(t.rotation);
    expect(g.rotation.order).toBe(THREE_EULER_ORDER);
  });
});
