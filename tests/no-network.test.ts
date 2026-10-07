// tests/no-network.test.ts — spec §3.1: the package makes no network calls and knows no URLs.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const files = (dir: string): string[] => readdirSync(dir).flatMap(n => { const p = join(dir, n); return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(n) ? [p] : []; });

it('no fetch, EventSource, absolute URL or /api path anywhere in src', () => {
  const bad = files('src').flatMap(f => readFileSync(f, 'utf8').split('\n').map((l, i) => ({ f, i: i + 1, l })))
    .filter(({ l }) => /\bfetch\(|new EventSource|https?:\/\/|['"`]\/api\/|['"`]\/minecraft\//.test(l) && !l.trim().startsWith('//') && !l.trim().startsWith('*'));
  expect(bad.map(b => `${b.f}:${b.i}: ${b.l.trim()}`)).toEqual([]);
});
