export type UnderstandQuery =
  | 'impact'
  | 'dependencies'
  | 'causality'
  | 'why_state'
  | 'signals'
  /** Static L2 flow (§4.2): handler → callees → literal client routes. */
  | 'flow';

export interface UnderstandParams {
  sessionId?: string;
  requestId?: string;
  timeoutMs?: number;
  /** §4.1 freshness handshake (wire 1.6.0), mirroring observe. */
  ifVersion?: string;
  query: UnderstandQuery;
  target?: string;
  componentId?: string;
}

export interface ImpactResult {
  target: string;
  directlyAffected: string[];
  indirectlyAffected: string[];
  safeComponents: string[];
  recommendation: string;
}

export interface CausalitySubscriber {
  id: string;
  name?: string;
  kind: string;
}

export interface CausalityMutation {
  actionName?: string;
  timestamp?: number;
  oldValue?: any;
  newValue?: any;
}

export interface CausalityResult {
  target: string;
  componentId: string;
  stateKey: string;
  value: any;
  subscribers: CausalitySubscriber[];
  lastMutation?: CausalityMutation;
  explanation: string;
}

/**
 * The understand response envelope: the query payload plus the §4.1 freshness
 * token (wire 1.6.0) observe carries — `understand` honours the same handshake.
 */
export interface UnderstandResult {
  query: UnderstandQuery;
  target?: string;
  impact?: ImpactResult;
  causality?: CausalityResult;
  /** §4.1 (wire 1.6.0): the freshness token over the workspace inventory. */
  workspaceVersion?: string;
  /** True only for the short ifVersion-match answer. */
  unchanged?: boolean;
}
