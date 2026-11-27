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

export const SPEC_VERSION = '1.5.0';

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
  expectValues?: Record<string, unknown>;
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
  /** Server-push cases (spec §2.3/§2.4); run by `--sse`/`--ws` certificates only. */
  pushCases?: PushCase[];
  /** Cases gated on an advertised handshake capability (e.g. verify.sandboxRollback). */
  capabilityCases?: CapabilityCase[];
  /** Session-lifecycle cases: handshake with a TTL, wait for it, expect -32011. */
  sessionCases?: SessionCase[];
}

/** A case that only makes sense when the runtime advertises a capability. */
export interface CapabilityCase extends ConformanceCase {
  /** Dotted path in the handshake capabilities, e.g. `verify.sandboxRollback`. */
  requiresCapability: string;
  /** Paths removed before the case so a leftover from a previous run cannot fail it. */
  cleanup?: string[];
  /** One follow-up call whose expectations the case also asserts (atomicity probes). */
  followUp?: ConformanceCase;
}

/** An expired-session case: issue a short-lived session, wait it out, expect -32011. */
export interface SessionCase extends ConformanceCase {
  /** Capability that must be advertised for this case to run (e.g. `sessions.ttlSeconds`). */
  requiresCapability?: string;
  /** Lifetime requested from the handshake; the runner waits ttl + 300 ms. */
  ttlSeconds: number;
}

/** A pushed event: SSE `event:`/`id:`/`data:`, or a WS notification method/params. */
export interface PushEvent {
  event: string;
  id: string;
  data: Record<string, unknown>;
}

/** A live push channel the runner asserts against. */
export interface PushEventSource {
  kind: 'sse' | 'ws';
  /** Opens the channel before the suite runs (SSE connects eagerly). */
  start?(): Promise<void>;
  /** Cursor of the last delivered event ('' for transports without replay). */
  lastEventId(): string;
  waitFor(event: string, match: Record<string, unknown>, timeoutMs: number): Promise<PushEvent>;
  /** SSE only: reconnect from `lastEventId` so the server replays what was missed. */
  reconnect(lastEventId: string): Promise<void>;
  close(): Promise<void> | void;
}

export interface PushCase {
  id: string;
  level: 1 | 2 | 3;
  transport: 'sse' | 'ws';
  trigger: { method: string; params: Record<string, unknown> };
  expectEvents: Array<{ event: string; data?: Record<string, unknown> }>;
  replay?: { expectEvents?: Array<{ event: string; data?: Record<string, unknown> }> };
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
  symbolFile: string;
  symbolName: string;
  symbolReplacement: string;
  symbolVersion: string;
  symbolFileContent: string;
  deleteFile: string;
  deleteVersion: string;
  renameSource: string;
  renameTarget: string;
  renameVersion: string;
  // wire 1.3.0: the version of editContent once written, and the text a
  // mode=patch hunk splices over it (the whole content, replaced)
  editContentVersion: string;
  patchReplacement: string;
  // fixtures v8: the file a push case creates to prove `state`/notifications
  pushFile: string;
  pushContent: string;
  // fixtures v9: the target a sandbox capability case dispatches against
  sandboxTarget: string;
  // fixtures v10: the two files an applyEdit batch creates, and their content
  batchFileA: string;
  batchFileB: string;
  batchContent: string;
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
  '${EDIT_CONTENT_VERSION}': 'editContentVersion',
  '${PATCH_REPLACEMENT}': 'patchReplacement',
  '${BROKEN_CONTENT}': 'brokenContent',
  '${L2_TARGET}': 'l2Target',
  '${L3_TARGET}': 'l3Target',
  '${VERIFY_TARGET}': 'verifyTarget',
  '${SYMBOL_FILE}': 'symbolFile',
  '${SYMBOL_NAME}': 'symbolName',
  '${SYMBOL_REPLACEMENT}': 'symbolReplacement',
  '${SYMBOL_VERSION}': 'symbolVersion',
  '${SYMBOL_FILE_CONTENT}': 'symbolFileContent',
  '${DELETE_FILE}': 'deleteFile',
  '${DELETE_VERSION}': 'deleteVersion',
  '${RENAME_SOURCE}': 'renameSource',
  '${RENAME_TARGET}': 'renameTarget',
  '${RENAME_VERSION}': 'renameVersion',
  '${PUSH_FILE}': 'pushFile',
  '${PUSH_CONTENT}': 'pushContent',
  '${SANDBOX_TARGET}': 'sandboxTarget',
  '${BATCH_FILE_A}': 'batchFileA',
  '${BATCH_FILE_B}': 'batchFileB',
  '${BATCH_CONTENT}': 'batchContent',
};

