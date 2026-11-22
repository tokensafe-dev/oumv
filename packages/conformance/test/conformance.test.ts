import { describe, it, expect } from 'vitest';
import type { OumvRuntimeAdapter } from '@oumv/protocol';
import { runConformanceSuite } from '../src/index.js';

describe('@oumv/conformance - Test Suite Harness', () => {
  const createMockAdapter = (): OumvRuntimeAdapter => ({
    name: 'mock-runtime-adapter',
    version: '1.0.0',
    async handshake() {
      return {
        protocolVersion: '1.0.0',
        runtimeInfo: { name: 'mock-runtime', version: '1.0.0' },
        capabilities: {
          observe: { levels: ['L0', 'L1', 'L2'], formats: ['yaml', 'json'] },
          understand: { causality: true, signalsGraph: true, impactAnalysis: true },
          mutate: { occ: true, syntaxGuard: true, ephemeralDispatch: true },
          verify: { multiMetric: true, surfaceDiff: true },
        },
      };
    },
    async observe(params) {
      return {
        level: params.level,
        format: params.format || 'yaml',
        payload: `view: mock#root\nstate: {}\n`,
        timestamp: Date.now(),
      };
    },
    async understand(params) {
      if (params.query === 'impact') {
        return {
          target: params.target || 'default',
          directlyAffected: ['comp-a'],
          indirectlyAffected: [],
          safeComponents: ['comp-b'],
          recommendation: 'Safe to modify',
        };
      }
      return { yaml: 'dependency_graph: []' };
    },
    async getSource(params) {
      return {
        componentId: params.componentId,
        filePath: params.filePath,
        version: 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        source: 'export const Mock = () => <div>Mock</div>;',
      };
    },
    async applyEdit(params) {
      if (params.expectedVersion !== 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855') {
        throw new Error('CONFLICT_DETECTED: Stale version token');
      }
      return {
        success: true,
        filePath: params.filePath,
        version: 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      };
    },
    async verify(params) {
      return {
        status: 'passed',
        componentId: params.componentId,
        action: params.action,
        diff: { count: { before: 0, after: 1 } },
        timings: {
          t_action_ms: 0.2,
          t_schema_ms: 0.1,
          t_propagation_ms: 0.1,
          t_dom_ms: 0.1,
          t_total_ms: 0.5,
        },
        durationMs: 0.5,
      };
    },
  });

  it('runs conformance suite against compliant adapter and reports 100% pass', async () => {
    const adapter = createMockAdapter();
    const report = await runConformanceSuite(adapter, {
      componentId: 'mock-comp',
      filePath: 'Mock.tsx',
      action: 'increment',
    });

    expect(report.adapterName).toBe('mock-runtime-adapter');
    expect(report.failed).toBe(0);
    expect(report.passed).toBe(report.total);
    expect(report.total).toBe(8);
  });
});
