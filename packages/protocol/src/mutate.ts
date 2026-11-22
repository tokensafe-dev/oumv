export interface GetSourceParams {
  componentId: string;
  filePath: string;
}

export interface GetSourceResult {
  componentId: string;
  filePath: string;
  version: string; // sha256:...
  source: string;
  contract?: {
    componentId: string;
    stateFields: string[];
    actionNames: string[];
    elementAgentIds: string[];
  };
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
