/**
 * Transports for the conformance runner and the `oumv-certify` CLI.
 *
 * Implemented without runtime dependencies so the CLI runs from a bare Node
 * install: HTTP via fetch, stdio via child_process NDJSON (spec §2.5), and a
 * minimal RFC 6455 client (spec §2.4) over `node:net`.
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { connect as netConnect, type Socket } from 'node:net';
import { randomBytes } from 'node:crypto';
import { URL } from 'node:url';
import type { JsonRpcRequest, JsonRpcResponse, PushEvent, PushEventSource, RpcTransport } from './fixtures.js';

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label}: timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

function authHeaders(token?: string): Record<string, string> {
  return token ? { 'X-OUMV-Session-Token': token } : {};
}

function transportError(message: string, code = -32008): JsonRpcResponse {
  return { jsonrpc: '2.0', id: null, error: { code, message } };
}

/** In-process transport: the runtime is a function (tests, embedded runtimes). */
export function memoryTransport(handler: (request: JsonRpcRequest) => JsonRpcResponse | Promise<JsonRpcResponse>): RpcTransport {
  return {
    name: 'memory',
    request: async (request) => handler(request),
  };
}

export interface HttpTransportOptions {
  url: string;
  token?: string;
  timeoutMs?: number;
  headers?: Record<string, string>;
}

/** HTTP binding (spec §2.2): one JSON-RPC object per POST, 200 even for RPC errors. */
export function httpTransport(options: HttpTransportOptions): RpcTransport {
  const timeoutMs = options.timeoutMs ?? 10_000;
  return {
    name: 'http',
    request: async (request) => {
      try {
        const response = await withTimeout(
          fetch(options.url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...authHeaders(options.token),
              ...(options.headers ?? {}),
            },
            body: JSON.stringify(request),
          }),
          timeoutMs,
          'http'
        );
        const text = await response.text();
        let payload: any = undefined;
        try {
          payload = text ? JSON.parse(text) : undefined;
        } catch {
          return transportError(`HTTP ${response.status} returned non-JSON body: ${text.slice(0, 200)}`);
        }
        if (!payload || typeof payload !== 'object') {
          return transportError(`HTTP ${response.status} returned no JSON-RPC response`);
        }
        if (payload.jsonrpc === undefined && payload.error === undefined) {
          payload = { jsonrpc: '2.0', id: request.id, ...payload };
        }
        return payload as JsonRpcResponse;
      } catch (err: any) {
        return transportError(err.message);
      }
    },
  };
}

export interface StdioTransportOptions {
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
}

/**
 * stdio binding (spec §2.5): newline-delimited JSON-RPC on stdin/stdout, one
 * object per line, diagnostics on stderr.
 */
export function stdioTransport(options: StdioTransportOptions): RpcTransport {
  const timeoutMs = options.timeoutMs ?? 30_000;
  let child: ChildProcessWithoutNullStreams | null = null;
  let buffer = '';
  const pending = new Map<string | number, (response: JsonRpcResponse) => void>();
  const stderr: string[] = [];

  const ensureChild = (): ChildProcessWithoutNullStreams => {
    if (child) return child;
    child = spawn(options.command, options.args ?? [], {
      cwd: options.cwd,
      env: { ...process.env, ...(options.env ?? {}) },
      stdio: ['pipe', 'pipe', 'pipe'],
    }) as ChildProcessWithoutNullStreams;

    child.stdout.setEncoding('utf-8');
    child.stdout.on('data', (chunk: string) => {
      buffer += chunk;
      let index = buffer.indexOf('\n');
      while (index >= 0) {
        const line = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);
        index = buffer.indexOf('\n');
        if (!line) continue;
        let message: any;
        try {
          message = JSON.parse(line);
        } catch {
          continue; // diagnostics must go to stderr; ignore stray stdout noise
        }
        if (message && message.id !== undefined && message.id !== null) {
          const resolve = pending.get(message.id);
          if (resolve) {
            pending.delete(message.id);
            resolve(message as JsonRpcResponse);
          }
        }
      }
    });
    child.stderr.setEncoding('utf-8');
    child.stderr.on('data', (chunk: string) => {
      stderr.push(chunk);
      if (stderr.length > 50) stderr.shift();
    });
    child.on('exit', (code) => {
      for (const [id, resolve] of pending) {
        pending.delete(id);
        resolve(transportError(`stdio process exited (code ${code}): ${stderr.join('').slice(-500)}`, -32603));
      }
      child = null;
    });
    return child;
  };

  return {
    name: 'stdio',
    request: async (request) => {
      const proc = ensureChild();
      return withTimeout(
        new Promise<JsonRpcResponse>((resolve) => {
          pending.set(request.id, resolve);
          proc.stdin.write(JSON.stringify(request) + '\n');
        }),
        timeoutMs,
        'stdio'
      ).catch((err: Error) => transportError(err.message, -32603));
    },
    close: () => {
      if (child) {
        child.stdin.end();
        child.kill();
        child = null;
      }
    },
  };
}

