/**
 * Fixture-driven OUMV conformance runner (spec §10).
 *
 * The language-neutral cases live in `fixtures/conformance-cases.json` and are
 * executed by every runtime in the same order with the same assertions; this
 * module is the TypeScript/Node counterpart of tokensafe-backend's Go and Python
 * runners. A level claim without a report from this runner is not a certificate.
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { determineConformanceLevel, summarizeLevels } from './levels.js';
import type { ConformanceLevel, LevelStatus } from './levels.js';

export const SPEC_VERSION = '1.1.0';

export interface ConformanceCaseError {
  code: number;
  data?: Record<string, unknown>;
}

export interface ConformanceCase {
  id: string;
  level: 1 | 2 | 3;
  method: string;
  params: Record<string, unknown>;
  /** Setup calls needed before the assertion (currently only `verify`). */
  preconditions?: string[];
  expectResultFields?: string[];
  expectError?: ConformanceCaseError;
  expectLevelEquals?: string;
  expectSha256Field?: string;
  expectArrayField?: string;
  expectEvidence?: boolean;
  /** `${EDIT_CONTENT}` or literal content whose sha256 must equal `newVersion`. */
  expectVersionMatchesContent?: string;
}

export interface FixtureSpec {
  protocolVersion: string;
  fixtureVersion: number;
  levelDefinitions?: Record<string, string>;
  cases: ConformanceCase[];
}

/** Concrete values substituted for `${MARKER}` placeholders in case params. */
export interface CaseMarkers {
  fixtureFile: string;
  missingFile: string;
  editTarget: string;
  newFile: string;
  editVersion: string;
  editContent: string;
  brokenContent: string;
  l2Target: string;
  l3Target: string;
  verifyTarget: string;
}

export interface CaseResult {
  id: string;
  level: 1 | 2 | 3;
  status: 'passed' | 'failed';
  error?: string;
}

export interface FixtureReport {
  adapterName: string;
  framework?: string;
  specVersion: string;
  fixtureVersion: number;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  attainedLevel: ConformanceLevel;
  levels: Record<'1' | '2' | '3', LevelStatus>;
  cases: CaseResult[];
  generatedAt: string;
  environment?: Record<string, unknown>;
}

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: JsonRpcError;
}

/** Minimal transport surface the fixture runner needs. */
export interface RpcTransport {
  name: string;
  request(request: JsonRpcRequest): Promise<JsonRpcResponse>;
  close?(): Promise<void> | void;
}

const MARKER_KEYS: Record<string, keyof CaseMarkers> = {
  '${FIXTURE_FILE}': 'fixtureFile',
  '${MISSING_FILE}': 'missingFile',
  '${EDIT_TARGET_FILE}': 'editTarget',
  '${EDIT_TARGET_VERSION}': 'editVersion',
  '${NEW_FILE}': 'newFile',
  '${EDIT_CONTENT}': 'editContent',
  '${BROKEN_CONTENT}': 'brokenContent',
  '${L2_TARGET}': 'l2Target',
  '${L3_TARGET}': 'l3Target',
  '${VERIFY_TARGET}': 'verifyTarget',
};

export function defaultMarkers(overrides: Partial<CaseMarkers> = {}): CaseMarkers {
  return {
    fixtureFile: '__oumv_conformance_target.py',
    missingFile: '__oumv_conformance_missing.py',
    editTarget: '__oumv_conformance_edit.py',
    newFile: '__oumv_conformance_created.py',
    editVersion: '',
    editContent: 'value = 1\n',
    brokenContent: 'def broken(:\n  pass\n',
    l2Target: 'app.main:app',
    l3Target: 'app/main.py',
    verifyTarget: 'GET /health',
    ...overrides,
  };
}

/** Reads a fixture file and rejects files without cases. */
export function loadFixtures(path: string): FixtureSpec {
  const raw = readFileSync(path, 'utf-8');
  let spec: FixtureSpec;
  try {
    spec = JSON.parse(raw);
  } catch (err: any) {
    throw new Error(`parse conformance fixtures: ${err.message}`);
  }
  if (!Array.isArray(spec.cases) || spec.cases.length === 0) {
    throw new Error(`fixture ${path} contains no cases`);
  }
  if (typeof spec.fixtureVersion !== 'number') {
    throw new Error(`fixture ${path} has no fixtureVersion`);
  }
  return spec;
}

/** Substitutes `${MARKER}` placeholders in string params only. */
export function substituteMarkers(
  params: Record<string, unknown> | undefined,
  markers: CaseMarkers
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params ?? {})) {
    if (typeof value !== 'string') {
      out[key] = value;
      continue;
    }
    let replaced = value;
    for (const [marker, field] of Object.entries(MARKER_KEYS)) {
      replaced = replaced.split(marker).join(String(markers[field]));
    }
    out[key] = replaced;
  }
  return out;
}

/** OCC version token for content (spec §4.3 `version`/`newVersion`). */
export function occVersion(content: string): string {
  return `sha256:${createHash('sha256').update(content, 'utf-8').digest('hex')}`;
}

function jsonPathValue(data: unknown, path: string): { found: boolean; value?: unknown } {
  let current: unknown = data;
  for (const segment of path.split('.')) {
    if (current === null || typeof current !== 'object' || Array.isArray(current)) {
      return { found: false };
    }
    const record = current as Record<string, unknown>;
    if (!(segment in record)) return { found: false };
    current = record[segment];
  }
  return { found: true, value: current };
}