/** Substitutes every `${MARKER}` in a string (params and expectations). */
export function substituteText(text: string, markers: CaseMarkers): string {
  let replaced = text;
  for (const [marker, field] of Object.entries(MARKER_KEYS)) {
    replaced = replaced.split(marker).join(String(markers[field]));
  }
  return replaced;
}

export function defaultMarkers(overrides: Partial<CaseMarkers> = {}): CaseMarkers {
  return {
    fixtureFile: '__oumv_conformance_target.py',
    missingFile: '__oumv_conformance_missing.py',
    editTarget: '__oumv_conformance_edit.py',
    newFile: '__oumv_conformance_created.py',
    editVersion: '',
    editContent: 'value = 1\n',
    editContentVersion: occVersion('value = 1\n'),
    patchReplacement: '# patched by conformance\nvalue = 1\n',
    brokenContent: 'def broken(:\n  pass\n',
    l2Target: 'app.main:app',
    l3Target: 'app/main.py',
    verifyTarget: 'GET /health',
    symbolFile: '__oumv_conformance_symbol.py',
    symbolName: 'value',
    symbolReplacement: 'def value():\n    return 42\n',
    symbolVersion: occVersion('def value():\n    return 41\n'),
    symbolFileContent: 'def value():\n    return 42\n',
    deleteFile: '__oumv_conformance_delete.py',
    deleteVersion: occVersion('value = 1\n'),
    renameSource: '__oumv_conformance_rename.py',
    renameTarget: '__oumv_conformance_renamed.py',
    renameVersion: occVersion('value = 2\n'),
    pushFile: '__oumv_conformance_push.py',
    pushContent: 'value = 3\n',
    sandboxTarget: 'POST /__oumv_sandbox_probe',
    batchFileA: '__oumv_conformance_batch_a.py',
    batchFileB: '__oumv_conformance_batch_b.py',
    batchContent: 'value = 7\n',
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

/** Substitutes `${MARKER}` placeholders in params, recursing into arrays/objects. */
export function substituteMarkers(
  params: Record<string, unknown> | undefined,
  markers: CaseMarkers
): Record<string, unknown> {
  const walk = (value: unknown): unknown => {
    if (typeof value === 'string') return substituteText(value, markers);
    if (Array.isArray(value)) return value.map(walk);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, walk(v)]));
    }
    return value;
  };
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params ?? {})) out[key] = walk(value);
  return out;
}

/** OCC version token for content (spec §4.3 `version`/`newVersion`). */
export function occVersion(content: string): string {
  return `sha256:${createHash('sha256').update(content, 'utf-8').digest('hex')}`;
}

