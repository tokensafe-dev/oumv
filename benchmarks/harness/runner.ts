import { CastImagingHarness } from './cast_imaging.js';
import { BreezeAiHarness } from './breeze_ai.js';
import { OumvAdapterHarness } from './oumv_adapter.js';
import type { ScenarioMetric, BenchmarkReportData } from './types.js';

export async function runFullBenchmark(): Promise<BenchmarkReportData> {
  const cast = new CastImagingHarness();
  const breeze = new BreezeAiHarness();
  const oumv = new OumvAdapterHarness();

  const results: ScenarioMetric[] = [];

  // Scenario 1: Dependencies
  results.push(await cast.scenario1_dependencies());
  results.push(await breeze.scenario1_dependencies());
  results.push(await oumv.scenario1_dependencies());

  // Scenario 2: Trace UI to SQL
  results.push(await cast.scenario2_traceUiToSql());
  results.push(await breeze.scenario2_traceUiToSql());
  results.push(await oumv.scenario2_traceUiToSql());

  // Scenario 3: Blast Radius
  results.push(await cast.scenario3_blastRadius());
  results.push(await breeze.scenario3_blastRadius());
  results.push(await oumv.scenario3_blastRadius());

  // Scenario 4: Controlled Mutation
  results.push(await cast.scenario4_controlledMutation());
  results.push(await breeze.scenario4_controlledMutation());
  results.push(await oumv.scenario4_controlledMutation());

  // Scenario 5: Verification
  results.push(await cast.scenario5_verification());
  results.push(await breeze.scenario5_verification());
  results.push(await oumv.scenario5_verification());

  const engines = ['CAST Imaging', 'Breeze.AI', 'OUMV Protocol'] as const;

  const aggregates = engines.map((eng) => {
    const engResults = results.filter((r) => r.engine === eng);
    const totalLatencyMs = engResults.reduce((sum, r) => sum + r.latencyMs, 0);
    const totalTokens = engResults.reduce((sum, r) => sum + r.tokensConsumed, 0);
    const avgAccuracy = engResults.reduce((sum, r) => sum + r.accuracyScore, 0) / engResults.length;
    const scenariosPassed = engResults.filter((r) => r.success).length;

    return {
      engine: eng,
      totalLatencyMs,
      totalTokens,
      avgAccuracy: Math.round(avgAccuracy * 100) / 100,
      scenariosPassed,
      totalScenarios: engResults.length,
    };
  });

  return {
    timestamp: new Date().toISOString(),
    stack: 'React 19 + Vite + Go 1.23 + PostgreSQL 16 (E-Commerce Checkout)',
    results,
    aggregates,
  };
}

// Direct CLI execution
if (import.meta.url.endsWith(process.argv[1]) || process.argv[1]?.includes('runner')) {
  runFullBenchmark().then((report) => {
    console.log(JSON.stringify(report, null, 2));
  }).catch((err) => {
    console.error('Benchmark error:', err);
    process.exit(1);
  });
}
