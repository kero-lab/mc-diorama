// tests/real-fixtures.test.ts: the public repo holds only what the public lane sends (spec §7.1).
import { describe, expect, it } from 'vitest';
import { PUBLIC_FIELDS } from './fixtures/public-allowlist';
import { loadReal, type RealId } from './fixtures/real';

describe.each<RealId>(['d1fae16b', '22dd4e13'])('real fixture %s', id => {
  const events = loadReal(id) as Record<string, unknown>[];
  it('carries only allowlisted event types and keys', () => {
    for (const e of events) {
      const allowed = PUBLIC_FIELDS[String(e.type)];
      expect(allowed, String(e.type)).toBeDefined();
      for (const k of Object.keys(e)) expect(allowed, `${e.type}.${k}`).toContain(k);
    }
  });
  it('is a whole run with one sample per tick', () => {
    expect(events[0].type).toBe('run_started');
    expect(events.filter(e => e.type === 'pos').length).toBeGreaterThan(2000);
  });
});
