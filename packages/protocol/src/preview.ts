import type { ApplyEditBatchItem, ApplyEditHunk } from './mutate.js';

/** §4.4 — a dry-run of `applyEdit`: identical guard order, no bytes written. */
export interface PreviewEditParams {
  sessionId?: string;
  requestId?: string;
  timeoutMs?: number;
  idempotencyKey?: string;
  /** Single-edit form: one of path+replacement / symbol / hunks. */
  path?: string;
  mode?: 'replace' | 'create' | 'patch' | 'symbol' | 'delete' | 'rename';
  symbol?: string;
  renameTo?: string;
  replacement?: string;
  hunks?: ApplyEditHunk[];
  expectedVersion?: string;
  /** Batch form (wire 1.5.0): single-edit fields MUST be absent when present. */
  edits?: ApplyEditBatchItem[];
}

export interface PreviewItem {
  path: string;
  mode: 'replace' | 'create' | 'patch' | 'symbol' | 'delete' | 'rename';
  unchanged?: boolean;
  currentVersion?: string;
  /** sha256 of the would-be bytes. */
  newVersion?: string;
  /** Unified diff per file; omitted when `unchanged` is true. */
  diff?: string;
  syntaxCheck?: { status: 'passed' | 'failed' | 'skipped'; tool?: string; error?: string };
  /** Honest no-op verdict: the guard result travelled, nothing else. */
  wouldApply: boolean;
}

export interface PreviewEditResult {
  status: 'PREVIEW';
  applied: false;
  previews: PreviewItem[];
}
