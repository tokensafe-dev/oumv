import type { ResourceReference, EvidenceMetadata } from '../resources.js';
import type { ObserveLevel, ObserveFormat } from '../observe.js';

export interface FrontendComponentContract {
  id: string;
  name: string;
  filePath?: string;
  description?: string;
  propsSchema?: Record<string, any>;
  stateFields?: string[];
  actionNames?: string[];
  elementAgentIds?: string[];
  constraints?: string[];
}

export interface FrontendObserveParams {
  level: ObserveLevel;
  format?: ObserveFormat;
  target?: string;
  componentId?: string;
}

export interface FrontendVerifyParams {
  target?: string;
  componentId?: string;
  action: string;
  payload?: any;
}

export interface FrontendVerifyResult {
  status: 'passed' | 'failed';
  target: string;
  action: string;
  diff: Record<string, { before: any; after: any }>;
  surfaceDiff?: Array<{
    op: 'attr' | 'text' | 'visibility';
    target: string;
    attr?: string;
    before?: any;
    after?: any;
  }>;
  durationMs: number;
  evidence: EvidenceMetadata;
  error?: string;
}
