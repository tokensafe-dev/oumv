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
}

/** §3 session negotiation (wire 1.5.0). */
export interface OumvSessionCapabilities {
  /** Honours a client-requested handshake `sessionTtlSeconds`. */
  ttlSeconds?: boolean;
}

export interface OumvVerifyCapabilities {
  multiMetric: boolean;
  surfaceDiff: boolean;
  /** Transactional rollback with observed evidence (spec §4 verify `sandbox`). */
  sandboxRollback?: boolean;
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
