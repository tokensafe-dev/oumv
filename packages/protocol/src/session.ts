/** §3 cancellation (wire 1.6.0, capability `sessions.cancel`) + §2.6 diagnostics event. */

export interface CancelParams {
  sessionId?: string;
  requestId?: string;
  /** Cancel the most recent in-flight request on this session. */
  target?: 'last';
}

export interface CancelResult {
  cancelled: boolean;
  requestId?: string;
  /** True when the correlated request already finished (nothing to cancel). */
  finished?: boolean;
}

/** §2.6 — payload of the `diagnostic` push event / `notifications/oumv.diagnostic`. */
export interface DiagnosticEvent {
  severity: 'error' | 'warning' | 'info';
  source: 'build' | 'test' | 'hmr' | 'tool';
  message: string;
  file?: string;
  line?: number;
  tool?: string;
  ts?: number;
}