const EVIDENCE_PROVENANCE = new Set(['runtime', 'static', 'contract', 'inferred', 'external']);

/**
 * Evaluates every expectation a case declares. Returns '' on success, otherwise
 * the failure reason — the same wording shape the Go runner produces.
 */
export function evaluateCase(c: ConformanceCase, response: JsonRpcResponse, markers: CaseMarkers): string {
  if (c.expectError) {
    if (!response.error) {
      return `expected error code ${c.expectError.code}, got result`;
    }
    if (response.error.code !== c.expectError.code) {
      return `expected error code ${c.expectError.code}, got ${response.error.code} (${response.error.message})`;
    }
    for (const [key, want] of Object.entries(c.expectError.data ?? {})) {
      const got = response.error.data?.[key];
      if (JSON.stringify(got) !== JSON.stringify(want)) {
        return `error data.${key} must be ${JSON.stringify(want)}, got ${JSON.stringify(got)}`;
      }
    }
    return '';
  }
  if (response.error) {
    return `expected success, got error ${response.error.code}: ${response.error.message}`;
  }

  const result = response.result;
  for (const field of c.expectResultFields ?? []) {
    if (!jsonPathValue(result, field).found) {
      return `result missing expected field ${JSON.stringify(field)}`;
    }
  }
  if (c.expectLevelEquals) {
    const level = jsonPathValue(result, 'level').value;
    if (level !== c.expectLevelEquals) {
      return `expected level ${JSON.stringify(c.expectLevelEquals)}, got ${JSON.stringify(level)}`;
    }
  }
  if (c.expectSha256Field) {
    const token = jsonPathValue(result, c.expectSha256Field).value;
    if (typeof token !== 'string' || !token.startsWith('sha256:') || token.length !== 'sha256:'.length + 64) {
      return `field ${JSON.stringify(c.expectSha256Field)} must be a sha256 OCC token, got ${JSON.stringify(token)}`;
    }
  }
  if (c.expectArrayField) {
    const value = jsonPathValue(result, c.expectArrayField).value;
    if (!Array.isArray(value) || value.length === 0) {
      return `field ${JSON.stringify(c.expectArrayField)} must be a non-empty array`;
    }
  }
  if (c.expectEvidence) {
    const evidence = jsonPathValue(result, 'data.evidence').value;
    if (!evidence || typeof evidence !== 'object') {
      return 'result must carry evidence metadata at data.evidence';
    }
    const provenance = (evidence as Record<string, unknown>).provenance;
    if (typeof provenance !== 'string' || !EVIDENCE_PROVENANCE.has(provenance)) {
      return `evidence provenance ${JSON.stringify(provenance)} is not a spec §6.2 value`;
    }
  }
  if (c.expectVersionMatchesContent) {
    const expected = c.expectVersionMatchesContent.split('${EDIT_CONTENT}').join(markers.editContent);
    const version = (result as Record<string, unknown> | undefined)?.newVersion;
    const want = occVersion(expected);
    if (version !== want) {
      return `version token must match written content: expected ${want}, got ${String(version)}`;
    }
  }
  return '';
}

export interface RunFixturesOptions {
  adapterName: string;
  framework?: string;
  environment?: Record<string, unknown>;
  /** Called for every case; used by CLIs to stream progress. */
  onCase?: (result: CaseResult) => void;
}

/**
 * Runs every fixture case over the transport and builds a report conforming to
 * `schemas/conformance-report.json`.
 */
export async function runFixtureSuite(
  transport: RpcTransport,
  spec: FixtureSpec,
  markers: CaseMarkers,
  options: RunFixturesOptions
): Promise<FixtureReport> {
  const results: CaseResult[] = [];

  for (const testCase of spec.cases) {
    const result: CaseResult = { id: testCase.id, level: testCase.level, status: 'passed' };
    let failure = '';

    for (const precondition of testCase.preconditions ?? []) {
      if (precondition !== 'verify') {
        failure = `unknown precondition ${JSON.stringify(precondition)}`;
        break;
      }
      const response = await transport.request({
        jsonrpc: '2.0',
        id: `${testCase.id}-precondition`,
        method: 'oumv/verify',
        params: { target: markers.verifyTarget, action: 'conformance-probe' },
      });
      if (response.error) {
        failure = `verify precondition failed: ${response.error.code} ${response.error.message}`;
        break;
      }
    }

    if (!failure) {
      const response = await transport.request({
        jsonrpc: '2.0',
        id: testCase.id,
        method: testCase.method,
        params: substituteMarkers(testCase.params, markers),
      });
      failure = evaluateCase(testCase, response, markers);
    }

    if (failure) {
      result.status = 'failed';
      result.error = failure;
    }
    results.push(result);
    options.onCase?.(result);
  }

  const passed = results.filter((r) => r.status === 'passed').length;
  const failed = results.length - passed;
  return {
    adapterName: options.adapterName,
    ...(options.framework ? { framework: options.framework } : {}),
    specVersion: spec.protocolVersion,
    fixtureVersion: spec.fixtureVersion,
    total: results.length,
    passed,
    failed,
    skipped: 0,
    attainedLevel: determineConformanceLevel(results),
    levels: summarizeLevels(results) as unknown as Record<'1' | '2' | '3', LevelStatus>,
    cases: results,
    generatedAt: new Date().toISOString(),
    ...(options.environment ? { environment: options.environment } : {}),
  };
}
