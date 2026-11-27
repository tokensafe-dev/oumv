import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Error-code registry conformance (spec §5).
 *
 * schemas/errors.json is the canonical registry. This suite keeps the three
 * renderings honest: the generated TypeScript enum (packages/protocol/src/
 * errors.ts), the normative table in spec/SPEC.md §5.1, and the README copy.
 * A code added to the registry without regenerating (or without updating the
 * docs) fails here.
 */

const ROOT = resolve(__dirname, '../../..');

interface RegisteredCode {
  code: number;
  name: string;
  meaning: string;
  reasons?: string[];
}

const registry = JSON.parse(readFileSync(resolve(ROOT, 'schemas/errors.json'), 'utf-8')) as {
  registryVersion: number;
  codes: RegisteredCode[];
  reserved: { code: number; why: string }[];
};

/** `| **-32001** | \`CONFLICT_DETECTED\` | … |` rows from a rendered table. */
const codeRows = (md: string): Map<number, string> => {
  const rows = new Map<number, string>();
  for (const m of md.matchAll(/^\|\s*\*\*(-\d+)\*\*\s*\|\s*`([A-Z][A-Z0-9_]*)`\s*\|/gm)) {
    rows.set(Number(m[1]), m[2]);
  }
  return rows;
};

const specTable = codeRows(readFileSync(resolve(ROOT, 'spec/SPEC.md'), 'utf-8'));
const readmeTable = codeRows(readFileSync(resolve(ROOT, 'README.md'), 'utf-8'));
const registryMap = new Map(registry.codes.map((c) => [c.code, c.name] as [number, string]));

describe('error code registry', () => {
  it('has unique codes and unique UPPER_SNAKE names', () => {
    const codes = registry.codes.map((c) => c.code);
    const names = registry.codes.map((c) => c.name);
    expect(new Set(codes).size).toBe(codes.length);
    expect(new Set(names).size).toBe(names.length);
    for (const c of registry.codes) {
      expect(c.name).toMatch(/^[A-Z][A-Z0-9_]*$/);
      expect(typeof c.meaning).toBe('string');
      expect(c.meaning.length).toBeGreaterThan(5);
      for (const r of c.reasons ?? []) expect(r).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });

  it('keeps reserved codes out of the active set', () => {
    const active = new Set(registry.codes.map((c) => c.code));
    for (const r of registry.reserved) expect(active.has(r.code)).toBe(false);
  });

  it('is rendered 1:1 by the spec §5.1 table', () => {
    expect(specTable).toEqual(registryMap);
  });

  it('is rendered 1:1 by the README table', () => {
    expect(readmeTable).toEqual(registryMap);
  });

  it('has a generated errors.ts that matches the registry', () => {
    const generated = readFileSync(resolve(ROOT, 'packages/protocol/src/errors.ts'), 'utf-8');
    const enumRows = new Map<number, string>();
    for (const m of generated.matchAll(/^\s+([A-Z][A-Z0-9_]*) = (-\d+),/gm)) {
      enumRows.set(Number(m[2]), m[1]);
    }
    expect(enumRows).toEqual(registryMap);
    expect(generated).toContain('GENERATED FILE');
  });
});
