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
export const ZERO_VERSION = `sha256:${'0'.repeat(64)}`;

export function occToken(content: string): string {
  return `sha256:${crypto.createHash('sha256').update(content, 'utf-8').digest('hex')}`;
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
      return ok({
        protocolVersion: '1.1.0',
        profile: 'backend',
        sessionId: 'sess-reference',
        ttlSeconds: 3600,
        runtimeInfo: { name: 'reference', version: '0.0.1' },
        capabilities: {
          observe: { levels: ['L0', 'L1', 'L2', 'L3', 'L4'] },
          understand: { impactAnalysis: true, causality: true },
          mutate: { occ: true },
          verify: {},
        },
      });

    case 'oumv/observe': {
      if (params.sessionId === 'sess-unknown') {
        return fail(-32011, 'VALIDATION_FAILED: unknown sessionId', { reason: 'session_expired' });
      }
      const level = String(params.level);
      if (level === 'L0') return ok({ level, format: 'json', data: { route: '/', mountedComponents: 3 } });
      if (level === 'L1') return ok({ level, format: 'json', data: { target: params.target ?? '/', elements: [] } });
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
        });
      }
      if (level === 'L3') {
        if (!params.target) return fail(-32602, 'INVALID_PARAMS: target is required');
        return ok({
          level,
          format: 'json',
          data: { target: params.target, source: REFERENCE_SOURCE, version: occToken(REFERENCE_SOURCE) },
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
        });
      }
      return fail(-32011, 'VALIDATION_FAILED: unknown level');
    }

    case 'oumv/getSource':
      if (String(params.path).includes('missing')) {
        return fail(-32009, 'RESOURCE_NOT_FOUND: no such file');
      }
      return ok({
        path: params.path,
        source: REFERENCE_SOURCE,
        version: occToken(REFERENCE_SOURCE),
        startLine: 1,
        endLine: 1,
      });

    case 'oumv/understand':
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
      });

    case 'oumv/verify':
      return ok({
        status: 'passed',
        target: String(params.target),
        diff: '',
        timings: { t_action_ms: 0.4, t_total_ms: 1.2 },
        durationMs: 1.2,
        scope: { checked: ['status'], notExecuted: [], notSupported: [] },
      });

    case 'oumv/applyEdit': {
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
