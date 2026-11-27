import { describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createHash } from 'node:crypto';
import {
  defaultMarkers,
  runFixtureSuite,
  type FixtureSpec,
  type PushCase,
} from '../src/fixtures.js';
import { httpTransport, memoryTransport, sseEventSource } from '../src/transports.js';

const PUSH_FILE = 'probe.ts';
const PUSH_CONTENT = 'export const pushed = 3;\n';

const occ = (content: string) => 'sha256:' + createHash('sha256').update(content).digest('hex');

/**
 * Fake runtime for the push contract: JSON-RPC over POST plus an SSE log with
 * monotonic ids and `Last-Event-ID` replay — exactly what the push cases assert.
 */
function startRuntime() {
  const events: Array<{ id: number; event: string; data: string }> = [];
  const clients = new Set<import('node:http').ServerResponse>();
  let seq = 0;

  const server = createServer((req, res) => {
    if (req.method === 'GET' && (req.url ?? '').startsWith('/__oumv/events')) {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
      res.write(': connected\n\n');
      const rawCursor = String(req.headers['last-event-id'] ?? '').trim();
      const cursor = rawCursor ? Number(rawCursor) : 0;
      for (const event of events.filter((candidate) => candidate.id > cursor)) {
        res.write(`id: ${event.id}\nevent: ${event.event}\ndata: ${event.data}\n\n`);
      }
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }

    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      const request = JSON.parse(body);
      const respond = (payload: unknown) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(payload));
      };
      if (request.method === 'oumv/getSource') {
        // Nothing left over from a previous run.
        respond({ jsonrpc: '2.0', id: request.id, error: { code: -32009, message: 'RESOURCE_NOT_FOUND' } });
        return;
      }
      if (request.method === 'oumv/applyEdit') {
        const path = String(request.params?.path ?? '');
        const newVersion = occ(String(request.params?.replacement ?? ''));
        respond({ jsonrpc: '2.0', id: request.id, result: { status: 'APPLIED', path, newVersion } });
        seq += 1;
        const data = JSON.stringify({
          path,
          operation: String(request.params?.mode ?? 'replace'),
          version: newVersion,
        });
        events.push({ id: seq, event: 'state', data });
        for (const client of clients) {
          client.write(`id: ${seq}\nevent: state\ndata: ${data}\n\n`);
        }
        return;
      }
      respond({ jsonrpc: '2.0', id: request.id, error: { code: -32601, message: 'METHOD_NOT_FOUND' } });
    });
  });

  return { server, events };
}

const pushCase = (overrides: Partial<PushCase> = {}): PushCase => ({
  id: 'sse-state-after-edit',
  level: 2,
  transport: 'sse',
  trigger: {
    method: 'oumv/applyEdit',
    params: { path: '${PUSH_FILE}', mode: 'create', replacement: '${PUSH_CONTENT}' },
  },
  expectEvents: [{ event: 'state', data: { path: '${PUSH_FILE}', operation: 'create' } }],
  replay: { expectEvents: [{ event: 'state', data: { path: '${PUSH_FILE}' } }] },
  ...overrides,
});

