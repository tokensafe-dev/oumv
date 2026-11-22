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

export interface ConformanceTestResult {
  name: string;
  category: 'handshake' | 'observe' | 'understand' | 'mutate' | 'verify';
  status: 'passed' | 'failed';
  error?: string;
  durationMs: number;
}

export interface ConformanceReport {
  adapterName: string;
  adapterVersion: string;
  total: number;
  passed: number;
  failed: number;
  durationMs: number;
  results: ConformanceTestResult[];
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
    fn: () => Promise<void>
  ) => {
    const t0 = Date.now();
    try {
      await fn();
      results.push({
        name,
        category,
        status: 'passed',
        durationMs: Date.now() - t0,
      });
    } catch (err: any) {
      results.push({
        name,
        category,
        status: 'failed',
        error: err.message,
        durationMs: Date.now() - t0,
      });
    }
  };

  // 1. Handshake & Capability Exchange
  let capabilities: any = null;
  await runTest('Handshake & Protocol Version Exchange', 'handshake', async () => {
    const res = await adapter.handshake({
      protocolVersion: '1.0.0',
      clientInfo: { name: 'oumv-conformance-runner', version: '0.1.0' },
    });
    OumvHandshakeResultSchema.parse(res);
    capabilities = res.capabilities;
    if (!res.protocolVersion || !res.runtimeInfo.name) {
      throw new Error('Handshake missing required protocolVersion or runtimeInfo');
    }
  });

  // 2. Observe Level L0 (Pulse)
  await runTest('Observe Level L0 (Page Pulse)', 'observe', async () => {
    const res = await adapter.observe({ level: 'L0', format: 'yaml' });
    ObserveResultSchema.parse(res);
    if (!res.payload || res.level !== 'L0') {
      throw new Error('Observe L0 invalid response payload');
    }
  });

  // 3. Observe Level L1 (Surface)
  await runTest('Observe Level L1 (Interactive Surface)', 'observe', async () => {
    const res = await adapter.observe({ level: 'L1', format: 'yaml' });
    ObserveResultSchema.parse(res);
    if (!res.payload || res.level !== 'L1') {
      throw new Error('Observe L1 invalid response payload');
    }
  });

  // 4. Understand: Impact Analysis
  await runTest('Understand: Impact Analysis Query', 'understand', async () => {
    const res = (await adapter.understand({
      query: 'impact',
      target: fixture ? fixture.componentId : 'test-target',
    })) as any;
    ImpactResultSchema.parse(res);
  });

  // 5. Understand: Dependency Topology
  await runTest('Understand: Dependency Topology YAML', 'understand', async () => {
    const res = (await adapter.understand({ query: 'dependencies' })) as any;
    if (typeof res !== 'object' || typeof res.yaml !== 'string') {
      throw new Error('Understand dependencies query must return { yaml: string }');
    }
  });

  // 6. Mutate: Get Source with OCC Token
  let occVersion = '';
  if (fixture) {
    await runTest('Mutate: Get Source with OCC Version Token', 'mutate', async () => {
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

    // 7. Mutate: Reject Concurrent Edit with CONFLICT_DETECTED
    await runTest('Mutate: Reject Stale Concurrency Token', 'mutate', async () => {
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

    // 8. Verify: Local Action Verification
    await runTest('Verify: Local Action Verification & Timings', 'verify', async () => {
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
  }

  const passedCount = results.filter((r) => r.status === 'passed').length;
  const failedCount = results.filter((r) => r.status === 'failed').length;

  return {
    adapterName: adapter.name,
    adapterVersion: adapter.version,
    total: results.length,
    passed: passedCount,
    failed: failedCount,
    durationMs: Date.now() - startTime,
    results,
  };
}
