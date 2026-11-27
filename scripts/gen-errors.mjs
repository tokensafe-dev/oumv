#!/usr/bin/env node
/**
 * Generates packages/protocol/src/errors.ts from the canonical registry
 * schemas/errors.json. The registry is the single source of truth; this file
 * and the rendered tables in spec/SPEC.md §5.1 / README.md must stay in sync
 * (enforced by packages/conformance/test/errors.test.ts).
 *
 * Usage: node scripts/gen-errors.mjs [--check]
 *   --check  exits 1 (no write) when the generated file is stale.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const registryPath = join(root, 'schemas', 'errors.json');
const targetPath = join(root, 'packages', 'protocol', 'src', 'errors.ts');

const registry = JSON.parse(readFileSync(registryPath, 'utf8'));
const codes = [...registry.codes].sort((a, b) => a.code - b.code);

const header = `/**
 * GENERATED FILE — DO NOT EDIT BY HAND.
 * Source of truth: schemas/errors.json (registryVersion ${registry.registryVersion}).
 * Regenerate with: node scripts/gen-errors.mjs
 * Validated against spec/SPEC.md §5.1 by packages/conformance/test/errors.test.ts.
 */

`;

const enumBody = codes
  .map((c) => `  ${c.name} = ${c.code},`)
  .join('\n');

const mapEntries = codes
  .map((c) => `  [OumvErrorCode.${c.name}]: '${c.name}',`)
  .join('\n');

const reasonsEntries = codes
  .filter((c) => (c.reasons ?? []).length > 0)
  .map((c) => `  [OumvErrorCode.${c.name}]: ${JSON.stringify(c.reasons)},`)
  .join('\n');

const generated = `${header}export enum OumvErrorCode {
${enumBody}
}

/** Canonical code -> name mapping (mirrors the registry). */
export const ERROR_CODE_NAMES: Readonly<Record<number, string>> = {
${mapEntries}
};

/** Known \`data.reason\` values per code (informative; runtimes MAY add more). */
export const ERROR_CODE_REASONS: Readonly<Record<number, readonly string[]>> = {
${reasonsEntries}
};

export class OumvError extends Error {
  public readonly code: OumvErrorCode;
  public readonly data?: any;

  constructor(code: OumvErrorCode, message: string, data?: any) {
    super(message);
    this.name = 'OumvError';
    this.code = code;
    this.data = data;
    Object.setPrototypeOf(this, OumvError.prototype);
  }
}
`;

if (process.argv.includes('--check')) {
  const current = readFileSync(targetPath, 'utf8');
  if (current !== generated) {
    console.error('errors.ts is stale: run `node scripts/gen-errors.mjs`');
    process.exit(1);
  }
  console.log('errors.ts is up to date.');
} else {
  writeFileSync(targetPath, generated);
  console.log(`Wrote ${targetPath} (${codes.length} codes, registryVersion ${registry.registryVersion}).`);
}
