import type { EvidenceMetadata } from './resources.js';

export interface VerificationTimings {
  t_action_ms: number;
  t_schema_ms: number;
  t_propagation_ms: number;
  t_dom_ms: number;
  t_total_ms: number;
}

export interface SurfaceDiffItem {
  op: 'attr' | 'text' | 'visibility';
  target: string;
  attr?: string;
  before?: any;
  after?: any;
}

export interface StateDiff {
  [key: string]: {
    before: any;
    after: any;
  };
}

export interface VerifyParams {
  target?: string;
  componentId?: string;
  action: string;
  payload?: any;
}

export interface VerifyResult {
  status: 'passed' | 'failed';
  target?: string;
  componentId?: string;
  action: string;
  diff: StateDiff;
  surfaceDiff?: SurfaceDiffItem[];
  timings?: VerificationTimings;
  durationMs: number;
  evidence?: EvidenceMetadata;
  error?: string;
}
