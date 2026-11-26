#!/usr/bin/env node
/**
 * `oumv-certify` — runs the language-neutral OUMV fixtures against a live
 * runtime over HTTP, WebSocket or stdio and writes a certification report that
 * conforms to `schemas/conformance-report.json` (spec §10.3).
 *
 *   oumv-certify --url http://127.0.0.1:8080/__oumv/rpc --adapter go-gin \
 *                --framework gin --token <token> --markers @markers.json
 *   oumv-certify --stdio "python -m app.oumv_stdio" --adapter python-fastapi
 *   oumv-certify --ws ws://127.0.0.1:5173/__oumv/rpc --adapter tokensafe-ui-react
 */
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  defaultMarkers,
  loadFixtures,
  runFixtureSuite,
  type CaseMarkers,
  type RpcTransport,
} from '../fixtures.js';
import { httpTransport, stdioTransport, wsTransport } from '../transports.js';

export interface CertifyOptions {
  adapter: string;
  framework?: string;
  profile?: string;
  url?: string;
  ws?: string;
  stdio?: string;
  token?: string;
  fixtures?: string;
  markers?: Partial<CaseMarkers>;
  report?: string;
  minLevel: number;
  timeoutMs?: number;
  quiet?: boolean;
}

export function parseCertifyArgs(argv: string[]): CertifyOptions {
  const options: CertifyOptions = { adapter: '', minLevel: 1 };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      const value = argv[++i];
      if (value === undefined) throw new Error(`missing value for ${arg}`);
      return value;
    };
    switch (arg) {
      case '--adapter':
        options.adapter = next();
        break;
      case '--framework':
        options.framework = next();
        break;
      case '--profile':
        options.profile = next();
        break;
      case '--url':
        options.url = next();
        break;
      case '--ws':
        options.ws = next();
        break;
      case '--stdio':
        options.stdio = next();
        break;
      case '--token':
        options.token = next();
        break;
      case '--fixtures':
        options.fixtures = next();
        break;
      case '--report':
        options.report = next();
        break;
      case '--min-level':
        options.minLevel = Number(next());
        break;
      case '--timeout':
        options.timeoutMs = Number(next());
        break;
      case '--markers': {
        const raw = next();
        const json = raw.startsWith('@') ? readFileSync(raw.slice(1), 'utf-8') : raw;
        try {
          options.markers = JSON.parse(json);
        } catch (err: any) {
          throw new Error(`--markers must be JSON or @file.json: ${err.message}`);
        }
        break;
      }
      case '--quiet':
        options.quiet = true;
        break;
      case '--help':
      case '-h':
        throw new HelpRequested();
      default:
        throw new Error(`unknown argument ${arg}`);
    }
  }
  if (!options.adapter) throw new Error('--adapter is required');
  if ([options.url, options.ws, options.stdio].filter(Boolean).length !== 1) {
    throw new Error('exactly one of --url, --ws or --stdio is required');
  }
  return options;
}

export class HelpRequested extends Error {}

function resolveFixturesPath(explicit?: string): string {
  if (explicit) {
    const path = resolve(explicit);
    if (!existsSync(path)) throw new Error(`fixtures not found: ${path}`);
    return path;
  }
  let dir = process.cwd();
  for (let depth = 0; depth < 6; depth++) {
    const candidate = join(dir, 'fixtures', 'conformance-cases.json');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error('fixtures/conformance-cases.json not found; pass --fixtures <path>');
}

function buildTransport(options: CertifyOptions): RpcTransport {
  const targets = [options.url, options.ws, options.stdio].filter(Boolean);
  if (targets.length !== 1) {
    throw new Error('exactly one of --url, --ws or --stdio is required');
  }
  if (options.url) {
    return httpTransport({ url: options.url, token: options.token, timeoutMs: options.timeoutMs });
  }
  if (options.ws) {
    return wsTransport({ url: options.ws, token: options.token, timeoutMs: options.timeoutMs });
  }
  const [command, ...args] = splitCommand(String(options.stdio));
  return stdioTransport({ command, args, timeoutMs: options.timeoutMs ?? 30_000 });
}

function splitCommand(command: string): string[] {
  // Shell-less split with single/double quote support; keeps `--stdio` portable.
  const parts: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  for (const char of command.trim()) {
    if (quote) {
      if (char === quote) quote = null;
      else current += char;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        parts.push(current);
        current = '';
      }
      continue;
    }
    current += char;
  }
  if (current) parts.push(current);
  return parts;
}

