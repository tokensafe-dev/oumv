import type { EvidenceMetadata } from './resources.js';

export interface GetSourceParams {
  target?: string;
  componentId?: string;
  filePath: string;
}

export interface GetSourceResult {
  target?: string;
  componentId?: string;
  filePath: string;
  version: string; // sha256:...
  source: string;
  contract?: {
    componentId?: string;
    target?: string;
    stateFields?: string[];
    actionNames?: string[];
    elementAgentIds?: string[];
  };
  evidence?: EvidenceMetadata;
}

export interface ApplyEditParams {
  filePath: string;
  source: string;
  expectedVersion: string;
}

export interface ApplyEditResult {
  success: boolean;
  filePath: string;
  version: string;
  message?: string;
}

/** One item of a multi-file atomic mutation (wire 1.5.0). */
export interface ApplyEditBatchItem {
  path: string;
  /** Defaults to `replace`; `symbol`/`delete`/`rename` answer -32006 inside a batch. */
  mode?: 'replace' | 'create' | 'patch';
  expectedVersion?: string;
  replacement?: string;
  hunks?: Array<{
    target: string;
    replacement: string;
    startLine?: number;
    endLine?: number;
    replaceAll?: boolean;
  }>;
}

export interface ApplyEditBatchParams {
  edits: ApplyEditBatchItem[];
}

export interface ApplyEditBatchResult {
  status: 'APPLIED';
  edits: Array<{
    path: string;
    newVersion: string;
    created?: boolean;
    hunksApplied?: number;
  }>;
}
