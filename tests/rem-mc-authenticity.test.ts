import { createVanillaMaterial } from '../src/scene/vanilla-material';
import { describe, expect, it } from 'vitest';
import { Box3, Matrix4, Vector3, DataTexture, NearestFilter } from 'three';
import { doorHinge, modelsFor, vanillaMesh } from '../src/scene/vanilla-blocks';
import { doorOpenAt, doorTrack } from '../src/scene/door-motion';
import { blockKey, type BlockChange, type WorldBlock } from '../src/types';

describe('vanilla block-state geometry',()=>{
  it('synchronizes door halves despite delayed confirmation, without changing source events',()=>{
    const lower: WorldBlock={at:[0,0,0],name:'oak_door',state:{half:'lower',open:false},order:null};
    const upper: WorldBlock={...lower,at:[0,1,0],state:{half:'upper',open:false}};
    const change=(block: WorldBlock,t: number,open: boolean): BlockChange=>({t,key:blockKey(block.at),block:{...block,state:{...block.state,open}}});
    const changes=[change(lower,0,false),change(upper,0,false),change(lower,100,true),change(upper,150,true)];
    const original=structuredClone(changes);
    const a=doorTrack(changes,lower), b=doorTrack(changes,upper);
    expect(a).toEqual(b);
    expect(doorOpenAt(a,225)).toBe(.5);
    expect(doorOpenAt(a,125,true)).toBe(1);
    expect(doorOpenAt(a,500)).toBe(1);
    expect(doorOpenAt(a,225)).toBe(.5);
    expect(changes).toEqual(original);
  });
  it('selects top/bottom/double slabs and preserves actual half height',()=>{
    const bottom=vanillaMesh('smooth_quartz_slab',{type:'bottom'})!.geometry.boundingBox!;
    const top=vanillaMesh('smooth_quartz_slab',{type:'top'})!.geometry.boundingBox!;
    const full=vanillaMesh('smooth_quartz_slab',{type:'double'})!.geometry.boundingBox!;
    expect([bottom.min.y,bottom.max.y,top.min.y,top.max.y,full.max.y]).toEqual([0,.5,.5,1,1]);
  });
  it('uses recorded fence connections rather than a solitary post or invented cross',()=>{
    expect(modelsFor('oak_fence',{})).toHaveLength(1);
    expect(modelsFor('oak_fence',{north:true,east:true})).toHaveLength(3);
    expect(vanillaMesh('oak_fence',{})!.geometry.boundingBox!.getSize(new Vector3()).x).toBe(.25);
    expect(vanillaMesh('oak_fence',{east:true})!.geometry.boundingBox!.max.x).toBe(1);
  });
  it('uses a cut-out ladder plane and distinct quartz faces with bounded texture draw groups',()=>{
    const ladder=vanillaMesh('ladder',{facing:'north'})!;
    expect(ladder.textures).toEqual(['block/ladder']);
    expect(ladder.geometry.boundingBox!.getSize(new Vector3()).z).toBe(0);
    const quartz=vanillaMesh('quartz_block',{})!;
    expect(new Set(quartz.textures)).toEqual(new Set(['block/quartz_block_top','block/quartz_block_side']));
    const scaffold=vanillaMesh('scaffolding',{})!;
    expect(scaffold.geometry.groups).toHaveLength(scaffold.textures.length);
    expect(vanillaMesh('unregistered_plugin_block',{})).toBeNull();
  });
  it('keeps door panels rigid throughout the swing and matches vanilla open endpoints for every facing/hinge',()=>{
    for (const facing of ['east','west','north','south']) for (const hinge of ['left','right']) {
      const state={facing,hinge,half:'lower',open:false};
      const closed=vanillaMesh('oak_door',{...state,facing:'east'})!;
      const h=doorHinge(state);
      const transform=(angle: number)=>new Matrix4().makeTranslation(.5,0,.5)
        .multiply(new Matrix4().makeRotationY(h.base))
        .multiply(new Matrix4().makeTranslation(h.x-.5,0,h.z-.5))
        .multiply(new Matrix4().makeRotationY(angle*h.direction))
        .multiply(new Matrix4().makeTranslation(-h.x,0,-h.z));
      for (const angle of [0,.3,.7,Math.PI/2]) {
        const m=transform(angle);
        expect(m.determinant()).toBeCloseTo(1);
        const a=new Vector3(0,0,0).applyMatrix4(m), b=new Vector3(0,0,1).applyMatrix4(m);
        expect(a.distanceTo(b)).toBeCloseTo(1);
      }
      const actual=new Box3().setFromBufferAttribute(closed.geometry.getAttribute('position') as never).applyMatrix4(transform(Math.PI/2));
      const expected=vanillaMesh('oak_door',{...state,open:true})!.geometry.boundingBox!;
      for (const axis of ['x','y','z'] as const) {
        expect(actual.min[axis]).toBeCloseTo(expected.min[axis]);
        expect(actual.max[axis]).toBeCloseTo(expected.max[axis]);
      }
    }
  });
});

describe('vanilla cutout texture policy', () => {
  it('keeps ladder gaps crisp at oblique and miniature views without averaged black mip pixels', () => {
    const texture = new DataTexture(new Uint8Array([120, 80, 30, 255, 0, 0, 0, 0]), 2, 1);
    const material = createVanillaMaterial(texture, 'block/ladder');
    expect(texture.minFilter).toBe(NearestFilter);
    expect(texture.generateMipmaps).toBe(false);
    expect(material.alphaTest).toBe(0.5);
    expect(material.transparent).toBe(false);
    expect(material.depthWrite).toBe(true);
    material.dispose(); texture.dispose();
  });
  it('preserves blended alpha for genuinely translucent Minecraft materials', () => {
    const texture = new DataTexture();
    const material = createVanillaMaterial(texture, 'block/honey_block_side');
    expect(material.transparent).toBe(true);
    expect(material.depthWrite).toBe(false);
    expect(material.alphaTest).toBe(0.01);
    expect(texture.generateMipmaps).toBe(true);
    material.dispose(); texture.dispose();
  });
});
