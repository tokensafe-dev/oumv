import { describe, it, expect } from 'vitest';
import type { OumvRuntimeAdapter } from '@oumv/protocol';
import { runConformanceSuite, determineConformanceLevel, summarizeLevels } from '../src/index.js';

describe('@oumv/conformance - Test Suite Harness', () => {
  const createMockAdapter = (): OumvRuntimeAdapter => ({
    name: 'mock-runtime-adapter',
    version: '1.0.0',
    async handshake() {
      return {
        protocolVersion: '1.1.0',
        runtimeInfo: { name: 'mock-runtime', version: '1.0.0' },
        capabilities: {
          observe: { levels: ['L0', 'L1', 'L2', 'L3', 'L4'], formats: ['yaml', 'json'] },
          understand: { causality: true, signalsGraph: true, impactAnalysis: true },
          mutate: { occ: true, syntaxGuard: true, ephemeralDispatch: true },
          verify: { multiMetric: true, surfaceDiff: true },
        },
      };
    },
    async observe(params) {
      const payloads: Record<string, string> = {
        L0: 'status: HEALTHY\n',
        L1: 'elements: []\n',
        L2: JSON.stringify({ componentId: params.componentId ?? 'mock-comp', props: {}, actions: [] }),
        L3: JSON.stringify({
          componentId: params.componentId ?? 'mock-comp',
          source: 'export const Mock = () => <div />;',
          version: 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        }),
        L4: JSON.stringify([{ event: 'click', target: 'mock-comp' }]),
      };
      return {
        level: params.level,
        format: params.format || 'yaml',
        payload: payloads[params.level] ?? 'view: mock#root\n',
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
      if (params.query === 'causality') {
        return {
          target: params.target ?? 'mock-comp',
          componentId: 'mock-comp',
          stateKey: 'count',
          value: 1,
          subscribers: [{ id: 'mock-comp', kind: 'component' }],
          explanation: 'count drives the rendered total',
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
        surfaceDiff: [{ op: 'text' as const, target: 'mock-comp' }],
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
    expect(report.total).toBe(13);
    // A fully compliant adapter reaches the top level, and the report says so.
    expect(report.specVersion).toBe('1.1.0');
    expect(report.skipped).toBe(0);
    expect(report.attainedLevel).toBe(3);
    expect(report.levels).toEqual({ 1: 'passed', 2: 'passed', 3: 'passed' });
  });

  it('caps the level at 1 when L2-L4 observation is not advertised', async () => {
    const base = createMockAdapter();
    const adapter: OumvRuntimeAdapter = {
      ...base,
      async handshake() {
        const res = await base.handshake();
        return {
          ...res,
          capabilities: { ...res.capabilities, observe: { levels: ['L0', 'L1'], formats: ['yaml'] } },
        };
      },
    };

    const report = await runConformanceSuite(adapter, {
      componentId: 'mock-comp',
      filePath: 'Mock.tsx',
      action: 'increment',
    });

    expect(report.failed).toBe(0);
    // Unsupported levels are reported as skipped, never as passes.
    expect(report.skipped).toBeGreaterThan(0);
    expect(report.attainedLevel).toBe(1);
    expect(report.levels[2]).toBe('skipped');
    expect(report.levels[3]).toBe('skipped');
    expect(report.results.find((r) => r.name.includes('L2'))?.reason).toContain('does not advertise');
  });

  it('derives levels cumulatively and never lets a skip inflate a claim', () => {
    expect(determineConformanceLevel([{ level: 1, status: 'passed' }])).toBe(1);
    expect(
      determineConformanceLevel([
        { level: 1, status: 'passed' },
        { level: 2, status: 'skipped' },
        { level: 3, status: 'passed' },
      ])
    ).toBe(1);
    expect(
      determineConformanceLevel([
        { level: 1, status: 'passed' },
        { level: 2, status: 'failed' },
      ])
    ).toBe(1);
    expect(determineConformanceLevel([{ level: 1, status: 'failed' }])).toBe(0);
    expect(summarizeLevels([{ level: 1, status: 'passed' }])).toEqual({
      1: 'passed',
      2: 'skipped',
      3: 'skipped',
    });
  });
});
