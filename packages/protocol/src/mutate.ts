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
