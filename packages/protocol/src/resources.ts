export type EvidenceProvenance = 'static' | 'runtime' | 'contract' | 'inferred' | 'external';
export type EvidenceConfidence = 'confirmed' | 'probable' | 'unknown';

export interface EvidenceMetadata {
  provenance: EvidenceProvenance;
  sourceAdapter: string;
  confidence: EvidenceConfidence;
  observedAt?: number;
  filePath?: string;
  lineRange?: [number, number];
  details?: Record<string, any>;
}

export type ResourceType =
  | 'frontend.component'
  | 'frontend.route'
  | 'frontend.action'
  | 'frontend.state'
  | 'frontend.effect'
  | 'backend.service'
  | 'backend.endpoint'
  | 'backend.handler'
  | 'backend.middleware'
  | 'backend.dto'
  | 'backend.model'
  | 'backend.operation'
  | 'project.dependency'
  | 'project.module'
  | 'project.contract';

export interface ResourceReference {
  id: string;
  type: ResourceType;
  name: string;
  parentRef?: string;
  sourceLocation?: {
    filePath: string;
    lineStart?: number;
    lineEnd?: number;
  };
  versionToken?: string;
  evidence: EvidenceMetadata;
  availableOperations: string[];
  schemaRef?: string;
}

export interface ResourceCollection {
  resources: ResourceReference[];
  total: number;
  provenanceSummary?: Record<EvidenceProvenance, number>;
}
