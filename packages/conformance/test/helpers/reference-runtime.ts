/**
 * A reference OUMV runtime used to prove the conformance runner, its transports
 * and the `oumv-certify` CLI. It is intentionally small: exactly enough spec
 * behaviour for fixtures v3, with no framework in front of it.
 */
import http from 'node:http';
import net from 'node:net';
import crypto from 'node:crypto';
import type { JsonRpcRequest, JsonRpcResponse } from '../../src/fixtures.js';

export const REFERENCE_SOURCE = 'value = 1\n';
// The reference runtime has no disk. A path "exists" unless it carries the create
// marker ("created" appears in every runner's ${NEW_FILE}); batch paths exist only
// after a batch created them, which is what the atomicity follow-up asserts.
const batchFiles = new Set<string>();
const pathExists = (candidate: string) => {
  const name = String(candidate);
  if (name.includes('batch_')) return batchFiles.has(name);
  return !name.includes('created');
};
export const ZERO_VERSION = `sha256:${'0'.repeat(64)}`;

/** Live handshake sessions; the reference TTL is honoured on read (spec §3). */
const sessions = new Map<string, number>();
/** Per-session idempotency map (§3, wire 1.6.0): key -> first final result. */
const idempotency = new Map<string, unknown>();

function createSession(requestedTtl: unknown): { id: string; ttl: number } {
  const requested = Number(requestedTtl);
  const ttl = Number.isFinite(requested) && requested > 0 ? Math.min(Math.max(Math.floor(requested), 1), 86400) : 3600;
  const id = `sess-ref-${crypto.randomBytes(4).toString('hex')}`;
  sessions.set(id, Date.now() + ttl * 1000);
  return { id, ttl };
}

function sessionExpired(sessionId: unknown): boolean {
  if (!sessionId) return false;
  const expiresAt = sessions.get(String(sessionId));
  return expiresAt === undefined || Date.now() > expiresAt;
}

export function occToken(content: string): string {
  return `sha256:${crypto.createHash('sha256').update(content, 'utf-8').digest('hex')}`;
}

/**
 * §4.1 result versioning (wire 1.6.0): the freshness token over the reference
 * runtime's (imaginary) workspace inventory. Constant, because the reference
 * runtime has no disk to digest.
 */
export const REFERENCE_WORKSPACE_VERSION = occToken('reference workspace inventory\n');

/** Store-and-replay for idempotent mutations (§3): returns the result unchanged. */
function cls_store_idempotent(params: Record<string, any>, result: Record<string, unknown>): Record<string, unknown> {
  if (params.idempotencyKey) {
    idempotency.set(`${String(params.sessionId ?? 'default')}:${String(params.idempotencyKey)}`, result);
  }
  return result;
}

