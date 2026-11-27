export interface OumvObserveCapabilities {
  levels: ('L0' | 'L1' | 'L2' | 'L3' | 'L4')[];
  formats: ('yaml' | 'json' | 'sexp')[];
}

export interface OumvUnderstandCapabilities {
  causality: boolean;
  signalsGraph: boolean;
  impactAnalysis: boolean;
}

export interface OumvMutateCapabilities {
  occ: boolean;
  syntaxGuard: boolean;
  ephemeralDispatch: boolean;
  /** Atomic multi-file `applyEdit` (`edits: [...]`, wire 1.5.0). */
  multiFile?: boolean;
  /** `oumv/previewEdit` with the full §4.4 guard order (wire 1.6.0). */
  preview?: boolean;
}

/** §3 session negotiation (wire 1.5.0). */
export interface OumvSessionCapabilities {
  /** Honours a client-requested handshake `sessionTtlSeconds`. */
  ttlSeconds?: boolean;
  /** Accepts `oumv/cancel` for in-flight requests (wire 1.6.0). */
  cancel?: boolean;
  /** applyEdit/previewEdit honour `idempotencyKey` with first-result-wins replay (§3). */
  idempotency?: boolean;
}

export interface OumvVerifyCapabilities {
  multiMetric: boolean;
  surfaceDiff: boolean;
  /** Transactional rollback with observed evidence (spec §4.5 verify `sandbox`). */
  sandboxRollback?: boolean;
  /** `oumv/build` — structured build/test diagnostics (§14.3, wire 1.6.0). */
  build?: boolean;
}

/** §14.1 optional extension (wire 1.6.0). */
export interface OumvIndexCapabilities {
  symbols: boolean;
}

/** §14.2 optional extension (wire 1.6.0). */
export interface OumvObserveQueryCapabilities {
  readOnly: boolean;
}

/** §2.6 push diagnostics (wire 1.6.0). */
export interface OumvEventsCapabilities {
  diagnostic: boolean;
}

export interface OumvCapabilities {
  observe: OumvObserveCapabilities;
  understand: OumvUnderstandCapabilities;
  mutate: OumvMutateCapabilities;
  verify: OumvVerifyCapabilities;
  /** §3 session lifecycle negotiation. */
  sessions?: OumvSessionCapabilities;
  /** Bindings this runtime actually mounted (spec §2.3/§2.4). */
  transports?: ('http' | 'sse' | 'ws' | 'stdio' | 'memory' | 'batch')[];
  /** §14 optional extensions + push diagnostics (wire 1.6.0). */
  index?: OumvIndexCapabilities;
  observeQuery?: OumvObserveQueryCapabilities;
  events?: OumvEventsCapabilities;
}

export interface OumvClientInfo {
  name: string;
  version: string;
}

export interface OumvRuntimeInfo {
  name: string;
  version: string;
}

export interface OumvHandshakeParams {
  protocolVersion: string;
  clientInfo?: OumvClientInfo;
  requestedCapabilities?: Partial<OumvCapabilities>;
  /** Requested session lifetime in seconds (1..86400, clamped by the runtime). */
  sessionTtlSeconds?: number;
}

export interface OumvHandshakeResult {
  protocolVersion: string;
  runtimeInfo: OumvRuntimeInfo;
  capabilities: OumvCapabilities;
  sessionId?: string;
  /** Granted session lifetime: the clamped request, or the runtime default. */
  ttlSeconds?: number;
}
