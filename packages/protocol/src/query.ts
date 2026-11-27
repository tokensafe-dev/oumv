/** §14.2 — runtime-enforced read-only data access (optional extension, capability `observeQuery.readOnly`). */

export interface QueryParams {
  sessionId?: string;
  requestId?: string;
  timeoutMs?: number;
  sql: string;
  params?: unknown[];
  limit?: number;
}

export interface QueryResult {
  columns: string[];
  /** Rows capped by `limit`; values JSON-native (null/number/string/boolean). */
  rows: unknown[][];
  rowCount: number;
  truncated: boolean;
}