export interface WsTransportOptions {
  url: string;
  token?: string;
  timeoutMs?: number;
}

/** WS transport plus the server-push surface (spec §2.4 notifications). */
export type WsTransport = RpcTransport & PushEventSource;

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function maskFrame(payload: Buffer, opcode = 0x1): Buffer {  const mask = randomBytes(4);
  const masked = Buffer.from(payload.map((byte, i) => byte ^ mask[i % 4]));
  let header: Buffer;
  if (payload.length < 126) {
    header = Buffer.from([0x80 | opcode, 0x80 | payload.length]);
  } else if (payload.length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 0x80 | 126;
    header.writeUInt16BE(payload.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 0x80 | 127;
    header.writeBigUInt64BE(BigInt(payload.length), 2);
  }
  return Buffer.concat([header, mask, masked]);
}

interface DecodedFrame {
  opcode: number;
  payload: Buffer;
  size: number;
}

function decodeServerFrame(buffer: Buffer): DecodedFrame | null {
  if (buffer.length < 2) return null;
  const opcode = buffer[0] & 0x0f;
  const masked = (buffer[1] & 0x80) !== 0;
  let length = buffer[1] & 0x7f;
  let offset = 2;
  if (length === 126) {
    if (buffer.length < 4) return null;
    length = buffer.readUInt16BE(2);
    offset = 4;
  } else if (length === 127) {
    if (buffer.length < 10) return null;
    length = Number(buffer.readBigUInt64BE(2));
    offset = 10;
  }
  const maskOffset = offset;
  if (masked) offset += 4;
  if (buffer.length < offset + length) return null;
  let payload = buffer.subarray(offset, offset + length);
  if (masked) {
    const mask = buffer.subarray(maskOffset, maskOffset + 4);
    payload = Buffer.from(payload.map((byte, i) => byte ^ mask[i % 4]));
  }
  return { opcode, payload, size: offset + length };
}

/** WebSocket binding (spec §2.4): JSON-RPC text frames plus server notifications. */
export function wsTransport(options: WsTransportOptions): WsTransport {
  const timeoutMs = options.timeoutMs ?? 10_000;
  let socket: Socket | null = null;
  let buffer = Buffer.alloc(0);
  const pending = new Map<string | number, (response: JsonRpcResponse) => void>();
  const notifications: PushEvent[] = [];
  const watchers = new Set<() => void>();
  const notify = () => {
    for (const watcher of [...watchers]) watcher();
  };

  const connect = (): Promise<Socket> =>
    new Promise<Socket>((resolve, reject) => {
      const url = new URL(options.url);
      const key = randomBytes(16).toString('base64');
      const lines = [
        `GET ${url.pathname}${url.search} HTTP/1.1`,
        `Host: ${url.host}`,
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Key: ${key}`,
        'Sec-WebSocket-Version: 13',
      ];
      if (options.token) {
        lines.push(`X-OUMV-Session-Token: ${options.token}`, `Authorization: Bearer ${options.token}`);
      }
      const sock = netConnect({ host: url.hostname, port: Number(url.port || 80) });
      let handshake = '';
      const onData = (chunk: Buffer) => {
        handshake += chunk.toString('utf-8');
        const headerEnd = handshake.indexOf('\r\n\r\n');
        if (headerEnd < 0) return;
        sock.off('data', onData);
        if (!/^HTTP\/1\.1 101/.test(handshake)) {
          sock.destroy();
          reject(new Error(`WebSocket upgrade rejected: ${handshake.split('\r\n')[0]}`));
          return;
        }
        const rest = handshake.slice(headerEnd + 4);
        if (rest) buffer = Buffer.concat([buffer, Buffer.from(rest, 'utf-8')]);
        sock.on('data', (chunk: Buffer) => {
          buffer = Buffer.concat([buffer, chunk]);
          for (;;) {
            const frame = decodeServerFrame(buffer);
            if (!frame) break;
            buffer = buffer.subarray(frame.size);
            if (frame.opcode !== 0x1) continue;
            let message: any;
            try {
              message = JSON.parse(frame.payload.toString('utf-8'));
            } catch {
              continue;
            }
            if (message?.id !== undefined && message?.id !== null) {
              const resolvePending = pending.get(message.id);
              if (resolvePending) {
                pending.delete(message.id);
                resolvePending(message as JsonRpcResponse);
              }
            } else if (typeof message?.method === 'string') {
              // Server-initiated notification (spec §2.4): buffer it for push cases.
              notifications.push({
                event: message.method,
                id: '',
                data: (message.params ?? {}) as Record<string, unknown>,
              });
              notify();
            }
          }
        });
        sock.on('error', () => socket = null);
        resolve(sock);
      };
      sock.on('data', onData);
      sock.on('error', (err) => reject(err));
      sock.setTimeout(timeoutMs, () => reject(new Error('WebSocket connect timed out')));
      sock.write(lines.join('\r\n') + '\r\n\r\n');
      void WS_GUID;
    });

  return {
    name: 'ws',
    kind: 'ws' as const,
    lastEventId: () => '',
    waitFor: (event, match, waitMs) =>
      waitForPushEvent(notifications, watchers, event, match, waitMs, 'WS'),
    reconnect: async () => {
      throw new Error('WS has no replay cursor (spec §2.4 defines Last-Event-ID for SSE only)');
    },
    request: async (request) => {
      try {
        if (!socket) socket = await withTimeout(connect(), timeoutMs, 'ws-connect');
        const current = socket;
        return await withTimeout(
          new Promise<JsonRpcResponse>((resolve) => {
            pending.set(request.id, resolve);
            current.write(maskFrame(Buffer.from(JSON.stringify(request), 'utf-8')));
          }),
          timeoutMs,
          'ws'
        );
      } catch (err: any) {
        return transportError(err.message);
      }
    },
    close: () => {
      if (socket) {
        try {
          socket.write(maskFrame(Buffer.alloc(0), 0x8));
        } catch {}
        socket.destroy();
        socket = null;
      }
    },
  };
}

/** Waits for a buffered push event whose payload matches every expected key. */
function waitForPushEvent(
  buffer: PushEvent[],
  watchers: Set<() => void>,
  event: string,
  match: Record<string, unknown>,
  timeoutMs: number,
  label: string
): Promise<PushEvent> {
  return new Promise<PushEvent>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout>;
    const matches = (candidate: PushEvent) =>
      candidate.event === event &&
      Object.entries(match).every(
        ([key, value]) => JSON.stringify(candidate.data?.[key]) === JSON.stringify(value)
      );
    const onChange = () => {
      const found = buffer.find(matches);
      if (!found) return;
      clearTimeout(timer);
      watchers.delete(onChange);
      resolve(found);
    };
    timer = setTimeout(() => {
      watchers.delete(onChange);
      reject(new Error(`${label}: no "${event}" event within ${timeoutMs}ms`));
    }, timeoutMs);
    watchers.add(onChange);
    onChange();
  });
}

export interface SseEventSourceOptions {
  url: string;
  token?: string;
  timeoutMs?: number;
}

/**
 * SSE client for push cases (spec §2.3): parses `event:`/`id:`/`data:` frames,
 * keeps the last id as the `Last-Event-ID` cursor and can reconnect from it to
 * receive the replay.
 */
export function sseEventSource(options: SseEventSourceOptions): PushEventSource {
  const timeoutMs = options.timeoutMs ?? 10_000;
  let controller: AbortController | null = null;
  let events: PushEvent[] = [];
  let cursor = '';
  const watchers = new Set<() => void>();

  const open = async (lastEventId?: string): Promise<void> => {
    controller?.abort();
    controller = new AbortController();
    const headers: Record<string, string> = {
      Accept: 'text/event-stream',
      ...authHeaders(options.token),
    };
    if (lastEventId) headers['Last-Event-ID'] = lastEventId;
    const response = await withTimeout(
      fetch(options.url, { headers, signal: controller.signal }),
      timeoutMs,
      'sse'
    );
    if (!response.ok || !response.body) {
      throw new Error(`SSE ${options.url} answered HTTP ${response.status}`);
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    void (async () => {
      let buffer = '';
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let index = buffer.indexOf('\n\n');
          while (index >= 0) {
            const frame = buffer.slice(0, index);
            buffer = buffer.slice(index + 2);
            index = buffer.indexOf('\n\n');
            const parsed = parseSseFrame(frame);
            if (!parsed) continue;
            events.push(parsed);
            if (parsed.id) cursor = parsed.id;
            for (const watcher of [...watchers]) watcher();
          }
        }
      } catch {
        // Aborted on reconnect/close: the caller owns the lifecycle.
      }
    })();
  };

  return {
    kind: 'sse',
    start: () => open(),
    lastEventId: () => cursor,
    waitFor: (event, match, waitMs) =>
      waitForPushEvent(events, watchers, event, match, waitMs, 'SSE'),
    reconnect: async (lastEventId: string) => {
      events = [];
      await open(lastEventId);
    },
    close: () => {
      controller?.abort();
      controller = null;
    },
  };
}

function parseSseFrame(frame: string): PushEvent | null {
  let event = 'message';
  let id = '';
  let data = '';
  for (const line of frame.split('\n')) {
    if (line.startsWith('event: ')) event = line.slice(7).trim();
    else if (line.startsWith('id: ')) id = line.slice(4).trim();
    else if (line.startsWith('data: ')) data += line.slice(6);
  }
  if (!data) return null;
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(data) as Record<string, unknown>;
  } catch {
    payload = { data };
  }
  return { event, id, data: payload };
}
