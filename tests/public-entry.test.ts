// spec §3.1: nothing reachable from the public entry imports src/debug.
import { readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

function reachable(entry: string, seen = new Set<string>()): Set<string> {
  if (seen.has(entry)) return seen;
  seen.add(entry);
  const src = readFileSync(entry, 'utf8');
  for (const m of src.matchAll(/(?:import|export)[^'"]*from\s+['"](\.[^'"]+)['"]|import\(\s*['"](\.[^'"]+)['"]\s*\)/g)) {
    const spec = m[1] ?? m[2];
    const base = resolve(dirname(entry), spec);
    const file = ['', '.ts', '.tsx', '/index.ts', '/index.tsx'].map(e => base + e).find(p => { try { return statSync(p).isFile(); } catch { return false; } });
    if (file && /\.(ts|tsx)$/.test(file)) reachable(file, seen);
  }
  return seen;
}

it('the public entry never reaches src/debug', () => {
  const files = [...reachable(resolve('src/index.ts'))];
  expect(files.some(f => f.endsWith('src/layers/parkour/panels.tsx'))).toBe(true);   // control: the walk really follows imports
  expect(files.filter(f => f.includes('/src/debug/'))).toEqual([]);
});
it('the debug entry exists and reaches the X-ray parts', () => {
  const files = [...reachable(resolve('src/debug/index.ts'))];
  expect(files.some(f => f.endsWith('src/debug/parkour-panels.tsx'))).toBe(true);
});