export function referenceRuntime(request: JsonRpcRequest): JsonRpcResponse {
  const ok = (result: unknown): JsonRpcResponse => ({ jsonrpc: '2.0', id: request.id, result });
  const fail = (code: number, message: string, data?: Record<string, unknown>): JsonRpcResponse => ({
    jsonrpc: '2.0',
    id: request.id,
    error: { code, message, ...(data ? { data } : {}) },
  });
  const params = (request.params ?? {}) as Record<string, any>;

  switch (request.method) {
    case 'oumv/handshake':
      if (params.protocolVersion) {
        const [maj, min] = String(params.protocolVersion).split('.').map(Number);
        if (maj !== 1 || min > 6) {
          return fail(-32006, `UNSUPPORTED_CAPABILITY: protocol version ${params.protocolVersion}`, {
            reason: 'unsupported_version',
          });
        }
      }
      {
        const session = createSession(params.sessionTtlSeconds);
        return ok({
          protocolVersion: '1.6.0',
          profile: 'backend',
          sessionId: session.id,
          ttlSeconds: session.ttl,
          runtimeInfo: { name: 'reference', version: '0.0.1' },
          capabilities: {
            observe: { levels: ['L0', 'L1', 'L2', 'L3', 'L4'] },
            understand: { impactAnalysis: true, causality: true },
            mutate: { occ: true, multiFile: true, preview: true },
            verify: { build: true },
            index: { symbols: true },
            observeQuery: { readOnly: true },
            events: { diagnostic: false },
            sessions: { ttlSeconds: true, cancel: true, idempotency: true },
          },
        });
      }

    case 'oumv/observe': {
      if (sessionExpired(params.sessionId)) {
        return fail(-32011, 'VALIDATION_FAILED: unknown or expired sessionId — re-run oumv/handshake', {
          reason: 'session_expired',
          sessionId: params.sessionId,
        });
      }
      const level = String(params.level);
      if (!['L0', 'L1', 'L2', 'L3', 'L4'].includes(level)) {
        return fail(-32006, `UNSUPPORTED_CAPABILITY: unknown observe level ${level}`, { reason: 'unsupported_level' });
      }
      // §4.1: honour the ifVersion freshness handshake (match → short envelope, mismatch → -32010).
      if (params.ifVersion) {
        if (String(params.ifVersion) !== REFERENCE_WORKSPACE_VERSION) {
          return fail(-32010, "STALE_RESOURCE_VERSION: the caller's token no longer matches the workspace — refetch without ifVersion", {
            reason: 'stale_version',
            current: REFERENCE_WORKSPACE_VERSION,
            expected: String(params.ifVersion),
          });
        }
        return ok({ level, format: 'json', unchanged: true, workspaceVersion: REFERENCE_WORKSPACE_VERSION });
      }
      if (level === 'L0') return ok({ level, format: 'json', data: { route: '/', mountedComponents: 3 }, workspaceVersion: REFERENCE_WORKSPACE_VERSION });
      if (level === 'L1') {
        const elements = [{ id: 'one' }, { id: 'two' }];
        const limit = Number(params.limit) > 0 ? Math.floor(Number(params.limit)) : 0;
        if (limit && limit < elements.length) {
          return ok({ level, format: 'json', data: { target: params.target ?? '/', elements: elements.slice(0, limit), hasMore: true, nextCursor: String(limit) }, workspaceVersion: REFERENCE_WORKSPACE_VERSION });
        }
        return ok({ level, format: 'json', data: { target: params.target ?? '/', elements }, workspaceVersion: REFERENCE_WORKSPACE_VERSION });
      }
      if (level === 'L2') {
        if (!params.target) return fail(-32602, 'INVALID_PARAMS: target is required');
        return ok({
          level,
          format: 'json',
          data: {
            target: params.target,
            components: [],
            evidence: { provenance: 'static', confidence: 'confirmed', resources: [] },
          },
          workspaceVersion: REFERENCE_WORKSPACE_VERSION,
        });
      }
      if (level === 'L3') {
        if (!params.target) return fail(-32602, 'INVALID_PARAMS: target is required');
        return ok({
          level,
          format: 'json',
          data: { target: params.target, source: REFERENCE_SOURCE, version: occToken(REFERENCE_SOURCE) },
          workspaceVersion: REFERENCE_WORKSPACE_VERSION,
        });
      }
      if (level === 'L4') {
        return ok({
          level,
          format: 'json',
          data: {
            traces: [
              {
                method: 'GET',
                path: '/health',
                route: '/health',
                handler: 'health',
                statusCode: 200,
                durationMs: 1.5,
                timestamp: new Date().toISOString(),
              },
            ],
          },
          workspaceVersion: REFERENCE_WORKSPACE_VERSION,
        });
      }
      return fail(-32011, 'VALIDATION_FAILED: unknown level');
    }

    case 'oumv/getSource':
      if (String(params.path).includes('missing')) {
        return fail(-32009, 'RESOURCE_NOT_FOUND: no such file');
      }
      if (!pathExists(String(params.path))) {
        return fail(-32009, `RESOURCE_NOT_FOUND: ${String(params.path)} does not exist`);
      }
      if (params.symbol && !REFERENCE_SOURCE.includes(String(params.symbol))) {
        return fail(-32009, `RESOURCE_NOT_FOUND: symbol ${params.symbol} not found`);
      }
      if (params.ifVersion && String(params.ifVersion) === occToken(REFERENCE_SOURCE)) {
        return ok({ path: params.path, version: occToken(REFERENCE_SOURCE), unchanged: true });
      }
      return ok({
        path: params.path,
        source: REFERENCE_SOURCE,
        version: occToken(REFERENCE_SOURCE),
        startLine: 1,
        endLine: 1,
      });

    case 'oumv/understand':
      // §4.1: understand honours the same freshness handshake (spec §4.1 note).
      if (params.ifVersion) {
        if (String(params.ifVersion) !== REFERENCE_WORKSPACE_VERSION) {
          return fail(-32010, "STALE_RESOURCE_VERSION: the caller's token no longer matches the workspace — refetch without ifVersion", {
            reason: 'stale_version',
            current: REFERENCE_WORKSPACE_VERSION,
            expected: String(params.ifVersion),
          });
        }
        return ok({ query: String(params.query ?? 'causality'), unchanged: true, workspaceVersion: REFERENCE_WORKSPACE_VERSION });
      }
      if (params.query === 'impact') {
        return ok({
          query: 'impact',
          target: params.target,
          impact: {
            target: params.target,
            affectedSymbols: [],
            breakingRisk: 'low',
            summary: 'no consumers found',
            observed: false,
            evidence: { provenance: 'static' },
          },
          workspaceVersion: REFERENCE_WORKSPACE_VERSION,
        });
      }
      return ok({
        query: 'causality',
        target: params.target,
        causality: {
          target: params.target,
          observed: true,
          traceCount: 1,
          traceChain: [],
          rootCause: 'GET /health',
          evidence: { provenance: 'runtime' },
        },
        workspaceVersion: REFERENCE_WORKSPACE_VERSION,
      });

    case 'oumv/verify':
      if (Array.isArray(params.steps) && params.steps.length > 0) {
        const steps = (params.steps as Array<Record<string, any>>).map((step) => ({
          target: String(step.target),
          statusCode: 200,
          status: 'passed',
          responseBody: '{}',
        }));
        return ok({
          status: 'passed',
          target: String(params.target ?? steps[0].target),
          statusCode: 200,
          steps,
          diff: { stepCount: steps.length },
          timings: { t_action_ms: 0.8, t_total_ms: 1.2 },
          durationMs: 1.2,
          scope: { checked: ['ordered steps'], notExecuted: [], notSupported: [] },
        });
      }
      return ok({
        status: 'passed',
        target: String(params.target),
        diff: '',
        timings: { t_action_ms: 0.4, t_total_ms: 1.2 },
        durationMs: 1.2,
        scope: { checked: ['status'], notExecuted: [], notSupported: [] },
      });

    case 'oumv/previewEdit': {
      // §4.4 dry-run: the applyEdit guard order without any write.
      if (sessionExpired(params.sessionId)) {
        return fail(-32011, 'VALIDATION_FAILED: unknown or expired sessionId — re-run oumv/handshake', {
          reason: 'session_expired',
        });
      }
      const items: Array<Record<string, any>> = Array.isArray(params.edits) ? params.edits : [params];
      if (!items.length || items.length > 16) {
        return fail(-32011, 'VALIDATION_FAILED: batch must hold 1..16 items', { reason: 'batch_size' });
      }
      const previews: Array<Record<string, unknown>> = [];
      for (const item of items) {
        const path = String(item.path ?? '');
        const mode = String(item.mode ?? 'replace');
        if (!['replace', 'create', 'patch', 'symbol', 'delete', 'rename'].includes(mode)) {
          return fail(-32006, `UNSUPPORTED_CAPABILITY: unknown preview mode ${mode}`, { reason: 'unknown_mode', path });
        }
        if (mode === 'create') {
          if (item.expectedVersion) {
            return fail(-32011, 'VALIDATION_FAILED: expectedVersion must be omitted for mode=create', {
              reason: 'create_forbids_version',
              path,
            });
          }
          if (pathExists(path)) {
            return fail(-32001, 'CONFLICT_DETECTED: file already exists', { reason: 'file_exists', path });
          }
        } else if (!item.expectedVersion) {
          return fail(-32011, 'VALIDATION_FAILED: expectedVersion is required', {
            reason: 'expected_version_required',
            path,
          });
        }
        if (String(item.replacement).includes('def broken(:')) {
          return fail(-32002, 'SYNTAX_ERROR: invalid syntax', { path });
        }
        const currentVersion = pathExists(path) ? occToken(REFERENCE_SOURCE) : ZERO_VERSION;
        const newVersion = occToken(String(item.replacement));
        previews.push({
          path,
          mode,
          unchanged: pathExists(path) && newVersion === currentVersion,
          currentVersion,
          newVersion,
          wouldApply: true,
        });
      }
      return ok({ status: 'PREVIEW', applied: false, previews });
    }

    case 'oumv/cancel': {
      // §3: best-effort — unknown ids and finished requests are results, never errors.
      if (params.target === 'last') return ok({ cancelled: false, finished: true });
      return ok({ cancelled: false, requestId: params.requestId });
    }

    case 'oumv/index': {
      if (!String(params.query ?? '').trim()) {
        return fail(-32602, 'INVALID_PARAMS: query is required');
      }
      const symbols = [
        {
          resourceId: 'variable:value@reference.ts',
          name: 'value',
          kind: 'variable',
          file: 'reference.ts',
          lines: [1, 1],
          signature: 'value = 1',
          match: 'exact',
        },
      ];
      return ok({ matches: symbols, truncated: false, totalMatches: symbols.length });
    }

    case 'oumv/query': {
      if (sessionExpired(params.sessionId)) {
        return fail(-32011, 'VALIDATION_FAILED: unknown or expired sessionId — re-run oumv/handshake', {
          reason: 'session_expired',
        });
      }
      const sql = String(params.sql ?? '').trim();
      if (/^(select|explain)\b/i.test(sql)) {
        return ok({ columns: ['1'], rows: [[1]], rowCount: 1, truncated: false });
      }
      return fail(-32003, 'SECURITY_VIOLATION: only SELECT/EXPLAIN statements are accepted', {
        reason: 'query_forbidden',
      });
    }

    case 'oumv/build': {
      // Honest skip: the reference runtime executes no shell commands.
      return ok({
        status: 'skipped',
        command: String(params.command ?? 'none'),
        diagnostics: [],
        skipReason: 'reference runtime executes no shell commands',
      });
    }

    case 'oumv/applyEdit': {
      // Wire 1.5.0 batch envelope: pre-flight every item, then answer per item.
      if (Array.isArray(params.edits)) {
        const edits = params.edits as Array<Record<string, any>>;
        if (edits.length === 0 || edits.length > 16) {
          return fail(-32011, 'VALIDATION_FAILED: edits must hold 1..16 items', { reason: 'batch_size' });
        }
        const seen = new Set<string>();
        const staged: Array<Record<string, unknown>> = [];
        const created: string[] = [];
        for (let index = 0; index < edits.length; index++) {
          const item = edits[index] ?? {};
          const path = String(item.path ?? '');
          const mode = String(item.mode ?? 'replace');
          if (!['replace', 'create', 'patch'].includes(mode)) {
            return fail(-32006, `UNSUPPORTED_CAPABILITY: mode ${mode} is not batchable`, {
              reason: 'unknown_mode',
              editIndex: index,
              path,
            });
          }
          if (seen.has(path)) {
            return fail(-32011, 'VALIDATION_FAILED: duplicate path in batch', {
              reason: 'duplicate_path',
              editIndex: index,
              path,
            });
          }
          seen.add(path);
          if (mode === 'create') {
            if (item.expectedVersion) {
              return fail(-32011, 'VALIDATION_FAILED: expectedVersion must be omitted for mode=create', {
                reason: 'create_forbids_version',
                editIndex: index,
                path,
              });
            }
            if (pathExists(path)) {
              return fail(-32001, 'CONFLICT_DETECTED: file already exists', {
                reason: 'file_exists',
                editIndex: index,
                path,
              });
            }
            if (String(item.replacement).includes('def broken(:')) {
              return fail(-32002, 'SYNTAX_ERROR: invalid syntax', { editIndex: index, path });
            }
            created.push(path);
            staged.push({ path, newVersion: occToken(String(item.replacement)), created: true });
            continue;
          }
          if (!item.expectedVersion) {
            return fail(-32011, 'VALIDATION_FAILED: expectedVersion is required', {
              reason: 'expected_version_required',
              editIndex: index,
              path,
            });
          }
          if (String(item.expectedVersion) === ZERO_VERSION) {
            return fail(-32001, 'CONFLICT_DETECTED: stale expectedVersion', { editIndex: index, path });
          }
          if (mode === 'patch') {
            const hunks = Array.isArray(item.hunks) ? item.hunks : [];
            if (!hunks.length) {
              return fail(-32011, 'VALIDATION_FAILED: hunks is required for mode=patch', {
                reason: 'hunks_required',
                editIndex: index,
                path,
              });
            }
            const text = REFERENCE_SOURCE;
            for (const hunk of hunks) {
              const count = text.split(String(hunk?.target ?? '')).length - 1;
              if (count === 0) {
                return fail(-32009, 'RESOURCE_NOT_FOUND: target not found', {
                  reason: 'target_not_found',
                  editIndex: index,
                  path,
                });
              }
            }
            staged.push({ path, newVersion: occToken(text), hunksApplied: hunks.length });
            continue;
          }
          if (String(item.replacement).includes('def broken(:')) {
            return fail(-32002, 'SYNTAX_ERROR: invalid syntax', { editIndex: index, path });
          }
          staged.push({ path, newVersion: occToken(String(item.replacement)) });
        }
        // Nothing exists until the whole batch staged: the atomicity follow-up
        // asserts that a failed batch left no file behind.
        for (const path of created) batchFiles.add(path);
        return ok({ status: 'APPLIED', edits: staged });
      }

      if (params.idempotencyKey) {
        const key = `${String(params.sessionId ?? 'default')}:${String(params.idempotencyKey)}`;
        if (idempotency.has(key)) return ok(idempotency.get(key));
      }
      const editMode = String(params.mode ?? 'replace');
      if (!['replace', 'create', 'symbol', 'delete', 'rename', 'patch'].includes(editMode)) {
        return fail(-32006, `UNSUPPORTED_CAPABILITY: unknown applyEdit mode ${editMode}`, { reason: 'unknown_mode' });
      }
      if (params.mode === 'create') {
        if (params.expectedVersion) {
          return fail(-32011, 'VALIDATION_FAILED: expectedVersion must be omitted for mode=create', {
            reason: 'create_forbids_version',
          });
        }
        if (pathExists(String(params.path))) {
          return fail(-32001, 'CONFLICT_DETECTED: file already exists', { reason: 'file_exists' });
        }
        return ok(cls_store_idempotent(params, {
          status: 'APPLIED',
          path: params.path,
          newVersion: occToken(String(params.replacement)),
          syntaxCheck: { status: 'passed', tool: 'reference' },
          created: true,
        }));
      }
      if (params.mode === 'patch') {
        if (!params.expectedVersion) {
          return fail(-32011, 'VALIDATION_FAILED: expectedVersion is required', { reason: 'expected_version_required' });
        }
        const hunks = Array.isArray(params.hunks) ? params.hunks : [];
        if (!hunks.length) {
          return fail(-32011, 'VALIDATION_FAILED: hunks is required for mode=patch', { reason: 'hunks_required' });
        }
        let text = REFERENCE_SOURCE;
        for (const hunk of hunks) {
          const target = String(hunk?.target ?? '');
          if (!target) {
            return fail(-32011, 'VALIDATION_FAILED: hunk target is required', { reason: 'target_required' });
          }
          const count = text.split(target).length - 1;
          if (count === 0) {
            return fail(-32009, 'RESOURCE_NOT_FOUND: target not found', { reason: 'target_not_found' });
          }
          if (count > 1 && !hunk.replaceAll) {
            return fail(-32011, 'VALIDATION_FAILED: target not unique', { reason: 'target_not_unique', count });
          }
          const replacement = String(hunk?.replacement ?? '');
          text = hunk.replaceAll ? text.split(target).join(replacement) : text.replace(target, replacement);
        }
        return ok({
          status: 'APPLIED',
          path: params.path,
          newVersion: occToken(text),
          syntaxCheck: { status: 'passed', tool: 'reference' },
          hunksApplied: hunks.length,
        });
      }
      if (params.mode === 'delete') {
        if (params.replacement !== undefined && String(params.replacement) !== '') {
          return fail(-32011, 'VALIDATION_FAILED: replacement must be omitted for mode=delete', {
            reason: 'replacement_forbidden',
          });
        }
        if (!params.expectedVersion) {
          return fail(-32011, 'VALIDATION_FAILED: expectedVersion is required', { reason: 'expected_version_required' });
        }
        batchFiles.delete(String(params.path));
        return ok({ status: 'APPLIED', path: params.path, syntaxCheck: { status: 'skipped' }, deleted: true });
      }
      if (params.mode === 'rename') {
        if (!params.renameTo) {
          return fail(-32011, 'VALIDATION_FAILED: renameTo is required for mode=rename', {
            reason: 'rename_to_required',
          });
        }
        if (params.replacement !== undefined && String(params.replacement) !== '') {
          return fail(-32011, 'VALIDATION_FAILED: replacement must be omitted for mode=rename', {
            reason: 'replacement_forbidden',
          });
        }
        if (!params.expectedVersion) {
          return fail(-32011, 'VALIDATION_FAILED: expectedVersion is required', { reason: 'expected_version_required' });
        }
        return ok({ status: 'APPLIED', path: params.path, newPath: params.renameTo, syntaxCheck: { status: 'skipped' } });
      }
      if (params.mode === 'symbol') {
        if (!params.symbol) {
          return fail(-32011, 'VALIDATION_FAILED: symbol is required for mode=symbol', { reason: 'symbol_required' });
        }
        if (!params.expectedVersion) {
          return fail(-32011, 'VALIDATION_FAILED: expectedVersion is required', { reason: 'expected_version_required' });
        }
        return ok({
          status: 'APPLIED',
          path: params.path,
          symbol: params.symbol,
          newVersion: occToken(String(params.replacement)),
          syntaxCheck: { status: 'passed', tool: 'reference' },
        });
      }
      if (!params.expectedVersion) {
        return fail(-32011, 'VALIDATION_FAILED: expectedVersion is required', { reason: 'missing_version' });
      }
      if (String(params.path).startsWith('../')) {
        return fail(-32003, 'SECURITY_VIOLATION: path escapes the workspace root');
      }
      if (String(params.path).includes('missing')) {
        return fail(-32009, 'RESOURCE_NOT_FOUND: no such file');
      }
      if (String(params.expectedVersion) === ZERO_VERSION) {
        return fail(-32001, 'CONFLICT_DETECTED: stale expectedVersion');
      }
      if (String(params.replacement).includes('def broken(:')) {
        return fail(-32002, 'SYNTAX_ERROR: invalid syntax');
      }
      return ok({
        status: 'APPLIED',
        path: params.path,
        newVersion: occToken(String(params.replacement)),
      });
    }

    default:
      return fail(-32601, `METHOD_NOT_FOUND: ${request.method}`);
  }
}