function jsonPathValue(data: unknown, path: string): { found: boolean; value?: unknown } {
  let current: unknown = data;
  for (const segment of path.split('.')) {
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) return { found: false };
      current = current[index];
      continue;
    }
    if (current === null || typeof current !== 'object') return { found: false };
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
  for (const [path, rawWant] of Object.entries(c.expectValues ?? {})) {
    const want = typeof rawWant === 'string' ? substituteText(rawWant, markers) : rawWant;
    const { found, value } = jsonPathValue(result, path);
    if (!found) return `result missing expected path ${JSON.stringify(path)}`;
    if (JSON.stringify(value) !== JSON.stringify(want)) {
      return `expected ${path}=${JSON.stringify(want)}, got ${JSON.stringify(value)}`;
    }
  }
  if (c.expectVersionMatchesContent) {
    const expected = substituteText(c.expectVersionMatchesContent, markers);
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
  /** Live push channel: runs the spec's pushCases that match its kind. */
  push?: PushEventSource;
  /** How long a push case waits for its event (default 5000 ms). */
  pushTimeoutMs?: number;
  /** Handshake capabilities: capabilityCases run only when their claim is true. */
  capabilities?: Record<string, unknown>;
}

/** True only when the dotted capability path resolves to literal `true`. */
export function capabilityAdvertised(
  capabilities: Record<string, unknown> | undefined,
  path: string
): boolean {
  let current: unknown = capabilities;
  for (const segment of path.split('.')) {
    if (!current || typeof current !== 'object') return false;
    current = (current as Record<string, unknown>)[segment];
  }
  return current === true;
}

