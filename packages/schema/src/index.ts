import { z } from 'zod';
import type {
  OumvHandshakeParams,
  OumvHandshakeResult,
  ObserveParams,
  ObserveResult,
  UnderstandParams,
  ImpactResult,
  CausalityResult,
  GetSourceParams,
  GetSourceResult,
  ApplyEditParams,
  ApplyEditResult,
  VerifyParams,
  VerifyResult,
} from '@oumv/protocol';

// Handshake Schemas
export const OumvHandshakeParamsSchema = z.object({
  protocolVersion: z.string(),
  clientInfo: z
    .object({
      name: z.string(),
      version: z.string(),
    })
    .optional(),
  requestedCapabilities: z.record(z.any()).optional(),
});

export const OumvHandshakeResultSchema = z.object({
  protocolVersion: z.string(),
  runtimeInfo: z.object({
    name: z.string(),
    version: z.string(),
  }),
  capabilities: z.object({
    observe: z.object({
      levels: z.array(z.enum(['L0', 'L1', 'L2', 'L3', 'L4'])),
      formats: z.array(z.enum(['yaml', 'json', 'sexp'])),
    }),
    understand: z.object({
      causality: z.boolean(),
      signalsGraph: z.boolean(),
      impactAnalysis: z.boolean(),
    }),
    mutate: z.object({
      occ: z.boolean(),
      syntaxGuard: z.boolean(),
      ephemeralDispatch: z.boolean(),
    }),
    verify: z.object({
      multiMetric: z.boolean(),
      surfaceDiff: z.boolean(),
    }),
  }),
});

// Observe Schemas
export const ObserveParamsSchema = z.object({
  level: z.enum(['L0', 'L1', 'L2', 'L3', 'L4']),
  format: z.enum(['yaml', 'json', 'sexp']).default('yaml'),
  componentId: z.string().optional(),
});

export const ObserveResultSchema = z.object({
  level: z.enum(['L0', 'L1', 'L2', 'L3', 'L4']),
  format: z.enum(['yaml', 'json', 'sexp']),
  payload: z.string(),
  tokenEstimate: z.number().optional(),
  timestamp: z.number(),
});

// Understand Schemas
export const UnderstandParamsSchema = z.object({
  query: z.enum(['impact', 'dependencies', 'causality', 'why_state', 'signals']),
  target: z.string().optional(),
});

export const ImpactResultSchema = z.object({
  target: z.string(),
  directlyAffected: z.array(z.string()),
  indirectlyAffected: z.array(z.string()),
  safeComponents: z.array(z.string()),
  recommendation: z.string(),
});

export const CausalityResultSchema = z.object({
  target: z.string(),
  componentId: z.string(),
  stateKey: z.string(),
  value: z.any(),
  subscribers: z.array(
    z.object({
      id: z.string(),
      name: z.string().optional(),
      kind: z.string(),
    })
  ),
  lastMutation: z
    .object({
      actionName: z.string().optional(),
      timestamp: z.number().optional(),
      oldValue: z.any().optional(),
      newValue: z.any().optional(),
    })
    .optional(),
  explanation: z.string(),
});

// Evidence & Resource Schemas
export const EvidenceMetadataSchema = z.object({
  provenance: z.enum(['static', 'runtime', 'contract', 'inferred', 'external']),
  sourceAdapter: z.string(),
  confidence: z.enum(['confirmed', 'probable', 'unknown']),
  observedAt: z.number().optional(),
  filePath: z.string().optional(),
  lineRange: z.tuple([z.number(), z.number()]).optional(),
  details: z.record(z.any()).optional(),
});

export const ResourceReferenceSchema = z.object({
  id: z.string(),
  type: z.enum([
    'frontend.component',
    'frontend.route',
    'frontend.action',
    'frontend.state',
    'frontend.effect',
    'backend.service',
    'backend.endpoint',
    'backend.handler',
    'backend.middleware',
    'backend.dto',
    'backend.model',
    'backend.operation',
    'project.dependency',
    'project.module',
    'project.contract',
  ]),
  name: z.string(),
  parentRef: z.string().optional(),
  sourceLocation: z
    .object({
      filePath: z.string(),
      lineStart: z.number().optional(),
      lineEnd: z.number().optional(),
    })
    .optional(),
  versionToken: z.string().optional(),
  evidence: EvidenceMetadataSchema,
  availableOperations: z.array(z.string()),
  schemaRef: z.string().optional(),
});

// Mutate Schemas
export const GetSourceParamsSchema = z.object({
  target: z.string().optional(),
  componentId: z.string().optional(),
  filePath: z.string(),
});

export const GetSourceResultSchema = z.object({
  target: z.string().optional(),
  componentId: z.string().optional(),
  filePath: z.string(),
  version: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  source: z.string(),
  contract: z
    .object({
      target: z.string().optional(),
      componentId: z.string().optional(),
      stateFields: z.array(z.string()).optional(),
      actionNames: z.array(z.string()).optional(),
      elementAgentIds: z.array(z.string()).optional(),
    })
    .optional(),
  evidence: EvidenceMetadataSchema.optional(),
});

export const ApplyEditParamsSchema = z.object({
  filePath: z.string(),
  source: z.string(),
  expectedVersion: z.string(),
});

export const ApplyEditResultSchema = z.object({
  success: z.boolean(),
  filePath: z.string(),
  version: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  message: z.string().optional(),
});

// Verify Schemas
export const VerifyParamsSchema = z.object({
  target: z.string().optional(),
  componentId: z.string().optional(),
  action: z.string(),
  payload: z.any().optional(),
});

export const VerifyResultSchema = z.object({
  status: z.enum(['passed', 'failed']),
  target: z.string().optional(),
  componentId: z.string().optional(),
  action: z.string(),
  diff: z.record(
    z.object({
      before: z.any(),
      after: z.any(),
    })
  ),
  surfaceDiff: z
    .array(
      z.object({
        op: z.enum(['attr', 'text', 'visibility']),
        target: z.string(),
        attr: z.string().optional(),
        before: z.any().optional(),
        after: z.any().optional(),
      })
    )
    .optional(),
  timings: z
    .object({
      t_action_ms: z.number(),
      t_schema_ms: z.number(),
      t_propagation_ms: z.number(),
      t_dom_ms: z.number(),
      t_total_ms: z.number(),
    })
    .optional(),
  durationMs: z.number(),
  evidence: EvidenceMetadataSchema.optional(),
  error: z.string().optional(),
});
