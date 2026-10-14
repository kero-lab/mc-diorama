// src/vanilla/yaw.ts: mineflayer radians (yaw 0 = -z, counter-clockwise from above; pitch + = up) <-> vanilla degrees
// (yRot 0 = +z/south, 90 = west; xRot + = down). Mth#wrapDegrees, Mth#rotLerp.
export const wrapDegrees = (d: number) => { const x = ((d % 360) + 540) % 360 - 180; return x === -180 ? 180 : x; };
export const rotLerp = (t: number, a: number, b: number) => a + t * wrapDegrees(b - a);
export const toVanillaYaw = (y: number) => wrapDegrees(180 - y * 180 / Math.PI);
export const toVanillaPitch = (p: number) => -p * 180 / Math.PI;
/** rotation.y for a model whose front faces +z (three rotates +z toward +x for positive angles; vanilla 90 is -x). */
export const vanillaYawToThree = (deg: number) => -deg * Math.PI / 180;
