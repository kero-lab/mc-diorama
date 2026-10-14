// tests/fixtures/real.ts: projected real recordings (exported by remlab apps/rem-mc/scripts/export-diorama-fixture.ts).
import { gunzipSync } from 'node:zlib';
import fs from 'node:fs';
export type RealId = 'd1fae16b' | '22dd4e13';
export function loadReal(id: RealId): unknown[] {
  return JSON.parse(gunzipSync(fs.readFileSync(new URL(`./real/${id}.json.gz`, import.meta.url))).toString('utf8')) as unknown[];
}