const HELP = `oumv-certify — OUMV conformance certification (spec §10)

Usage:
  oumv-certify --adapter <id> (--url <http> | --ws <url> | --stdio <cmd>) [options]

Options:
  --framework <name>    framework reported in the report (gin, fastapi, react, ...)
  --profile <name>      frontend | backend (recorded in environment)
  --token <token>       X-OUMV-Session-Token / Bearer token
  --fixtures <path>     fixture file (default: fixtures/conformance-cases.json)
  --markers <json|@f>   marker overrides: fixtureFile, editTarget, l2Target, ...
  --report <path>       report output (default: certification/<adapter>.json)
  --min-level <n>       required attained level (default: 1)
  --timeout <ms>        per-request timeout
  --quiet               only print the final summary

Exit code 0 only when every case passed and attainedLevel >= --min-level.`;

export async function certify(options: CertifyOptions): Promise<number> {
  const fixturesPath = resolveFixturesPath(options.fixtures);
  const spec = loadFixtures(fixturesPath);
  const markers = defaultMarkers(options.markers);
  const transport = buildTransport(options);

  try {
    if (!markers.editVersion) {
      const probe = await transport.request({
        jsonrpc: '2.0',
        id: 'certify-get-source',
        method: 'oumv/getSource',
        params: { path: markers.editTarget },
      });
      const version = (probe.result as Record<string, unknown> | undefined)?.version;
      if (probe.error || typeof version !== 'string' || !version.startsWith('sha256:')) {
        console.error(
          `✗ cannot derive ${markers.editTarget} OCC version via oumv/getSource: ${
            probe.error ? `${probe.error.code} ${probe.error.message}` : 'no version in result'
          }`
        );
        return 2;
      }
      markers.editVersion = version;
    }

    if (!options.quiet) {
      console.log(`▸ ${options.adapter} · ${transport.name} · fixtures v${spec.fixtureVersion} (${fixturesPath})`);
    }

    const report = await runFixtureSuite(transport, spec, markers, {
      adapterName: options.adapter,
      framework: options.framework,
      environment: {
        transport: transport.name,
        ...(options.profile ? { profile: options.profile } : {}),
        node: process.version,
      },
      onCase: options.quiet
        ? undefined
        : (result) => {
            const mark = result.status === 'passed' ? '✓' : '✗';
            console.log(`  ${mark} L${result.level} ${result.id}${result.error ? ` — ${result.error}` : ''}`);
          },
    });

    const reportPath = resolve(
      options.report ?? join('certification', `${options.adapter.replace(/[/\\]/g, '-')}.json`)
    );
    mkdirSync(dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf-8');

    console.log(
      `\n${options.adapter}: level ${report.attainedLevel} · ${report.passed}/${report.total} passed` +
        (report.failed ? ` · ${report.failed} failed` : '') +
        `\nreport: ${reportPath}`
    );

    if (report.failed > 0) return 1;
    if (report.attainedLevel < options.minLevel) {
      console.error(`attained level ${report.attainedLevel} is below --min-level ${options.minLevel}`);
      return 1;
    }
    return 0;
  } finally {
    await transport.close?.();
  }
}

async function main(): Promise<void> {
  try {
    const options = parseCertifyArgs(process.argv.slice(2));
    process.exitCode = await certify(options);
  } catch (err: any) {
    if (err instanceof HelpRequested) {
      console.log(HELP);
      return;
    }
    console.error(`✗ ${err.message}`);
    process.exitCode = 2;
  }
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
  void main();
}
