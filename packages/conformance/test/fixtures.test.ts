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
  method: string;
  params: Record<string, unknown>;
  expectResultFields?: string[];
  expectError?: { code: number };
  expectVersionMatchesContent?: string;
}

const loadFixture = () => JSON.parse(readFileSync(FIXTURES_PATH, 'utf-8')) as {
  protocolVersion: string;
  spec: string;
  cases: ConformanceCase[];
};

describe('language-neutral conformance fixtures', () => {
  it('references the OUMV spec and a protocol version', () => {
    const data = loadFixture();
    expect(data.protocolVersion).toBe('1.0.0');
    expect(data.spec).toContain('SPEC.md');
  });

  it('contains the mandatory core cases', () => {
    const ids = loadFixture().cases.map((c) => c.id);
    expect(ids).toContain('handshake-negotiates-capabilities');
    expect(ids).toContain('unknown-method-is-jsonrpc-method-not-found');
    expect(ids).toContain('occ-conflict-rejected');
    expect(ids).toContain('path-traversal-blocked');
    expect(ids).toContain('syntax-guard-rejects-broken-code');
    expect(ids).toContain('missing-resource-rejected');
    expect(ids).toContain('apply-edit-returns-real-occ-version');
  });

  it('every case declares a valid expectation', () => {
    for (const c of loadFixture().cases) {
      expect(c.id, 'case id required').toBeTruthy();
      expect(c.method.startsWith('oumv/'), `${c.id}: method must be an oumv/* method`).toBe(true);
      const hasError = c.expectError !== undefined;
      const hasResult = (c.expectResultFields ?? []).length > 0;
      expect(hasError || hasResult, `${c.id}: must expect an error code or result fields`).toBe(true);
      if (hasError) {
        expect(Number.isInteger(c.expectError!.code), `${c.id}: error code must be an integer`).toBe(true);
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
  });
});
