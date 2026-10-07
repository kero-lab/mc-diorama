import { describe, expect, it } from 'vitest';
import { CAMERA_IDS, CAMERAS, dampPose, direct, framedZoom, MIN_SHOT_MS, type CameraInput, type CameraPose, type DirectorState } from '../src/registry/cameras';
import { OrthographicCamera, Vector3 } from 'three';
import { stateAt } from '../src/frame';
import { emptyTimeline, timelineReducer } from '../src/timeline';
import { syntheticRun, tAt } from './fixtures/rem-mc/synthetic-p8';

const tl = timelineReducer(emptyTimeline(), syntheticRun().map(e => ({ e })));
const input = (T: number, over: Partial<CameraInput> = {}): CameraInput => ({ frame: stateAt(tl, T), tl, rotation: 0, reducedMotion: false, ...over });
const finite = (p: CameraPose) => [...p.position, ...p.target, ...p.up, p.zoom, p.fov].every(Number.isFinite);
const sub = (a: number[], b: number[]) => a.map((x, i) => x - b[i]);
const len = (a: number[]) => Math.hypot(...a);

describe('camera registry', () => {
  it('frames Rem and the next landing within desktop and compact previews at every isometric rotation',()=>{
    for (const viewport of [{width:326,height:244},{width:948,height:533}]) for (const rotation of [0,1,2,3] as const) {
      const i=input(tAt(31),{viewport,rotation});
      const p=CAMERAS.iso.pose(i);
      const camera=new OrthographicCamera(-viewport.width/2,viewport.width/2,viewport.height/2,-viewport.height/2,-1000,1000);
      camera.position.set(...p.position); camera.up.set(...p.up); camera.lookAt(...p.target); camera.zoom=p.zoom;
      camera.updateProjectionMatrix(); camera.updateMatrixWorld();
      const feet=i.frame.rem!.p;
      for (const point of [feet,[feet[0],feet[1]+2,feet[2]],[feet[0]+i.frame.heading.x*4,feet[1],feet[2]+i.frame.heading.z*4]]) {
        const projected=new Vector3(...point as [number,number,number]).project(camera);
        expect(Math.abs(projected.x)).toBeLessThan(.9);
        expect(Math.abs(projected.y)).toBeLessThan(.9);
      }
    }
    expect(framedZoom({width:326,height:244},14,9,32)).toBeLessThan(framedZoom({width:948,height:533},14,9,32));
  });
  const frames: CameraInput[] = [
    ...Array.from({ length: 70 }, (_, i) => input(tAt(i))),
    { frame: stateAt(emptyTimeline(), 0), tl: emptyTimeline(), rotation: 0, reducedMotion: false },     // nothing loaded yet
    input(tAt(30), { frame: { ...stateAt(tl, tAt(30)), rem: { ...stateAt(tl, tAt(30)).rem!, pitch: Math.PI / 2, yaw: 1e6 } } }),
    input(tAt(30), { frame: { ...stateAt(tl, tAt(30)), rem: { ...stateAt(tl, tAt(30)).rem!, pitch: -Math.PI / 2 } } }),
  ];
  for (const id of CAMERA_IDS) it(`${id}: a finite, non-degenerate pose for every state`, () => {
    for (const i of frames) for (const rotation of [0, 1, 2, 3] as const) {
      const p = CAMERAS[id].pose({ ...i, rotation });
      expect(finite(p), JSON.stringify(p)).toBe(true);
      expect(len(sub(p.position, p.target))).toBeGreaterThan(0.1);
      expect(len(p.up)).toBeGreaterThan(0.5);
    }
  });

  it('first person sits at her eye and hides her model; top looks straight down; side is square to the course', () => {
    const i = input(tAt(31));
    const feet = i.frame.rem!.p;
    expect(CAMERAS.first.pose(i)).toMatchObject({ hideRem: true, projection: 'persp' });
    expect(CAMERAS.first.pose(i).position[1]).toBeCloseTo(feet[1] + 1.62);
    const top = CAMERAS.top.pose(i);
    expect([top.position[0] - top.target[0], top.position[2] - top.target[2]]).toEqual([0, 0]);
    const side = CAMERAS.side.pose(i);
    const off = sub(side.position, side.target);
    expect(off[0] * i.frame.heading.x + off[2] * i.frame.heading.z).toBeCloseTo(0);
  });

  it('iso turns in 90° steps', () => {
    const ps = ([0, 1, 2, 3] as const).map(r => sub(CAMERAS.iso.pose(input(tAt(31), { rotation: r })).position, CAMERAS.iso.pose(input(tAt(31), { rotation: r })).target));
    for (let r = 0; r < 4; r++) {
      const a = ps[r], b = ps[(r + 1) % 4];
      expect(a[0] * b[0] + a[2] * b[2]).toBeCloseTo(0, 6);                // horizontal parts perpendicular
    }
  });
});

describe('cinematic director', () => {
  it('cuts at most once per MIN_SHOT_MS of timeline time across the whole run', () => {
    let st: DirectorState | null = null;
    const cuts: number[] = [];
    for (let T = tAt(0); T <= tAt(70); T += 16) { const d = direct(st, input(T)); if (d.pose.cut) cuts.push(T); st = d.state; }
    for (let i = 1; i < cuts.length; i++) expect(cuts[i] - cuts[i - 1]).toBeGreaterThanOrEqual(MIN_SHOT_MS);
    expect(cuts.length).toBeGreaterThan(1);                               // control: it does cut
  });

  it('goes low and slow (0.5×) on a landing with margin < 0.1, and orbits the death', () => {
    expect(direct(null, input(tAt(36)))).toMatchObject({ state: { shot: 'landing' }, timeScale: 0.5 });
    expect(direct(null, input(tAt(63))).state.shot).toBe('death');
  });

  it('reduced motion: no director, the iso pose, normal speed', () => {
    const i = input(tAt(36), { reducedMotion: true });
    expect(direct(null, i)).toMatchObject({ timeScale: 1, pose: { ...CAMERAS.iso.pose(i), cut: false } });
  });

  it('Ruling 16: the cinematic registry entry never cuts, though the director cuts on a fresh state', () => {
    for (const k of [0, 36, 63]) {
      const i = input(tAt(k));
      expect(direct(null, i).pose.cut).toBe(true);                        // control: a fresh director cuts
      expect(CAMERAS.cinematic.pose(i)).toEqual({ ...direct(null, i).pose, cut: false });
    }
  });
});

describe('dampPose', () => {
  const a = CAMERAS.iso.pose(input(tAt(10)));
  const far = { ...a, position: a.position.map((x, j) => x + (j === 0 ? 10 : 0)) as typeof a.position };
  it('never jumps with a sample: one frame moves a fraction of the way, and it settles', () => {
    const one = dampPose(a, far, 16, false);
    expect(Math.abs(one.position[0] - a.position[0])).toBeLessThan(1);
    let p = a;
    for (let t = 0; t < 3000; t += 16) p = dampPose(p, far, 16, false);
    expect(Math.abs(p.position[0] - far.position[0])).toBeLessThan(0.01);
  });
  it('a cut snaps, except under reduced motion, which pans slowly instead', () => {
    expect(dampPose(a, { ...far, cut: true }, 16, false).position).toEqual(far.position);
    const slow = dampPose(a, { ...far, cut: true }, 16, true);
    expect(Math.abs(slow.position[0] - a.position[0])).toBeLessThan(0.2);
  });
});
