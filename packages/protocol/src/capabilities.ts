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
}

export interface OumvVerifyCapabilities {
  multiMetric: boolean;
  surfaceDiff: boolean;
}

export interface OumvCapabilities {
  observe: OumvObserveCapabilities;
  understand: OumvUnderstandCapabilities;
  mutate: OumvMutateCapabilities;
  verify: OumvVerifyCapabilities;
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
}

export interface OumvHandshakeResult {
  protocolVersion: string;
  runtimeInfo: OumvRuntimeInfo;
  capabilities: OumvCapabilities;
}
