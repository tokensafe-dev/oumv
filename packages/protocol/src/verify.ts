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
  sessionId?: string;
  requestId?: string;
  timeoutMs?: number;
  target?: string;
  componentId?: string;
  action?: string;
  payload?: any;
  headers?: Record<string, string>;
  /** Ordered multi-request scenario sharing state (wire 1.2.0). */
  steps?: Array<{ id: string; target: string; action?: string; payload?: any }>;
  /** Transactional rollback request (wire 1.4.0). */
  sandbox?: { mode: 'rollback' };
}

export interface VerifyResult {
  status: 'passed' | 'failed';
  target?: string;
  componentId?: string;
  action?: string;
  diff: StateDiff;
  surfaceDiff?: SurfaceDiffItem[];
  timings?: VerificationTimings;
  durationMs: number;
  /** Honest verification scope (spec §4.5): what ran, what did not, what cannot. */
  scope?: { checked?: string[]; notExecuted?: string[]; notSupported?: string[] };
  /** Evidence-gated DB sandbox result (wire 1.4.0). */
  rolledBack?: boolean;
  rollbackStatus?: string;
  dbDiff?: { rollback?: boolean; queries?: string[]; driver?: string };
  evidence?: EvidenceMetadata;
  error?: string;
}
