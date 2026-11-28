import type { EvidenceMetadata } from './resources.js';

export type ObserveLevel = 'L0' | 'L1' | 'L2' | 'L3' | 'L4';
export type ObserveFormat = 'yaml' | 'json' | 'sexp';

export interface ObserveParams {
  sessionId?: string;
  requestId?: string;
  timeoutMs?: number;
  /** §4.1 freshness handshake (wire 1.6.0): a previously returned workspaceVersion token. */
  ifVersion?: string;
  level: ObserveLevel;
  format?: ObserveFormat;
  target?: string;
  componentId?: string;
  limit?: number;
  cursor?: string;
}

export interface ObserveResult {
  level: ObserveLevel;
  format: ObserveFormat;
  /** Canonical structured payload (§4.7: `observe.data`; `payload` is the deprecated alias). */
  data?: any;
  /** Deprecated alias (§4.7) — accepted on input, never emitted by conforming runtimes. */
  payload?: string;
  tokenEstimate?: number;
  timestamp?: number;
  limit?: number;
  cursor?: string;
  hasMore?: boolean;
  nextCursor?: string;
  /** §4.1 (wire 1.6.0): the freshness token over the workspace inventory. */
  workspaceVersion?: string;
  /** True only for the short ifVersion-match answer. */
  unchanged?: boolean;
  evidence?: EvidenceMetadata;
}
