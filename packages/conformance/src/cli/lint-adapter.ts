#!/usr/bin/env node
/**
 * `oumv-lint-adapter` — validates an adapter manifest against
 * `schemas/adapter.json` (spec §8). The schema exists to be enforced: an adapter
 * that cannot describe its identity, profiles and capability constraints is not
 * installable.
 *
 *   oumv-lint-adapter adapter.json [--schema schemas/adapter.json]
 */
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface LintResult {
  valid: boolean;
  errors: string[];
}

export class HelpRequested extends Error {}

/** Validates a parsed manifest against the adapter schema using ajv (2020-12). */
export async function lintAdapterManifest(manifest: unknown, schema: unknown): Promise<LintResult> {
  const [ajvModule] = await Promise.all([import('ajv/dist/2020.js')]);
  const Ajv2020 = (ajvModule as any).default?.default ?? (ajvModule as any).default ?? ajvModule;
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const validate = ajv.compile(schema as object);
  if (validate(manifest)) return { valid: true, errors: [] };
  const errors = (validate.errors ?? []).map((error: any) => `${error.instancePath || '/'}: ${error.message}`);
  return { valid: false, errors };
}

function resolveSchemaPath(explicit?: string): string {
  if (explicit) {
    const path = resolve(explicit);
    if (!existsSync(path)) throw new Error(`schema not found: ${path}`);
    return path;
  }
  let dir = process.cwd();
  for (let depth = 0; depth < 6; depth++) {
    const candidate = join(dir, 'schemas', 'adapter.json');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error('schemas/adapter.json not found; pass --schema <path>');
}

const HELP = `oumv-lint-adapter — validate an OUMV adapter manifest (spec §8)

Usage:
  oumv-lint-adapter <manifest.json> [--schema <adapter.schema.json>]

Exit code 0 when the manifest conforms to the adapter contract.`;

export async function main(argv: string[]): Promise<number> {
  let manifestPath = '';
  let schemaPath: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      console.log(HELP);
      return 0;
    }
    if (arg === '--schema') {
      schemaPath = argv[++i];
      if (!schemaPath) throw new Error('missing value for --schema');
      continue;
    }
    if (arg.startsWith('--')) throw new Error(`unknown argument ${arg}`);
    manifestPath = arg;
  }
  if (!manifestPath) throw new Error('manifest path is required');

  const manifest = JSON.parse(readFileSync(resolve(manifestPath), 'utf-8'));
  const schema = JSON.parse(readFileSync(resolveSchemaPath(schemaPath), 'utf-8'));
  const result = await lintAdapterManifest(manifest, schema);
  if (result.valid) {
    console.log(`✓ ${manifestPath} conforms to the OUMV adapter contract`);
    return 0;
  }
  console.error(`✗ ${manifestPath} violates schemas/adapter.json:`);
  for (const error of result.errors) console.error(`  - ${error}`);
  return 1;
}

/** True when this module is the executed entry point (also through a bin symlink). */
function isMain(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMain()) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (err) => {
      console.error(`✗ ${err.message}`);
      process.exitCode = 2;
    }
  );
}
