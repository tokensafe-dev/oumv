/** §14.1 — repo-wide symbol search (optional extension, capability `index.symbols`). */

export interface IndexParams {
  sessionId?: string;
  requestId?: string;
  timeoutMs?: number;
  query: string;
  kinds?: string[];
  scope?: string;
  limit?: number;
}

export interface IndexMatch {
  resourceId: string;
  name: string;
  kind: string;
  file: string;
  lines: [number, number];
  signature?: string;
  /** Reverse-edge count (importers/callers) used for tie-breaking. */
  refs?: number;
  match: 'exact' | 'prefix' | 'qualified-suffix' | 'substring';
  evidence?: Record<string, unknown>;
}

export interface IndexResult {
  matches: IndexMatch[];
  truncated: boolean;
  totalMatches?: number;
}
