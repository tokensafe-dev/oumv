import type {
  OumvRuntimeAdapter,
} from '@oumv/protocol';
import {
  OumvHandshakeResultSchema,
  ObserveResultSchema,
  ImpactResultSchema,
  GetSourceResultSchema,
  ApplyEditResultSchema,
  VerifyResultSchema,
} from '@oumv/schema';

export type ConformanceLevel = 0 | 1 | 2 | 3;
export type LevelStatus = 'passed' | 'failed' | 'skipped';

export interface ConformanceTestResult {
  name: string;
  category: 'handshake' | 'observe' | 'understand' | 'mutate' | 'verify';
  level: 1 | 2 | 3;
  status: 'passed' | 'failed' | 'skipped';
  error?: string;
  /** Why a test was skipped (unsupported capability), never silently green. */
  reason?: string;
  durationMs: number;
}

export interface ConformanceReport {
  adapterName: string;
  adapterVersion: string;
  specVersion: string;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  /** Highest level whose cases (and all lower levels) passed. */
  attainedLevel: ConformanceLevel;
  /** Per-level verdict derived from the same results. */
  levels: Record<1 | 2 | 3, LevelStatus>;
  durationMs: number;
  results: ConformanceTestResult[];
}

/**
 * Derives the attained conformance level from raw results (spec §10).
 * Levels are cumulative: Level N requires every case at level <= N to pass.
 * A skipped case is not a pass — it caps the claim instead of inflating it.
 */
export function determineConformanceLevel(
  results: Pick<ConformanceTestResult, 'level' | 'status'>[]
): ConformanceLevel {
  let attained: ConformanceLevel = 0;
  for (const level of [1, 2, 3] as const) {
    const atLevel = results.filter((r) => r.level === level);
    // No case at this level means the level was never exercised — stop there
    // rather than inheriting a higher claim from a shorter suite.
    if (atLevel.length === 0) break;
    const upTo = results.filter((r) => r.level <= level);
    if (upTo.some((r) => r.status !== 'passed')) break;
    attained = level;
  }
  return attained;
}

/** Per-level verdicts for a report. */
export function summarizeLevels(
  results: Pick<ConformanceTestResult, 'level' | 'status'>[]
): Record<1 | 2 | 3, LevelStatus> {
  const out = {} as Record<1 | 2 | 3, LevelStatus>;
  for (const level of [1, 2, 3] as const) {
    const atLevel = results.filter((r) => r.level === level);
    if (atLevel.length === 0) out[level] = 'skipped';
    else if (atLevel.some((r) => r.status === 'failed')) out[level] = 'failed';
    else if (atLevel.some((r) => r.status === 'skipped')) out[level] = 'skipped';
    else out[level] = 'passed';
  }
  return out;
}

export interface ConformanceFixture {
  componentId: string;
  filePath: string;
  action: string;
  payload?: any;
}

/**
 * Standard OUMV Conformance Test Suite.
 * Certifies whether a runtime adapter complies with the OUMV protocol specification.
 */
