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

/**
 * Canonical observe result (spec §4.1): the envelope is `{level, format, data}`;
 * profile-specific fields belong inside `data`; `payload` is the optional YAML
 * rendering of the same information.
 */
// Evidence metadata is referenced by every result schema below.
export const EvidenceMetadataSchema = z.object({
  provenance: z.enum(['static', 'runtime', 'contract', 'inferred', 'external']),
  sourceAdapter: z.string(),
  confidence: z.enum(['confirmed', 'probable', 'unknown']),
  observedAt: z.number().optional(),
  filePath: z.string().optional(),
  lineRange: z.tuple([z.number(), z.number()]).optional(),
  details: z.record(z.any()).optional(),
});

export const ObserveResultSchema = z
  .object({
    level: z.enum(['L0', 'L1', 'L2', 'L3', 'L4']),
    format: z.enum(['yaml', 'json', 'sexp']),
    data: z.record(z.string(), z.any()),
    payload: z.string().optional(),
    tokenEstimate: z.number().optional(),
    evidence: EvidenceMetadataSchema.passthrough().optional(),
  })
  .passthrough();

// Understand Schemas
export const UnderstandParamsSchema = z.object({
  query: z.enum(['impact', 'dependencies', 'causality', 'why_state', 'signals']),
  target: z.string().optional(),
});

export const ImpactResultSchema = z
  .object({
    query: z.literal('impact').optional(),
    target: z.string(),
    impact: z
      .object({
        target: z.string(),
        affectedSymbols: z.array(z.string()).optional(),
        breakingRisk: z.enum(['LOW', 'MEDIUM', 'HIGH', 'UNKNOWN', 'low', 'medium', 'high', 'unknown']).optional(),
        summary: z.string().optional(),
        observed: z.boolean().optional(),
        evidence: EvidenceMetadataSchema.passthrough().optional(),
      })
      .passthrough(),
  })
  .passthrough();

export const CausalityResultSchema = z
  .object({
    query: z.enum(['causality', 'why_state']).optional(),
    target: z.string(),
    causality: z
      .object({
        target: z.string(),
        observed: z.boolean(),
        traceCount: z.number().optional(),
        traceChain: z.array(z.any()).optional(),
        statusCode: z.number().optional(),
        latencyMs: z.number().optional(),
        rootCause: z.string().optional(),
        note: z.string().optional(),
        evidence: EvidenceMetadataSchema.passthrough().optional(),
      })
      .passthrough(),
  })
  .passthrough();

// Evidence & Resource Schemas

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
  // v1.2 (wire 1.3.0): windowed reads and the dedup pointer. `version` stays the
  // sha256 of the whole file, so OCC never depends on the window.
  startLine: z.number().int().min(1).optional(),
  endLine: z.number().int().min(1).optional(),
  ifVersion: z.string().regex(/^sha256:[a-f0-9]{64}$/).optional(),
});

export const GetSourceResultSchema = z
  .object({
    path: z.string(),
    symbol: z.string().optional(),
    version: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    source: z.string().optional(),
    unchanged: z.boolean().optional(),
    startLine: z.number().optional(),
    endLine: z.number().optional(),
    contract: z
      .object({
        target: z.string().optional(),
        componentId: z.string().optional(),
        stateFields: z.array(z.string()).optional(),
        actionNames: z.array(z.string()).optional(),
        elementAgentIds: z.array(z.string()).optional(),
      })
      .optional(),
    evidence: EvidenceMetadataSchema.passthrough().optional(),
  })
  .passthrough();

export const ApplyEditHunkSchema = z.object({
  target: z.string().min(1),
  replacement: z.string(),
  startLine: z.number().int().min(1).optional(),
  endLine: z.number().int().min(1).optional(),
  replaceAll: z.boolean().optional(),
});

export const ApplyEditParamsSchema = z.object({
  path: z.string(),
  symbol: z.string().optional(),
  // `replacement`/`expectedVersion` are conditional on the mode (create forbids the
  // version; delete/rename forbid the replacement), so the schema cannot require both.
  replacement: z.string().optional(),
  expectedVersion: z.string().optional(),
  mode: z.enum(['replace', 'create', 'symbol', 'delete', 'rename', 'patch']).optional(),
  renameTo: z.string().optional(),
  hunks: z.array(ApplyEditHunkSchema).optional(),
});

export const ApplyEditResultSchema = z
  .object({
    status: z.enum(['APPLIED', 'CURRENT']),
    path: z.string(),
    symbol: z.string().optional(),
    newVersion: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    syntaxCheck: z
      .object({
        status: z.enum(['passed', 'skipped', 'failed']),
        tool: z.string().optional(),
        error: z.string().optional(),
      })
      .optional(),
    backupPath: z.string().optional(),
    rollbackHint: z.string().optional(),
  })
  .passthrough();

// Verify Schemas
export const VerifyParamsSchema = z.object({
  target: z.string().optional(),
  componentId: z.string().optional(),
  action: z.string().optional(),
  payload: z.any().optional(),
});

export const VerifyResultSchema = z
  .object({
  status: z.enum(['passed', 'failed']),
  target: z.string().optional(),
  componentId: z.string().optional(),
  action: z.string().optional(),
  diff: z.record(z.any()),
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
  scope: z
    .object({
      checked: z.array(z.string()),
      notExecuted: z.array(z.string()).optional(),
      notSupported: z.array(z.string()).optional(),
    })
    .passthrough()
    .optional(),
  evidence: EvidenceMetadataSchema.passthrough().optional(),
  error: z.string().optional(),
  })
  .passthrough();
