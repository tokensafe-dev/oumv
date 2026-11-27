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

export interface ApplyEditHunk {
  target: string;
  replacement: string;
  startLine?: number;
  endLine?: number;
  replaceAll?: boolean;
}

/**
 * `applyEdit` params in the wire 1.5.0 shape (§4.3). The v1.0
 * `filePath`/`source` spellings are deprecated aliases (§4.7) accepted on
 * input, never emitted, and are not modelled here.
 */
export interface ApplyEditParams {
  sessionId?: string;
  requestId?: string;
  timeoutMs?: number;
  /** Idempotency (§3, wire 1.6.0): a retry with the same key replays the first result. */
  idempotencyKey?: string;
  path: string;
  mode?: 'replace' | 'create' | 'patch' | 'symbol' | 'delete' | 'rename';
  symbol?: string;
  renameTo?: string;
  replacement?: string;
  hunks?: ApplyEditHunk[];
  expectedVersion?: string;
}

/** `applyEdit` result in the wire 1.5.0 shape (§4.3). */
export interface ApplyEditResult {
  status: 'CURRENT' | 'APPLIED';
  path: string;
  mode?: ApplyEditParams['mode'];
  newVersion: string;
  created?: boolean;
  hunksApplied?: number;
  syntaxCheck?: { status: 'passed' | 'failed' | 'skipped'; tool?: string; error?: string };
  backupPath?: string;
  rollbackHint?: string;
  evidence?: EvidenceMetadata;
}

/** One item of a multi-file atomic mutation (wire 1.5.0). */
export interface ApplyEditBatchItem {
  path: string;
  /** Defaults to `replace`; `symbol`/`delete`/`rename` answer -32006 inside a batch. */
  mode?: 'replace' | 'create' | 'patch';
  expectedVersion?: string;
  replacement?: string;
  hunks?: ApplyEditHunk[];
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
