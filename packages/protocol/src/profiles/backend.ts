import type { ResourceReference, EvidenceMetadata } from '../resources.js';

export interface BackendEndpointContract {
  id: string; // e.g. "backend.endpoint:POST:/api/orders"
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';
  handlerName: string;
  summary?: string;
  requestSchema?: Record<string, any>;
  responseSchema?: Record<string, any>;
  middleware?: string[];
  dbOperations?: string[];
}

export interface BackendOperationContract {
  id: string;
  description: string;
  inputSchema?: Record<string, any>;
  constraints?: string[];
  verification?: string[];
}

export interface BackendVerifyParams {
  target: string; // e.g. "route:POST:/api/orders" or "orders.create"
  method?: string;
  payload?: any;
  headers?: Record<string, string>;
  /** spec §4: mode=rollback runs the whole verify in one transaction and rolls it back. */
  sandbox?: { mode: 'rollback' };
}

export interface BackendVerifyResult {
  status: 'passed' | 'failed';
  target: string;
  statusCode?: number;
  responseBody?: any;
  /** Sandbox evidence: rollback flag and number of statements, never SQL text. */
  dbDiff?: { rollback: boolean; queries?: number; driver?: string };
  rolledBack?: boolean;
  rollbackStatus?: 'verified' | 'unverified' | 'not_applicable';
  durationMs: number;
  evidence: EvidenceMetadata;
  error?: string;
}
