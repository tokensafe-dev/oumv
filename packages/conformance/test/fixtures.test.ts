import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Language-neutral conformance fixtures (spec §10).
 *
 * The canonical case file lives at `fixtures/conformance-cases.json` and is
 * vendored into backend runtimes (tokensafe-backend: go/pkg/oumv/testdata,
 * python/tests) so Go and Python can be certified with their native toolchains.
 * This suite validates the canonical file's shape; the backend CI runs the
 * actual cases against their runtimes.
 */

const FIXTURES_PATH = resolve(__dirname, '../../../fixtures/conformance-cases.json');

interface ConformanceCase {
  id: string;
  level: 1 | 2 | 3;
  method: string;
  params: Record<string, unknown>;
  preconditions?: string[];
  expectResultFields?: string[];
  expectError?: { code: number };
  expectLevelEquals?: string;
  expectSha256Field?: string;
  expectArrayField?: string;
  expectEvidence?: boolean;
  expectVersionMatchesContent?: string;
}

// Fixture cases may only reference codes present in the canonical registry
// (schemas/errors.json) — the single source of truth shared with the spec
// table, the README and the generated enum (see errors.test.ts).
const NORMATIVE_CODES = new Set<number>(
  (
    JSON.parse(
      readFileSync(resolve(__dirname, '../../../schemas/errors.json'), 'utf-8'),
    ) as { codes: { code: number }[] }
  ).codes.map((c) => c.code),
);

const loadFixture = () => JSON.parse(readFileSync(FIXTURES_PATH, 'utf-8')) as {
  protocolVersion: string;
  fixtureVersion: number;
  spec: string;
  levelDefinitions: Record<string, string>;
  cases: ConformanceCase[];
};

describe('language-neutral conformance fixtures', () => {
  it('requires the handshake to prove profile and sessionId', () => {
    const handshake = loadFixture().cases.find((c) => c.id === 'handshake-negotiates-capabilities')!;
    expect(handshake.expectResultFields).toEqual(
      expect.arrayContaining(['profile', 'sessionId', 'capabilities'])
    );
  });

  it('references the OUMV spec, protocol version and fixture version', () => {
    const data = loadFixture();
    expect(data.protocolVersion).toBe('1.6.0');
    expect(data.fixtureVersion).toBe(11);
    expect(data.spec).toContain('SPEC.md');
  });

  it('defines all three conformance levels', () => {
    const defs = loadFixture().levelDefinitions;
    expect(Object.keys(defs).sort()).toEqual(['1', '2', '3']);
    for (const text of Object.values(defs)) expect(text.length).toBeGreaterThan(10);
  });

  it('contains the mandatory core cases', () => {
    const ids = loadFixture().cases.map((c) => c.id);
    expect(ids).toContain('handshake-negotiates-capabilities');
    expect(ids).toContain('unknown-session-is-rejected');
    expect(ids).toContain('get-source-returns-occ-token');
    expect(ids).toContain('verify-returns-status-timings-and-scope');
    expect(ids).toContain('unknown-method-is-jsonrpc-method-not-found');
    expect(ids).toContain('occ-conflict-rejected');
    expect(ids).toContain('apply-edit-without-version-rejected');
    expect(ids).toContain('path-traversal-blocked');
    expect(ids).toContain('syntax-guard-rejects-broken-code');
    expect(ids).toContain('missing-resource-rejected');
    expect(ids).toContain('apply-edit-returns-real-occ-version');
  });

  it('covers every level so a level claim is falsifiable', () => {
    const cases = loadFixture().cases;
    for (const level of [1, 2, 3] as const) {
      expect(cases.filter((c) => c.level === level).length, `level ${level} must have cases`)
        .toBeGreaterThan(0);
    }
    // Level 2 must actually exercise L2/L3 observation, not just mutations.
    const observeLevels = cases
      .filter((c) => c.method === 'oumv/observe' && c.level === 2)
      .map((c) => String(c.params.level));
    expect(observeLevels).toContain('L2');
    expect(observeLevels).toContain('L3');
    // Level 3 must exercise traces and causality.
    const l3Methods = cases.filter((c) => c.level === 3).map((c) => c.method);
    expect(l3Methods).toContain('oumv/observe');
    expect(l3Methods).toContain('oumv/understand');
  });

  it('mutations never rely on an implicit version (OCC is mandatory)', () => {
    const editCases = loadFixture().cases.filter((c) => c.method === 'oumv/applyEdit');
    const withoutVersion = editCases
      .filter((c) => c.params.expectedVersion === undefined)
      .map((c) => c.id)
      .sort();
    // Allowed only for the guard case itself, or when mode=create forbids the version.
    expect(withoutVersion).toEqual([
      'apply-edit-without-version-rejected',
      'create-existing-file-rejected',
      'create-new-file',
    ]);
    const guard = editCases.find((c) => c.id === 'apply-edit-without-version-rejected')!;
    expect(guard.expectError?.code).toBe(-32011);
    for (const id of ['create-existing-file-rejected', 'create-new-file']) {
      expect(editCases.find((c) => c.id === id)!.params.mode).toBe('create');
    }
  });

  it('every case declares a valid expectation', () => {
    for (const c of loadFixture().cases) {
      expect(c.id, 'case id required').toBeTruthy();
      expect([1, 2, 3], `${c.id}: level must be 1, 2 or 3`).toContain(c.level);
      expect(c.method.startsWith('oumv/'), `${c.id}: method must be an oumv/* method`).toBe(true);
      const hasError = c.expectError !== undefined;
      const hasResult = (c.expectResultFields ?? []).length > 0;
      expect(hasError || hasResult, `${c.id}: must expect an error code or result fields`).toBe(true);
      if (hasError) {
        expect(Number.isInteger(c.expectError!.code), `${c.id}: error code must be an integer`).toBe(true);
        expect(NORMATIVE_CODES.has(c.expectError!.code), `${c.id}: unknown OUMV error code`).toBe(true);
      }
      if (c.expectSha256Field) {
        expect(c.expectResultFields ?? [], `${c.id}: sha256 assertion needs the field declared`)
          .toContain(c.expectSha256Field);
      }
      if (c.expectArrayField) {
        expect(c.expectResultFields ?? [], `${c.id}: array assertion needs the field declared`)
          .toContain(c.expectArrayField);
      }
    }
  });

  it('error cases use the normative OUMV error codes (spec §5)', () => {
    const codes = loadFixture()
      .cases.filter((c) => c.expectError)
      .map((c) => c.expectError!.code);
    expect(codes).toContain(-32601); // JSON-RPC method not found
    expect(codes).toContain(-32001); // CONFLICT_DETECTED
    expect(codes).toContain(-32003); // SECURITY_VIOLATION
    expect(codes).toContain(-32002); // SYNTAX_ERROR
    expect(codes).toContain(-32009); // RESOURCE_NOT_FOUND
    expect(codes).toContain(-32011); // VALIDATION_FAILED
  });
});
