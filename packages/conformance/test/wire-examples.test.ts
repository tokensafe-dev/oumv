import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import Ajv2020Module from 'ajv/dist/2020.js';

const Ajv2020 = (Ajv2020Module as any).default ?? Ajv2020Module;

/**
 * Golden wire examples (`examples/wire/<profile>/<method>.json`) are captured from
 * real runtimes and frozen. They are what a third party actually reads, so they
 * must pass the same schema the runtime is held to — otherwise the examples drift
 * away from the contract and become decorative.
 *
 * Regenerate:
 *   cd tokensafe-backend/go && OUMV_EXAMPLES_DIR=<oumv>/examples/wire/backend \
 *     go test ./pkg/adapters -run TestWireExamples
 *   cd agent-dom && node packages/vite/scripts/capture-wire-examples.mjs \
 *     --root packages/benchmark/sandboxes/react-task-manager \
 *     --out ../agent-oumv/examples/wire/frontend
 */

const EXAMPLES = resolve(__dirname, '../../../examples/wire');
const SCHEMAS = resolve(__dirname, '../../../schemas');

const METHOD_SCHEMAS: Record<string, { file: string; request: string; response: string }> = {
  'oumv/handshake': { file: 'oumv-handshake.json', request: 'Request', response: 'Response' },
  'oumv/observe': { file: 'oumv-observe.json', request: 'Request', response: 'Response' },
  'oumv/understand': { file: 'oumv-understand.json', request: 'Request', response: 'Response' },
  'oumv/getSource': { file: 'oumv-mutate.json', request: 'GetSourceRequest', response: 'GetSourceResponse' },
  'oumv/applyEdit': { file: 'oumv-mutate.json', request: 'ApplyEditRequest', response: 'ApplyEditResponse' },
  'oumv/verify': { file: 'oumv-verify.json', request: 'Request', response: 'Response' },
};

const loadSchema = (file: string) => JSON.parse(readFileSync(join(SCHEMAS, file), 'utf-8'));

function compileDef(schema: any, defName: string) {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  return ajv.compile({ $defs: schema.$defs, $ref: `#/$defs/${defName}` });
}

const envelope = loadSchema('oumv-envelope.json');
const envelopeAjv = new Ajv2020({ allErrors: true, strict: false });
const validateErrorEnvelope = envelopeAjv.compile({
  type: 'object',
  required: ['jsonrpc', 'id', 'error'],
  properties: {
    jsonrpc: { const: '2.0' },
    id: { type: ['string', 'number', 'null'] },
    error: {
      type: 'object',
      required: ['code', 'message'],
      properties: { code: { type: 'integer' }, message: { type: 'string' }, data: { type: 'object' } },
    },
  },
  additionalProperties: false,
});
void envelope;

interface WireCase {
  name: string;
  request: { jsonrpc: string; id: string | number; method: string; params?: unknown };
  response: { jsonrpc: string; id: string | number; result?: unknown; error?: { code: number; message: string } };
}

function exampleFiles(): Array<{ profile: string; name: string; path: string }> {
  const out: Array<{ profile: string; name: string; path: string }> = [];
  for (const profile of readdirSync(EXAMPLES)) {
    const dir = join(EXAMPLES, profile);
    for (const name of readdirSync(dir).filter((file) => file.endsWith('.json'))) {
      out.push({ profile, name, path: join(dir, name) });
    }
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

describe('golden wire examples', () => {
  const files = exampleFiles();

  it('exist for both profiles and cover every method', () => {
    const profiles = new Set(files.map((file) => file.profile));
    expect(profiles).toEqual(new Set(['backend', 'frontend']));
    const covered = new Set(
      files.map((file) => JSON.parse(readFileSync(file.path, 'utf-8')).method as string)
    );
    expect(covered).toEqual(new Set(Object.keys(METHOD_SCHEMAS)));
  });

  it.each(exampleFiles().map((file) => [file.path, file] as const))(
    '%s matches the schema it claims',
    (_path, file) => {
      const data = JSON.parse(readFileSync(file.path, 'utf-8'));
      expect(data.profile).toBe(file.profile);
      expect(data.specVersion).toBe('1.1.0');
      expect(data.adapter).toBeTruthy();

      const mapping = METHOD_SCHEMAS[data.method];
      expect(mapping, `unknown method ${data.method}`).toBeTruthy();
      const schema = loadSchema(mapping.file);
      const validateRequest = compileDef(schema, mapping.request);
      const validateResponse = compileDef(schema, mapping.response);

      expect(data.cases.length).toBeGreaterThan(0);
      for (const entry of data.cases as WireCase[]) {
        expect(entry.request.method).toBe(data.method);
        const requestOk = validateRequest(entry.request.params ?? {});
        expect(requestOk, `${entry.name} request: ${JSON.stringify(validateRequest.errors)}`).toBe(true);

        if (entry.response.error) {
          expect(validateErrorEnvelope(entry.response), entry.name).toBe(true);
          expect(entry.response.error.code).toBeLessThan(0);
          continue;
        }
        const responseOk = validateResponse(entry.response.result);
        expect(responseOk, `${entry.name} response: ${JSON.stringify(validateResponse.errors)}`).toBe(true);
      }
    }
  );

  it('captures the honest offline frontend shapes', () => {
    const verify = JSON.parse(readFileSync(join(EXAMPLES, 'frontend', 'verify.json'), 'utf-8'));
    expect(verify.cases[0].response.error.code).toBe(-32008);

    const handshake = JSON.parse(readFileSync(join(EXAMPLES, 'frontend', 'handshake.json'), 'utf-8'));
    expect(handshake.cases[0].response.result.capabilities.observe.levels).toHaveLength(5);
    expect(handshake.cases[1].response.result.capabilities.observe.levels).toEqual(['L0', 'L1']);
  });
});