export async function runConformanceSuite(
  adapter: OumvRuntimeAdapter,
  fixture?: ConformanceFixture
): Promise<ConformanceReport> {
  const startTime = Date.now();
  const results: ConformanceTestResult[] = [];

  const runTest = async (
    name: string,
    category: ConformanceTestResult['category'],
    level: 1 | 2 | 3,
    fn: () => Promise<void>,
    skipReason?: string
  ) => {
    const t0 = Date.now();
    if (skipReason) {
      results.push({
        name,
        category,
        level,
        status: 'skipped',
        reason: skipReason,
        durationMs: 0,
      });
      return;
    }
    try {
      await fn();
      results.push({
        name,
        category,
        level,
        status: 'passed',
        durationMs: Date.now() - t0,
      });
    } catch (err: any) {
      results.push({
        name,
        category,
        level,
        status: 'failed',
        error: err.message,
        durationMs: Date.now() - t0,
      });
    }
  };

  const supports = (lvl: 'L2' | 'L3' | 'L4') =>
    Array.isArray(capabilities?.observe?.levels) && capabilities.observe.levels.includes(lvl)
      ? undefined
      : `handshake does not advertise observe level ${lvl}`;

  // 1. Handshake & Capability Exchange
  let capabilities: any = null;
  await runTest('Handshake & Protocol Version Exchange', 'handshake', 1, async () => {
    const res = await adapter.handshake({
      protocolVersion: '1.1.0',
      clientInfo: { name: 'oumv-conformance-runner', version: '0.2.0' },
    });
    OumvHandshakeResultSchema.parse(res);
    capabilities = res.capabilities;
    if (!res.protocolVersion || !res.runtimeInfo.name) {
      throw new Error('Handshake missing required protocolVersion or runtimeInfo');
    }
  });

  // 2. Observe Level L0 (Pulse)
  await runTest('Observe Level L0 (Page Pulse)', 'observe', 1, async () => {
    const res = await adapter.observe({ level: 'L0', format: 'yaml' });
    ObserveResultSchema.parse(res);
    if (!res.payload || res.level !== 'L0') {
      throw new Error('Observe L0 invalid response payload');
    }
  });

  // 3. Observe Level L1 (Surface)
  await runTest('Observe Level L1 (Interactive Surface)', 'observe', 1, async () => {
    const res = await adapter.observe({ level: 'L1', format: 'yaml' });
    ObserveResultSchema.parse(res);
    if (!res.payload || res.level !== 'L1') {
      throw new Error('Observe L1 invalid response payload');
    }
  });

  // 4. Observe Level L2 (Contract) — spec §10 Level 2
  await runTest(
    'Observe Level L2 (Targeted Contract)',
    'observe',
    2,
    async () => {
      const res = await adapter.observe({
        level: 'L2',
        format: 'json',
        componentId: fixture?.componentId,
        target: fixture ? undefined : 'test-target',
      });
      if (res.level !== 'L2' || !res.payload) {
        throw new Error('Observe L2 must return a contract payload');
      }
      const parsed = safeParsePayload(res.payload);
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('Observe L2 payload must be structured (json) contract data');
      }
    },
    supports('L2')
  );

  // 5. Observe Level L3 (Source + OCC token) — spec §10 Level 2 requires L3 observe
  await runTest(
    'Observe Level L3 (Source + OCC Version)',
    'observe',
    2,
    async () => {
      const res = await adapter.observe({
        level: 'L3',
        format: 'json',
        componentId: fixture?.componentId,
        target: fixture?.filePath,
      });
      if (res.level !== 'L3' || !res.payload) {
        throw new Error('Observe L3 must return source payload');
      }
      if (!/sha256:[0-9a-f]{64}/.test(res.payload)) {
        throw new Error('Observe L3 payload must expose the sha256 OCC version token');
      }
    },
    supports('L3') ?? (fixture ? undefined : 'no fixture component/file to observe at L3')
  );

  // 6. Understand: Impact Analysis
  await runTest('Understand: Impact Analysis Query', 'understand', 2, async () => {
    const res = (await adapter.understand({
      query: 'impact',
      target: fixture ? fixture.componentId : 'test-target',
    })) as any;
    ImpactResultSchema.parse(res);
  }, capabilities?.understand?.impactAnalysis === false ? 'impact analysis not advertised' : undefined);

  // 7. Understand: Dependency Topology
  await runTest('Understand: Dependency Topology YAML', 'understand', 2, async () => {
    const res = (await adapter.understand({ query: 'dependencies' })) as any;
    if (typeof res !== 'object' || typeof res.yaml !== 'string') {
      throw new Error('Understand dependencies query must return { yaml: string }');
    }
  });

  // 8. Understand: Runtime Causality — spec §10 Level 3
  await runTest(
    'Understand: Runtime Causality (why_state)',
    'understand',
    3,
    async () => {
      const res = (await adapter.understand({
        query: 'causality',
        target: fixture ? fixture.componentId : 'test-target',
      })) as any;
      if (!res || typeof res !== 'object') {
        throw new Error('Causality query must return a structured result');
      }
      // Frontend profile: componentId/stateKey/subscribers. Backend profile:
      // observed/traceChain/rootCause. Either shape must carry real evidence.
      const frontendShape = 'componentId' in res && 'subscribers' in res;
      const backendShape = 'observed' in res || 'traceChain' in res || 'rootCause' in res;
      if (!frontendShape && !backendShape) {
        throw new Error('Causality result must expose component/state subscribers or observed/traceChain evidence');
      }
    },
    supports('L4') ?? (capabilities?.understand?.causality === false ? 'causality not advertised' : undefined)
  );

  // 9. Observe Level L4 (Traces) — spec §10 Level 3
  await runTest(
    'Observe Level L4 (Recorded Traces)',
    'observe',
    3,
    async () => {
      const res = await adapter.observe({ level: 'L4', format: 'json' });
      if (res.level !== 'L4' || !res.payload) {
        throw new Error('Observe L4 must return a traces payload');
      }
    },
    supports('L4')
  );

  // 10. Mutate: Get Source with OCC Token
  let occVersion = '';
  if (fixture) {
    await runTest('Mutate: Get Source with OCC Version Token', 'mutate', 2, async () => {
      const res = await adapter.getSource({
        componentId: fixture.componentId,
        filePath: fixture.filePath,
      });
      GetSourceResultSchema.parse(res);
      occVersion = res.version;
      if (!occVersion.startsWith('sha256:')) {
        throw new Error('OCC version token must be sha256:... format');
      }
    });

    // 11. Mutate: Reject Concurrent Edit with CONFLICT_DETECTED
    await runTest('Mutate: Reject Stale Concurrency Token', 'mutate', 2, async () => {
      try {
        await adapter.applyEdit({
          filePath: fixture.filePath,
          source: '// concurrent edit test',
          expectedVersion: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
        });
        throw new Error('Expected OCC stale version rejection, but applyEdit succeeded');
      } catch (err: any) {
        if (!err.message.includes('CONFLICT_DETECTED') && !err.message.includes('concurrently')) {
          throw err;
        }
      }
    });

    // 12. Verify: Local Action Verification
    await runTest('Verify: Local Action Verification & Timings', 'verify', 1, async () => {
      const res = await adapter.verify({
        componentId: fixture.componentId,
        action: fixture.action,
        payload: fixture.payload,
      });
      VerifyResultSchema.parse(res);
      if (res.status !== 'passed') {
        throw new Error(`Verification expected passed status, got ${res.status}: ${res.error}`);
      }
      if (!res.timings || typeof res.timings.t_total_ms !== 'number') {
        throw new Error('Verification result missing required multi-metric timings');
      }
    });

    // 13. Verify: Accessibility surface diff — spec §10 Level 2
    await runTest('Verify: Surface Diff Coverage', 'verify', 2, async () => {
      const res = await adapter.verify({
        componentId: fixture.componentId,
        action: fixture.action,
        payload: fixture.payload,
      });
      if (!Array.isArray(res.surfaceDiff)) {
        throw new Error('Verification result must expose a surfaceDiff array (a11y/text/visibility)');
      }
    });
  }

  const passedCount = results.filter((r) => r.status === 'passed').length;
  const failedCount = results.filter((r) => r.status === 'failed').length;
  const skippedCount = results.filter((r) => r.status === 'skipped').length;

  return {
    adapterName: adapter.name,
    adapterVersion: adapter.version,
    specVersion: '1.1.0',
    total: results.length,
    passed: passedCount,
    failed: failedCount,
    skipped: skippedCount,
    attainedLevel: determineConformanceLevel(results),
    levels: summarizeLevels(results),
    durationMs: Date.now() - startTime,
    results,
  };
}

/** Parse a serialized observe payload without throwing. */
function safeParsePayload(payload: string): unknown {
  try {
    return JSON.parse(payload);
  } catch {
    return undefined;
  }
}
