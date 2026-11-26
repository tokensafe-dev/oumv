import { describe, expect, it } from 'vitest';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import Ajv2020Module from 'ajv/dist/2020.js';
import {
  defaultMarkers,
  loadFixtures,
  runFixtureSuite,
  type JsonRpcRequest,
  type JsonRpcResponse,
} from '../src/fixtures.js';
import { httpTransport, memoryTransport, stdioTransport, wsTransport } from '../src/transports.js';
import {
  REFERENCE_SOURCE,
  occToken,
  referenceRuntime,
  startHttpRuntime,
  startWsRuntime,
} from './helpers/reference-runtime.js';

const Ajv2020 = (Ajv2020Module as any).default ?? Ajv2020Module;

const FIXTURES = resolve(__dirname, '../../../fixtures/conformance-cases.json');
const REPORT_SCHEMA = JSON.parse(
  readFileSync(resolve(__dirname, '../../../schemas/conformance-report.json'), 'utf-8')
);

const ajv = new Ajv2020({ allErrors: true, strict: false });
const validateReport = ajv.compile(REPORT_SCHEMA);

// The OCC version of the edit target, as `oumv-certify` derives it via getSource.
const markers = defaultMarkers({ editVersion: occToken(REFERENCE_SOURCE) });

function reportErrors(): string[] {
  return (validateReport.errors ?? []).map((error: any) => `${error.instancePath}: ${error.message}`);
}

