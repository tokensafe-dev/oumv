#!/usr/bin/env node
/**
 * CI gate: every capability an adapter manifest advertises must be backed by a
 * fixture case at (or below) the declared conformance level.
 *
 * `adapters/*.json` describe intent; `fixtures/conformance-cases.json` is the
 * evidence. Advertising `observe.traces` at level 3 without the L4 traces case —
 * or with it listed at a lower level — fails the build.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const ADAPTERS_DIR = join(ROOT, 'adapters');
const FIXTURES = join(ROOT, 'fixtures', 'conformance-cases.json');

/** Capability name → the fixture case that proves it. */
const CAPABILITY_CASES = {
  'observe.pulse': 'observe-l0-returns-pulse',
  'observe.surface': 'observe-l1-returns-surface',
  'observe.contract': 'observe-l2-returns-targeted-contract',
  'observe.source': 'observe-l3-returns-source-and-occ-version',
  'observe.traces': 'observe-l4-returns-recorded-traces',
  'understand.impact': 'understand-impact-resolves-target',
  'understand.causality': 'understand-causality-after-execution',
  'mutate.source': 'apply-edit-returns-real-occ-version',
  'verify.behavior': 'verify-returns-status-timings-and-scope',
  'verify.sandboxRollback': 'verify-sandbox-rolls-back',
};

const fixtures = JSON.parse(readFileSync(FIXTURES, 'utf-8'));
const casesById = new Map(
  [...fixtures.cases, ...(fixtures.capabilityCases ?? [])].map((c) => [c.id, c])
);

const problems = [];
let checked = 0;

for (const file of readdirSync(ADAPTERS_DIR).filter((f) => f.endsWith('.json')).sort()) {
  const manifest = JSON.parse(readFileSync(join(ADAPTERS_DIR, file), 'utf-8'));
  for (const capability of manifest.capabilities ?? []) {
    const caseId = CAPABILITY_CASES[capability.name];
    if (!caseId) {
      problems.push(`${file}: capability ${capability.name} has no fixture mapping (extend CAPABILITY_CASES)`);
      continue;
    }
    const testCase = casesById.get(caseId);
    if (!testCase) {
      problems.push(`${file}: capability ${capability.name} maps to missing case ${caseId}`);
      continue;
    }
    const declared = capability.conformanceLevel;
    // A conservative claim (declared below the case level) is allowed; claiming
    // more than the case proves is the failure this gate exists for.
    if (typeof declared === 'number' && declared > testCase.level) {
      problems.push(
        `${file}: capability ${capability.name} claims level ${declared} but its case ${caseId} is level ${testCase.level}`
      );
      continue;
    }
    checked++;
  }
}

if (problems.length) {
  console.error('Adapter capability over-claim detected:');
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log(`Adapter capabilities backed by fixtures: ${checked} claim(s) across ${readdirSync(ADAPTERS_DIR).length} manifest(s)`);
