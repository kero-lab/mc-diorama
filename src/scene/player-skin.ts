import { BoxGeometry } from 'three';

/** Minecraft's 64×64 skin net. BoxGeometry's faces are +x, −x, +y, −y, +z, −z.
 * The player faces +z locally; the recorded Mineflayer yaw is applied by the rig. */
export function skinBox(width: number, height: number, depth: number, u: number, v: number, inflate = 0): BoxGeometry {
  const box = new BoxGeometry(width + inflate, height + inflate, depth + inflate);
  const rects = [
    [u + depth + width, v + depth, depth, height],
    [u, v + depth, depth, height],
    [u + depth, v, width, depth],
    [u + depth + width, v, width, depth],
    [u + depth, v + depth, width, height],
    [u + 2 * depth + width, v + depth, width, height],
  ];
  const uv = box.getAttribute('uv');
  rects.forEach(([x, y, w, h], face) => {
    const corners = face === 3 ? [[x, y + h], [x + w, y + h], [x, y], [x + w, y]]
      : [[x, y], [x + w, y], [x, y + h], [x + w, y + h]];
    corners.forEach(([px, py], corner) => uv.setXY(face * 4 + corner, px / 64, 1 - py / 64));
  });
  return box;
}
