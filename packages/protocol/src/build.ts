/** §14.3 — run the build/test command and return structured diagnostics (optional extension, capability `verify.build`). */

export interface BuildDiagnostic {
  severity: 'error' | 'warning' | 'info';
  source: 'build' | 'test' | 'hmr' | 'tool';
  message: string;
  file?: string;
  line?: number;
  tool?: string;
  reason?: string;
  ts?: number;
}

export interface BuildParams {
  sessionId?: string;
  requestId?: string;
  timeoutMs?: number;
  command?: string;
  target?: string;
}

export interface BuildResult {
  status: 'passed' | 'failed' | 'skipped';
  command: string;
  diagnostics: BuildDiagnostic[];
  durationMs?: number;
  truncated?: boolean;
  /** Required when status is "skipped". */
  skipReason?: string;
}
