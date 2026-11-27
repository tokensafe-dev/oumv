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
