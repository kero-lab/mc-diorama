// tests/course-field.test.tsx: the component rebuilds only when the world changes.
import { describe, expect, it } from 'vitest';
import { coursePartsFor, triangleBlock } from '../src/scene/course-field';

const block = () => ({ at: [0, 0, 0] as [number, number, number], name: 'red_wool', state: null, order: null });
describe('CourseField', () => {
  it('returns the same mesh for the same blocks array, a new one for a new array', () => {
    const blocks = [block()];
    expect(coursePartsFor(blocks)).toBe(coursePartsFor(blocks));
    expect(coursePartsFor([block()])).not.toBe(coursePartsFor(blocks));
  });
  it('maps a raycast face index to its block, unsorted and after a sort', () => {
    const tri = ['a', 'b', 'c'];
    expect(triangleBlock(tri, null, 1)).toBe('b');
    expect(triangleBlock(tri, Uint32Array.from([2, 0, 1]), 0)).toBe('c');
    expect(triangleBlock(tri, Uint32Array.from([2, 0, 1]), 7)).toBeNull();
  });
});
