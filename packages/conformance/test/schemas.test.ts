import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
// ajv ships CJS; NodeNext resolution treats the default import as a namespace.
import Ajv2020Module from 'ajv/dist/2020.js';
import addFormatsModule from 'ajv-formats';

const Ajv2020 = (Ajv2020Module as any).default ?? Ajv2020Module;
const addFormats = (addFormatsModule as any).default ?? addFormatsModule;

/**
 * The schemas exist to be enforced, not to decorate the repo. This suite compiles
 * every schema, validates the language-neutral fixtures against their schema, and
 * pins the canonical wire shapes from SPEC §4 with positive and negative examples.
 */

const SCHEMAS_DIR = resolve(__dirname, '../../../schemas');
const FIXTURES = resolve(__dirname, '../../../fixtures/conformance-cases.json');

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);

const load = (name: string) => JSON.parse(readFileSync(resolve(SCHEMAS_DIR, name), 'utf-8'));
const validators = new Map<string, ReturnType<typeof ajv.compile>>();
const compile = (name: string) => {
  if (!validators.has(name)) validators.set(name, ajv.compile(load(name)));
  return validators.get(name)!;
};
const validate = (name: string, value: unknown) => {
  const fn = compile(name);
  return { ok: fn(value) as boolean, errors: fn.errors };
};

describe('OUMV JSON Schemas (2020-12)', () => {
  it('all schema files compile', () => {
    for (const file of readdirSync(SCHEMAS_DIR).filter((f) => f.endsWith('.json'))) {
      expect(() => compile(file), `${file} must compile`).not.toThrow();
    }
  });

  it('fixtures validate against fixtures.schema.json', () => {
    const fixtures = JSON.parse(readFileSync(FIXTURES, 'utf-8'));
    const { ok, errors } = validate('fixtures.schema.json', fixtures);
    expect(errors ?? []).toEqual([]);
    expect(ok).toBe(true);
  });

  it('handshake response requires profile and sessionId (spec §3.1/§4.5)', () => {
    const response = {
      protocolVersion: '1.1.0',
      profile: 'backend',
      sessionId: 'sess-1',
      runtimeInfo: { name: 'go-gin', version: '0.4.3' },
      capabilities: {
        observe: { levels: ['L0', 'L1', 'L2'], formats: ['json'] },
        mutate: { occ: true },
      },
    };
    expect(validate('oumv-handshake.json', response).ok).toBe(true);

    const { sessionId, ...withoutSession } = response;
    expect(validate('oumv-handshake.json', withoutSession).ok).toBe(false);

    expect(validate('oumv-handshake.json', { ...response, profile: 'server' }).ok).toBe(false);
  });

  it('observe L3 requires source and a real sha256 token', () => {
    const good = {
      level: 'L3',
      format: 'json',
      data: {
        path: 'src/orders.go',
        source: 'package orders\n',
        version: 'sha256:' + 'a'.repeat(64),
        startLine: 1,
        endLine: 1,
      },
    };
    expect(validate('oumv-observe.json', good).ok).toBe(true);

    const badVersion = { ...good, data: { ...good.data, version: 'sha256:xyz' } };
    expect(validate('oumv-observe.json', badVersion).ok).toBe(false);

    const noSource = { ...good, data: { path: 'a.go', version: good.data.version } };
    expect(validate('oumv-observe.json', noSource).ok).toBe(false);
  });

  it('applyEdit without expectedVersion is invalid (mandatory OCC)', () => {
    const withVersion = {
      path: 'src/orders.go',
      replacement: 'package orders\n',
      expectedVersion: 'sha256:' + 'b'.repeat(64),
    };
    expect(validate('oumv-mutate.json', withVersion).ok).toBe(true);

    const { expectedVersion, ...without } = withVersion;
    expect(validate('oumv-mutate.json', without).ok).toBe(false);

    expect(
      validate('oumv-mutate.json', {
        status: 'APPLIED',
        path: 'src/orders.go',
        newVersion: 'sha256:' + 'c'.repeat(64),
      }).ok
    ).toBe(true);
  });

  it('verify result requires status, timings and scope', () => {
    const good = {
      status: 'passed',
      diff: {},
      timings: { t_action_ms: 0.1, t_schema_ms: 0, t_propagation_ms: 0.1, t_dom_ms: 0, t_total_ms: 0.2 },
      durationMs: 0.2,
      scope: { checked: ['dispatch'], notExecuted: [], notSupported: [] },
    };
    expect(validate('oumv-verify.json', good).ok).toBe(true);

    const { scope, ...withoutScope } = good;
    expect(validate('oumv-verify.json', withoutScope).ok).toBe(false);

    expect(validate('oumv-verify.json', { ...good, status: 'PASS' }).ok).toBe(false);
  });

  it('impact and causality responses carry evidence and observed', () => {
    const impact = {
      query: 'impact',
      target: 'GET /api/orders',
      impact: {
        target: 'GET /api/orders',
        affectedSymbols: ['handler.CreateOrder'],
        breakingRisk: 'LOW',
        observed: false,
        evidence: { provenance: 'static', sourceAdapter: 'go-gin', confidence: 'probable' },
      },
    };
    expect(validate('oumv-understand.json', impact).ok).toBe(true);

    const causality = {
      query: 'causality',
      target: 'GET /api/orders',
      causality: { target: 'GET /api/orders', observed: true, traceCount: 1, evidence: { provenance: 'runtime', sourceAdapter: 'go-gin', confidence: 'confirmed' } },
    };
    expect(validate('oumv-understand.json', causality).ok).toBe(true);

    const fabricated = { ...causality, causality: { target: 'GET /api/orders' } };
    expect(validate('oumv-understand.json', fabricated).ok).toBe(false);
  });

  it('resource references and discovery descriptors validate', () => {
    expect(validate('resources.schema.json', {
      id: 'backend.endpoint:GET:/api/orders',
      type: 'backend.endpoint',
      name: 'GET /api/orders',
      availableOperations: ['observe', 'getSource', 'applyEdit', 'verify'],
      evidence: { provenance: 'runtime', sourceAdapter: 'go-gin', confidence: 'confirmed' },
    }).ok).toBe(true);

    expect(validate('resources.schema.json', { id: 'x', type: 'frontend.widget', name: 'x' }).ok).toBe(false);

    expect(validate('descriptor.schema.json', {
      type: 'frontend',
      name: 'tokensafe-ui',
      version: '0.1.22',
      url: 'http://127.0.0.1:5173/__oumv/rpc',
      capabilities: { observeLevels: ['L0', 'L1', 'L2', 'L3', 'L4'], transports: ['http'] },
    }).ok).toBe(true);

    expect(validate('descriptor.schema.json', {
      type: 'frontend', name: 'x', version: '1', url: '/relative', capabilities: { observeLevels: [] },
    }).ok).toBe(false);
  });
});
