export interface ScenarioMetric {
  scenarioId: number;
  scenarioName: string;
  engine: 'CAST Imaging' | 'Breeze.AI' | 'OUMV Protocol';
  latencyMs: number;
  tokensConsumed: number;
  accuracyScore: number; // 0.0 - 1.0 (precision * recall)
  falsePositiveRate: number; // 0.0 - 1.0
  mutationSafety: 'N/A (Read-Only)' | 'Unprotected (No OCC)' | 'Safe (OCC + Guard)';
  verificationLatencyMs?: number;
  success: boolean;
  notes: string;
}

export interface BenchmarkReportData {
  timestamp: string;
  stack: string;
  results: ScenarioMetric[];
  aggregates: {
    engine: string;
    totalLatencyMs: number;
    totalTokens: number;
    avgAccuracy: number;
    scenariosPassed: number;
    totalScenarios: number;
  }[];
}
