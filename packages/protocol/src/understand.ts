export type UnderstandQuery =
  | 'impact'
  | 'dependencies'
  | 'causality'
  | 'why_state'
  | 'signals';

export interface UnderstandParams {
  query: UnderstandQuery;
  target?: string;
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