describe('fixture-driven conformance runner', () => {
  it('certifies a compliant runtime at level 3 and emits a schema-valid report', async () => {
    const spec = loadFixtures(FIXTURES);
    const transport = memoryTransport((request) => referenceRuntime(request));

    const report = await runFixtureSuite(transport, spec, markers, { adapterName: 'reference' });

    expect(report.total).toBe(spec.cases.length);
    expect(report.failed).toBe(0);
    expect(report.attainedLevel).toBe(3);
    expect(report.levels).toEqual({ 1: 'passed', 2: 'passed', 3: 'passed' });
    expect(report.fixtureVersion).toBe(3);
    expect(report.specVersion).toBe(spec.protocolVersion);
    expect(validateReport(report), reportErrors().join('; ')).toBe(true);
  });

  it('caps the attained level when a level-2 case fails and still reports honestly', async () => {
    const spec = loadFixtures(FIXTURES);
    const transport = memoryTransport((request) => {
      if (request.method === 'oumv/observe' && (request.params as any)?.level === 'L2') {
        return {
          jsonrpc: '2.0',
          id: request.id,
          error: { code: -32006, message: 'UNSUPPORTED: no contract discovery' },
        } as JsonRpcResponse;
      }
      return referenceRuntime(request);
    });

    const report = await runFixtureSuite(transport, spec, markers, { adapterName: 'broken' });

    expect(report.attainedLevel).toBe(1);
    expect(report.levels['2']).toBe('failed');
    const failedCase = report.cases.find((c) => c.id === 'observe-l2-returns-targeted-contract');
    expect(failedCase?.status).toBe('failed');
    expect(failedCase?.error).toContain('expected success, got error -32006');
    expect(validateReport(report), reportErrors().join('; ')).toBe(true);
  });

  it('executes the fixtures over HTTP', async () => {
    const runtime = await startHttpRuntime();
    try {
      const spec = loadFixtures(FIXTURES);
      const report = await runFixtureSuite(httpTransport({ url: runtime.url }), spec, markers, {
        adapterName: 'reference-http',
        environment: { transport: 'http' },
      });
      expect(report.passed).toBe(report.total);
      expect(report.attainedLevel).toBe(3);
      expect(validateReport(report), reportErrors().join('; ')).toBe(true);
    } finally {
      await runtime.close();
    }
  });

  it('executes the fixtures over WebSocket', async () => {
    const runtime = await startWsRuntime();
    const transport = wsTransport({ url: runtime.url });
    try {
      const spec = loadFixtures(FIXTURES);
      const report = await runFixtureSuite(transport, spec, markers, {
        adapterName: 'reference-ws',
        environment: { transport: 'ws' },
      });
      expect(report.passed).toBe(report.total);
      expect(report.attainedLevel).toBe(3);
    } finally {
      await transport.close?.();
      await runtime.close();
    }
  });

  it('speaks newline-delimited JSON-RPC over stdio', async () => {
    const script = `
      const readline = require('node:readline');
      const rl = readline.createInterface({ input: process.stdin });
      rl.on('line', (line) => {
        const req = JSON.parse(line);
        let response;
        if (req.method === 'oumv/handshake') {
          response = { jsonrpc: '2.0', id: req.id, result: {
            protocolVersion: '1.1.0', profile: 'backend', sessionId: 'sess-stdio',
            runtimeInfo: { name: 'stdio', version: '0.0.1' }, capabilities: {} } };
        } else {
          response = { jsonrpc: '2.0', id: req.id, error: { code: -32601, message: 'METHOD_NOT_FOUND' } };
        }
        process.stdout.write(JSON.stringify(response) + '\\n');
      });
    `;
    const transport = stdioTransport({ command: process.execPath, args: ['-e', script] });
    try {
      const handshake = await transport.request({ jsonrpc: '2.0', id: 1, method: 'oumv/handshake', params: {} });
      expect((handshake.result as Record<string, unknown> | undefined)?.sessionId).toBe('sess-stdio');

      const unknown = await transport.request({ jsonrpc: '2.0', id: 2, method: 'oumv/nope', params: {} });
      expect(unknown.error?.code).toBe(-32601);
    } finally {
      transport.close?.();
    }
  });

  it('runs a subset spec with preconditions over HTTP', async () => {
    const runtime = await startHttpRuntime();
    const dir = mkdtempSync(join(tmpdir(), 'oumv-fixtures-'));
    try {
      const path = join(dir, 'subset.json');
      const { writeFileSync } = await import('node:fs');
      writeFileSync(
        path,
        JSON.stringify({
          protocolVersion: '1.1.0',
          fixtureVersion: 3,
          cases: [
            { id: 'handshake', level: 1, method: 'oumv/handshake', params: {}, expectResultFields: ['sessionId'] },
            {
              id: 'l4-needs-execution',
              level: 3,
              method: 'oumv/observe',
              params: { level: 'L4' },
              preconditions: ['verify'],
              expectArrayField: 'data.traces',
            },
          ],
        })
      );
      const spec = loadFixtures(path);
      const report = await runFixtureSuite(httpTransport({ url: runtime.url }), spec, markers, {
        adapterName: 'subset',
      });
      expect(report.total).toBe(2);
      expect(report.passed).toBe(2);
      // A level-3-only case does not certify level 3 without level 2 coverage.
      expect(report.attainedLevel).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
      await runtime.close();
    }
  });

  it('reports a transport failure instead of throwing', async () => {
    const spec = loadFixtures(FIXTURES);
    const transport = memoryTransport((request) => ({
      jsonrpc: '2.0',
      id: request.id,
      error: { code: -32008, message: 'RUNTIME_UNAVAILABLE: offline' },
    }));
    const report = await runFixtureSuite(transport, spec, markers, { adapterName: 'offline' });
    expect(report.attainedLevel).toBe(0);
    expect(report.failed).toBe(report.total);
  });
});

describe('stdio transport diagnostics', () => {
  it('surfaces a process that exits without answering', async () => {
    const transport = stdioTransport({
      command: process.execPath,
      args: ['-e', "process.exit(3)"],
      timeoutMs: 2000,
    });
    try {
      const response = await transport.request({ jsonrpc: '2.0', id: 1, method: 'oumv/handshake', params: {} });
      expect(response.error?.code).toBe(-32603);
    } finally {
      transport.close?.();
    }
  }, 10_000);

  it('ignores stray stdout noise but never stderr', async () => {
    const script = `
      process.stdout.write('starting up...\\n');
      process.stdin.on('data', (chunk) => {
        for (const line of chunk.toString().split('\\n')) {
          if (!line.trim()) continue;
          const req = JSON.parse(line);
          process.stdout.write('debug: got ' + req.method + '\\n');
          process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: req.id, result: { ok: true } }) + '\\n');
        }
      });
    `;
    const transport = stdioTransport({ command: process.execPath, args: ['-e', script] });
    try {
      const response = await transport.request({ jsonrpc: '2.0', id: 'noise', method: 'oumv/observe', params: {} } as JsonRpcRequest);
      expect((response.result as any).ok).toBe(true);
    } finally {
      transport.close?.();
    }
  }, 10_000);
});