export interface HttpRuntimeHandle {
  url: string;
  close: () => Promise<void>;
}

/** HTTP binding (§2.2): POST /__oumv/rpc, 200 even for RPC errors. */
export function startHttpRuntime(
  decorate?: (request: JsonRpcRequest, response: JsonRpcResponse) => JsonRpcResponse
): Promise<HttpRuntimeHandle> {
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      res.setHeader('Content-Type', 'application/json');
      try {
        const request = JSON.parse(body) as JsonRpcRequest;
        const response = referenceRuntime(request);
        res.end(JSON.stringify(decorate ? decorate(request, response) : response));
      } catch (err: any) {
        res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: err.message } }));
      }
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address() as net.AddressInfo;
      resolve({
        url: `http://127.0.0.1:${address.port}/__oumv/rpc`,
        close: () => new Promise<void>((done) => server.close(() => done())),
      });
    });
  });
}

export interface WsRuntimeHandle {
  url: string;
  close: () => Promise<void>;
}

function acceptKey(key: string): string {
  return crypto
    .createHash('sha1')
    .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
    .digest('base64');
}

function frame(text: string): Buffer {
  const payload = Buffer.from(text, 'utf-8');
  if (payload.length < 126) return Buffer.concat([Buffer.from([0x81, payload.length]), payload]);
  const header = Buffer.alloc(4);
  header[0] = 0x81;
  header[1] = 126;
  header.writeUInt16BE(payload.length, 2);
  return Buffer.concat([header, payload]);
}