async function withRuntime(
  run: (ctx: {
    transport: ReturnType<typeof httpTransport>;
    source: ReturnType<typeof sseEventSource>;
    baseUrl: string;
  }) => Promise<void>
): Promise<void> {
  const { server } = startRuntime();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  const baseUrl = `http://127.0.0.1:${port}`;
  const transport = httpTransport({ url: `${baseUrl}/__oumv/rpc` });
  const source = sseEventSource({ url: `${baseUrl}/__oumv/events` });
  try {
    await source.start?.();
    await run({ transport, source, baseUrl });
  } finally {
    await source.close();
    await transport.close?.();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

describe('push cases (spec §2.3/§2.4)', () => {
  it('passes when the mutation is pushed and Last-Event-ID replays it', async () => {
    await withRuntime(async ({ transport, source }) => {
      const spec: FixtureSpec = {
        protocolVersion: '1.3.0',
        fixtureVersion: 8,
        cases: [],
        pushCases: [
          pushCase(),
          // A WS case must not run in an SSE certificate.
          pushCase({
            id: 'ws-state-notification',
            transport: 'ws',
            replay: undefined,
            expectEvents: [{ event: 'notifications/oumv.state', data: { path: '${PUSH_FILE}' } }],
          }),
        ],
      };
      const report = await runFixtureSuite(
        transport,
        spec,
        defaultMarkers({ pushFile: PUSH_FILE, pushContent: PUSH_CONTENT }),
        { adapterName: 'fake-sse', push: source, pushTimeoutMs: 1000 }
      );

      expect(report.cases.map((result) => [result.id, result.status])).toEqual([
        ['sse-state-after-edit', 'passed'],
      ]);
      expect(report.total).toBe(1);
      expect(report.failed).toBe(0);
    });
  });

  it('fails with the reason when the pushed payload does not match', async () => {
    await withRuntime(async ({ transport, source }) => {
      const spec: FixtureSpec = {
        protocolVersion: '1.3.0',
        fixtureVersion: 8,
        cases: [],
        pushCases: [pushCase({ expectEvents: [{ event: 'state', data: { path: 'other.ts' } }] })],
      };
      const report = await runFixtureSuite(
        transport,
        spec,
        defaultMarkers({ pushFile: PUSH_FILE, pushContent: PUSH_CONTENT }),
        { adapterName: 'fake-sse', push: source, pushTimeoutMs: 200 }
      );

      expect(report.failed).toBe(1);
      expect(report.cases[0].status).toBe('failed');
      expect(report.cases[0].error).toMatch(/no "state" event within 200ms/);
    });
  });

  it('deletes a leftover probe file before creating it again', async () => {
    await withRuntime(async ({ transport, source }) => {
      const calls: Array<{ method: string; mode?: string }> = [];
      // A transport that reports the probe file as existing: the runner must issue
      // mode=delete with that version before the create trigger, so a second run
      // against the same workspace does not fail with CONFLICT_DETECTED.
      const recording = {
        name: 'http',
        request: async (request: any) => {
          calls.push({ method: request.method, mode: request.params?.mode });
          if (request.method === 'oumv/getSource') {
            return {
              jsonrpc: '2.0',
              id: request.id,
              result: { path: PUSH_FILE, version: occ('old') },
            };
          }
          return transport.request(request);
        },
      };
      const spec: FixtureSpec = {
        protocolVersion: '1.3.0',
        fixtureVersion: 8,
        cases: [],
        pushCases: [pushCase({ replay: undefined })],
      };
      const report = await runFixtureSuite(
        recording,
        spec,
        defaultMarkers({ pushFile: PUSH_FILE, pushContent: PUSH_CONTENT }),
        { adapterName: 'fake-sse', push: source, pushTimeoutMs: 1000 }
      );

      expect(report.failed).toBe(0);
      expect(calls.slice(0, 2)).toEqual([
        { method: 'oumv/getSource', mode: undefined },
        { method: 'oumv/applyEdit', mode: 'delete' },
      ]);
      expect(calls).toContainEqual({ method: 'oumv/applyEdit', mode: 'create' });
    });
  });

  it('runs capability cases only for an advertised claim', async () => {
    let calls = 0;
    const transport = memoryTransport(async (request) => {
      calls += 1;
      return {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          status: 'passed',
          diff: {},
          timings: { t_action_ms: 0, t_schema_ms: 0, t_propagation_ms: 0, t_dom_ms: 0, t_total_ms: 0 },
          durationMs: 0,
          scope: { checked: [], notExecuted: [], notSupported: [] },
          rolledBack: true,
          rollbackStatus: 'verified',
          dbDiff: { rollback: true, queries: 2 },
        },
      };
    });
    const spec: FixtureSpec = {
      protocolVersion: '1.4.0',
      fixtureVersion: 9,
      cases: [],
      capabilityCases: [
        {
          id: 'verify-sandbox-rolls-back',
          level: 2,
          requiresCapability: 'verify.sandboxRollback',
          method: 'oumv/verify',
          params: { target: 'probe' },
          expectResultFields: ['rolledBack', 'rollbackStatus', 'dbDiff.rollback'],
          expectValues: { rollbackStatus: 'verified', 'dbDiff.rollback': true },
        },
      ],
    };

    const off = await runFixtureSuite(transport, spec, defaultMarkers(), {
      adapterName: 'x',
      capabilities: { verify: { multiMetric: true, surfaceDiff: false, sandboxRollback: false } },
    });
    expect(off.total).toBe(0);
    expect(calls).toBe(0);

    const on = await runFixtureSuite(transport, spec, defaultMarkers(), {
      adapterName: 'x',
      capabilities: { verify: { multiMetric: true, surfaceDiff: false, sandboxRollback: true } },
    });
    expect(on.total).toBe(1);
    expect(on.passed).toBe(1);
    expect(calls).toBe(1);
  });
});