/** Every expected key must equal the pushed payload (markers substituted). */
function matchesPushPayload(
  data: Record<string, unknown>,
  expected: Record<string, unknown> | undefined,
  markers: CaseMarkers
): boolean {
  for (const [key, rawWant] of Object.entries(expected ?? {})) {
    const want = typeof rawWant === 'string' ? substituteText(rawWant, markers) : rawWant;
    if (JSON.stringify(data?.[key]) !== JSON.stringify(want)) return false;
  }
  return true;
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Removes leftover files before a case that creates them, so a previous run
 * (or a crashed certificate) cannot turn mode=create into CONFLICT_DETECTED.
 */
async function cleanupPaths(
  transport: RpcTransport,
  paths: string[],
  markers: CaseMarkers
): Promise<void> {
  for (const rawPath of paths) {
    const path = substituteText(String(rawPath), markers);
    if (!path) continue;
    const probe = await transport.request({
      jsonrpc: '2.0',
      id: 'cleanup',
      method: 'oumv/getSource',
      params: { path },
    });
    const version = (probe.result as Record<string, unknown> | undefined)?.version;
    if (!probe.error && typeof version === 'string') {
      await transport.request({
        jsonrpc: '2.0',
        id: 'cleanup',
        method: 'oumv/applyEdit',
        params: { path, mode: 'delete', expectedVersion: version },
      });
    }
  }
}

/**
 * Runs one push case: make the trigger idempotent, fire it, then assert the
 * delivered event (and, for SSE, that `Last-Event-ID` replays it).
 * Returns '' on success or the failure reason.
 */
async function runPushCase(
  pushCase: PushCase,
  transport: RpcTransport,
  source: PushEventSource,
  markers: CaseMarkers,
  timeoutMs: number
): Promise<string> {
  const params = substituteMarkers(pushCase.trigger.params, markers);
  const targetPath = String(params.path ?? '');
  await cleanupPaths(transport, targetPath ? [targetPath] : [], markers);

  const cursorBefore = source.lastEventId();
  const trigger = await transport.request({
    jsonrpc: '2.0',
    id: `${pushCase.id}-trigger`,
    method: pushCase.trigger.method,
    params,
  });
  if (trigger.error) {
    return `trigger failed: ${trigger.error.code} ${trigger.error.message}`;
  }

  for (const expectation of pushCase.expectEvents) {
    const match = substituteMarkers(expectation.data, markers);
    try {
      await source.waitFor(expectation.event, match, timeoutMs);
    } catch (err: any) {
      return err.message;
    }
  }

  if (pushCase.replay) {
    if (source.kind !== 'sse') return 'replay is only defined for SSE (Last-Event-ID)';
    await source.reconnect(cursorBefore);
    for (const expectation of pushCase.replay.expectEvents ?? []) {
      try {
        await source.waitFor(expectation.event, substituteMarkers(expectation.data, markers), timeoutMs);
      } catch (err: any) {
        return `replay: ${err.message}`;
      }
    }
  }
  return '';
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

  // Push cases run only for the transport this certificate is produced for: a
  // certificate names one transport, and a claim without a report is not made.
  if (options.push) {    for (const pushCase of spec.pushCases ?? []) {
      if (pushCase.transport !== options.push.kind) continue;
      const result: CaseResult = { id: pushCase.id, level: pushCase.level, status: 'passed' };
      const failure = await runPushCase(
        pushCase,
        transport,
        options.push,
        markers,
        options.pushTimeoutMs ?? 5_000
      );
      if (failure) {
        result.status = 'failed';
        result.error = failure;
      }
      results.push(result);
      options.onCase?.(result);
    }
  }

  // Capability cases prove an advertised claim. A runtime that does not advertise
  // it is not penalised: the case is not part of that report at all, so levels
  // stay comparable and no claim is ever certified by a skipped case.
  if (options.capabilities) {
    for (const capabilityCase of spec.capabilityCases ?? []) {
      if (!capabilityAdvertised(options.capabilities, capabilityCase.requiresCapability)) continue;
      const result: CaseResult = { id: capabilityCase.id, level: capabilityCase.level, status: 'passed' };
      await cleanupPaths(transport, capabilityCase.cleanup ?? [], markers);
      const response = await transport.request({
        jsonrpc: '2.0',
        id: capabilityCase.id,
        method: capabilityCase.method,
        params: substituteMarkers(capabilityCase.params, markers),
      });
      let failure = evaluateCase(capabilityCase, response, markers);
      if (!failure && capabilityCase.followUp) {
        const followUp = capabilityCase.followUp;
        const followResponse = await transport.request({
          jsonrpc: '2.0',
          id: `${capabilityCase.id}-follow-up`,
          method: followUp.method,
          params: substituteMarkers(followUp.params, markers),
        });
        const followFailure = evaluateCase(followUp, followResponse, markers);
        if (followFailure) failure = `follow-up: ${followFailure}`;
      }
      if (failure) {
        result.status = 'failed';
        result.error = failure;
      }
      results.push(result);
      options.onCase?.(result);
    }
  }

  // Session cases prove the TTL the handshake advertises: a session issued with a
  // short lifetime must be dead after it, with the spec's -32011/session_expired.
  for (const sessionCase of spec.sessionCases ?? []) {
    if (!options.capabilities) continue;
    if (
      sessionCase.requiresCapability &&
      !capabilityAdvertised(options.capabilities, sessionCase.requiresCapability)
    ) {
      continue;
    }
    const result: CaseResult = { id: sessionCase.id, level: sessionCase.level, status: 'passed' };
    let failure = '';
    const handshake = await transport.request({
      jsonrpc: '2.0',
      id: `${sessionCase.id}-handshake`,
      method: 'oumv/handshake',
      params: { protocolVersion: spec.protocolVersion, sessionTtlSeconds: sessionCase.ttlSeconds },
    });
    const granted = (handshake.result as Record<string, unknown> | undefined)?.ttlSeconds;
    const sessionId = (handshake.result as Record<string, unknown> | undefined)?.sessionId;
    if (handshake.error) {
      failure = `handshake with sessionTtlSeconds failed: ${handshake.error.code} ${handshake.error.message}`;
    } else if (typeof granted !== 'number' || granted > sessionCase.ttlSeconds) {
      failure = `runtime granted ttlSeconds=${String(granted)}, expected <= ${sessionCase.ttlSeconds}`;
    } else if (typeof sessionId !== 'string' || !sessionId) {
      failure = 'handshake returned no sessionId';
    } else {
      await delay(sessionCase.ttlSeconds * 1000 + 300);
      const response = await transport.request({
        jsonrpc: '2.0',
        id: sessionCase.id,
        method: sessionCase.method,
        params: { ...substituteMarkers(sessionCase.params, markers), sessionId },
      });
      failure = evaluateCase(sessionCase, response, markers);
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