/** Minimal WS server for the client transport test (§2.4). */
export function startWsRuntime(): Promise<WsRuntimeHandle> {
  const sockets = new Set<net.Socket>();
  const server = http.createServer((_req, res) => {
    res.statusCode = 404;
    res.end();
  });
  server.on('upgrade', (req, socket: net.Socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.write(
      [
        'HTTP/1.1 101 Switching Protocols',
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Accept: ${acceptKey(String(req.headers['sec-websocket-key']))}`,
        '',
        '',
      ].join('\r\n')
    );

    let buffer = Buffer.alloc(0);
    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      for (;;) {
        if (buffer.length < 2) return;
        let length = buffer[1] & 0x7f;
        let offset = 2;
        if (length === 126) {
          if (buffer.length < 4) return;
          length = buffer.readUInt16BE(2);
          offset = 4;
        } else if (length === 127) {
          if (buffer.length < 10) return;
          length = Number(buffer.readBigUInt64BE(2));
          offset = 10;
        }
        const masked = (buffer[1] & 0x80) !== 0;
        const maskOffset = offset;
        if (masked) offset += 4;
        if (buffer.length < offset + length) return;
        let payload = buffer.subarray(offset, offset + length);
        if (masked) {
          const mask = buffer.subarray(maskOffset, maskOffset + 4);
          payload = Buffer.from(payload.map((byte, i) => byte ^ mask[i % 4]));
        }
        const opcode = buffer[0] & 0x0f;
        buffer = buffer.subarray(offset + length);
        if (opcode === 0x8) {
          socket.end();
          return;
        }
        if (opcode !== 0x1) continue;
        try {
          const request = JSON.parse(payload.toString('utf-8')) as JsonRpcRequest;
          socket.write(frame(JSON.stringify(referenceRuntime(request))));
        } catch {
          socket.write(frame(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse' } })));
        }
      }
    });
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address() as net.AddressInfo;
      resolve({
        url: `ws://127.0.0.1:${address.port}/__oumv/rpc`,
        close: () =>
          new Promise<void>((done) => {
            for (const socket of sockets) socket.destroy();
            server.close(() => done());
          }),
      });
    });
  });
}
