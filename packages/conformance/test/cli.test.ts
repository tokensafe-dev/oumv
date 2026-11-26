import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import Ajv2020Module from 'ajv/dist/2020.js';
import { certify, HelpRequested, parseCertifyArgs } from '../src/cli/certify.js';
import { lintAdapterManifest } from '../src/cli/lint-adapter.js';
import { startHttpRuntime } from './helpers/reference-runtime.js';

const Ajv2020 = (Ajv2020Module as any).default ?? Ajv2020Module;
const FIXTURES = resolve(__dirname, '../../../fixtures/conformance-cases.json');
const SCHEMAS = resolve(__dirname, '../../../schemas');

describe('oumv-certify CLI', () => {
  it('requires exactly one transport and an adapter id', () => {
    expect(() => parseCertifyArgs(['--url', 'http://x/__oumv/rpc'])).toThrow(/--adapter/);
    expect(() => parseCertifyArgs(['--adapter', 'x'])).toThrow(/exactly one of/);
    expect(() =>
      parseCertifyArgs(['--adapter', 'x', '--url', 'http://x', '--ws', 'ws://x'])
    ).toThrow(/exactly one of/);
    expect(() => parseCertifyArgs(['--help'])).toThrow(HelpRequested);
  });

  it('accepts inline and @file marker payloads', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oumv-markers-'));
    try {
      const path = join(dir, 'markers.json');
      writeFileSync(path, JSON.stringify({ editTarget: 'src/target.py' }));
      const inline = parseCertifyArgs([
        '--adapter',
        'a',
        '--url',
        'http://x',
        '--markers',
        '{"l2Target":"app:main"}',
      ]);
      expect(inline.markers?.l2Target).toBe('app:main');

      const fromFile = parseCertifyArgs(['--adapter', 'a', '--url', 'http://x', '--markers', `@${path}`]);
      expect(fromFile.markers?.editTarget).toBe('src/target.py');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('derives the OCC version via getSource, runs the fixtures and writes a valid report', async () => {
    const runtime = await startHttpRuntime();
    const dir = mkdtempSync(join(tmpdir(), 'oumv-certify-'));
    try {
      const reportPath = join(dir, 'reports', 'reference.json');
      const code = await certify({
        adapter: 'reference',
        framework: 'node',
        profile: 'backend',
        url: runtime.url,
        fixtures: FIXTURES,
        report: reportPath,
        minLevel: 3,
        quiet: true,
      });

      expect(code).toBe(0);
      const report = JSON.parse(readFileSync(reportPath, 'utf-8'));
      expect(report.adapterName).toBe('reference');
      expect(report.attainedLevel).toBe(3);
      expect(report.failed).toBe(0);
      expect(report.environment.transport).toBe('http');
      expect(report.environment.profile).toBe('backend');

      const ajv = new Ajv2020({ allErrors: true, strict: false });
      const validate = ajv.compile(
        JSON.parse(readFileSync(join(SCHEMAS, 'conformance-report.json'), 'utf-8'))
      );
      expect(validate(report), JSON.stringify(validate.errors)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
      await runtime.close();
    }
  });

  it('fails with exit code 1 when the runtime cannot reach the required level', async () => {
    // A runtime that never records traces attains level 2, so a level-3 claim is refused.
    const runtime = await startHttpRuntime((request, response) => {
      const params = (request.params ?? {}) as Record<string, unknown>;
      if (request.method === 'oumv/observe' && params.level === 'L4') {
        return {
          jsonrpc: '2.0',
          id: request.id,
          result: { level: 'L4', data: { traces: [], traceCount: 0 } },
        };
      }
      return response;
    });
    const dir = mkdtempSync(join(tmpdir(), 'oumv-certify-min-'));
    try {
      const code = await certify({
        adapter: 'reference',
        url: runtime.url,
        fixtures: FIXTURES,
        report: join(dir, 'reference.json'),
        minLevel: 3,
        quiet: true,
      });
      expect(code).toBe(1);
      const report = JSON.parse(readFileSync(join(dir, 'reference.json'), 'utf-8'));
      expect(report.attainedLevel).toBe(2);
      expect(report.levels['3']).toBe('failed');
    } finally {
      rmSync(dir, { recursive: true, force: true });
      await runtime.close();
    }
  });
});

describe('oumv-lint-adapter', () => {
  const schema = JSON.parse(readFileSync(join(SCHEMAS, 'adapter.json'), 'utf-8'));

  it('accepts a manifest that satisfies the adapter contract', async () => {
    const result = await lintAdapterManifest(
      {
        identity: { id: 'backend/fastapi', name: 'FastAPI adapter', version: '0.3.0' },
        profiles: ['backend'],
        capabilities: [
          {
            name: 'observe.runtime_state',
            constraints: { developmentOnly: true, resourceTypes: ['route'] },
            conformanceLevel: 3,
          },
        ],
      },
      schema
    );
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects a manifest with a bad id and missing capabilities', async () => {
    const result = await lintAdapterManifest(
      { identity: { id: 'FastAPI', name: 'x', version: '1' }, profiles: [] },
      schema
    );
    expect(result.valid).toBe(false);
    expect(result.errors.join('\n')).toContain('identity/id');
    expect(result.errors.join('\n')).toContain('capabilities');
  });
});
