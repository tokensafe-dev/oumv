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
  sandboxDb?: boolean;
}

export interface BackendVerifyResult {
  status: 'passed' | 'failed';
  target: string;
  statusCode?: number;
  responseBody?: any;
  dbDiff?: Record<string, { inserted?: number; modified?: number; deleted?: number }>;
  rolledBack?: boolean;
  durationMs: number;
  evidence: EvidenceMetadata;
  error?: string;
}
