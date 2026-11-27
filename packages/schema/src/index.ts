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
  ApplyEditBatchParams,
  ApplyEditBatchResult,
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
  // Wire 1.5.0: the client may ask for a shorter lifetime; runtimes clamp to 1..86400.
  sessionTtlSeconds: z.number().int().min(1).max(86400).optional(),
});

export const OumvHandshakeResultSchema = z.object({
  protocolVersion: z.string(),
  runtimeInfo: z.object({
    name: z.string(),
    version: z.string(),
  }),
  sessionId: z.string().min(1).optional(),
  ttlSeconds: z.number().int().min(1).max(86400).optional(),
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
      multiFile: z.boolean().optional(),
      preview: z.boolean().optional(),
    }),
    verify: z.object({
      multiMetric: z.boolean(),
      surfaceDiff: z.boolean(),
      sandboxRollback: z.boolean().optional(),
      build: z.boolean().optional(),
    }),
    sessions: z
      .object({
        ttlSeconds: z.boolean().optional(),
        cancel: z.boolean().optional(),
        idempotency: z.boolean().optional(),
      })
      .optional(),
    index: z
      .object({ symbols: z.boolean() })
      .optional(),
    observeQuery: z
      .object({ readOnly: z.boolean() })
      .optional(),
    events: z
      .object({ diagnostic: z.boolean() })
      .optional(),
    transports: z
      .array(z.enum(['http', 'sse', 'ws', 'stdio', 'memory', 'batch']))
      .optional(),
  }),
});

// Observe Schemas
export const ObserveParamsSchema = z.object({
  level: z.enum(['L0', 'L1', 'L2', 'L3', 'L4']),
  format: z.enum(['yaml', 'json', 'sexp']).default('yaml'),
  componentId: z.string().optional(),
  // §8 freshness handshake (wire 1.6.0).
  ifVersion: z.string().regex(/^sha256:[a-f0-9]{64}$/).optional(),
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
  query: z.enum(['impact', 'dependencies', 'causality', 'why_state', 'signals', 'flow']),
  target: z.string().optional(),
  // §8 freshness handshake (wire 1.6.0), mirroring observe.
  ifVersion: z.string().regex(/^sha256:[a-f0-9]{64}$/).optional(),
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
  // Wire 1.6.0 correlation/idempotency fields (§2.1/§3) accepted on every method.
  sessionId: z.string().optional(),
  requestId: z.string().optional(),
  timeoutMs: z.number().int().positive().optional(),
  idempotencyKey: z.string().optional(),
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

// Wire 1.5.0: multi-file atomic mutation. Every item is validated and
// syntax-checked before the first byte is written, so a failure leaves no bytes.
export const ApplyEditBatchItemSchema = z.object({
  path: z.string(),
  mode: z.enum(['replace', 'create', 'patch']).optional(),
  expectedVersion: z.string().regex(/^sha256:[a-f0-9]{64}$/).optional(),
  replacement: z.string().optional(),
  hunks: z.array(ApplyEditHunkSchema).optional(),
});

export const ApplyEditBatchParamsSchema = z.object({
  edits: z.array(ApplyEditBatchItemSchema).min(1).max(16),
});

export const ApplyEditBatchResultSchema = z
  .object({
    status: z.literal('APPLIED'),
    edits: z
      .array(
        z.object({
          path: z.string(),
          newVersion: z.string().regex(/^sha256:[a-f0-9]{64}$/),
          created: z.boolean().optional(),
          hunksApplied: z.number().int().min(1).optional(),
        })
      )
      .min(1),
  })
  .passthrough();

// Verify Schemas
export const VerifyParamsSchema = z.object({
  target: z.string().optional(),
  componentId: z.string().optional(),
  action: z.string().optional(),
  payload: z.any().optional(),
  method: z.string().optional(),
  headers: z.record(z.string()).optional(),
  steps: z
    .array(
      z.object({
        target: z.string(),
        action: z.string().optional(),
        payload: z.any().optional(),
      })
    )
    .optional(),
  sandbox: z
    .object({
      mode: z.enum(['rollback']),
    })
    .optional(),
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
  rolledBack: z.boolean().optional(),
  rollbackStatus: z.enum(['verified', 'unverified', 'not_applicable']).optional(),
  dbDiff: z
    .object({
      rollback: z.boolean(),
      queries: z.number().int().nonnegative().optional(),
      driver: z.string().optional(),
    })
    .optional(),
  error: z.string().optional(),
  })
  .passthrough();

// Wire 1.6.0 method schemas (spec §2.1/§3/§4.4/§14)
const CorrelationFieldsSchema = {
  sessionId: z.string().optional(),
  requestId: z.string().optional(),
  timeoutMs: z.number().int().positive().optional(),
};

export const PreviewEditParamsSchema = z
  .object({
    ...CorrelationFieldsSchema,
    idempotencyKey: z.string().optional(),
    path: z.string().optional(),
    mode: z.enum(['replace', 'create', 'patch', 'symbol', 'delete', 'rename']).optional(),
    symbol: z.string().optional(),
    renameTo: z.string().optional(),
    replacement: z.string().optional(),
    hunks: z.array(ApplyEditHunkSchema).optional(),
    expectedVersion: z.string().optional(),
    edits: z.array(ApplyEditBatchItemSchema).min(1).max(16).optional(),
  })
  .refine((v) => !(v.edits && (v.path !== undefined || v.hunks !== undefined)), {
    message: 'batch edits and single-edit fields are mutually exclusive (§4.4)',
  });

export const PreviewItemSchema = z
  .object({
    path: z.string(),
    mode: z.enum(['replace', 'create', 'patch', 'symbol', 'delete', 'rename']),
    unchanged: z.boolean().optional(),
    currentVersion: z.string().regex(/^sha256:[a-f0-9]{64}$/).optional(),
    newVersion: z.string().regex(/^sha256:[a-f0-9]{64}$/).optional(),
    diff: z.string().optional(),
    syntaxCheck: z
      .object({
        status: z.enum(['passed', 'failed', 'skipped']),
        tool: z.string().optional(),
        error: z.string().optional(),
      })
      .optional(),
    wouldApply: z.boolean(),
  })
  .passthrough();

export const PreviewEditResultSchema = z
  .object({
    status: z.literal('PREVIEW'),
    applied: z.literal(false),
    previews: z.array(PreviewItemSchema).min(1),
  })
  .passthrough();

export const IndexParamsSchema = z.object({
  ...CorrelationFieldsSchema,
  query: z.string().min(1),
  kinds: z.array(z.string()).optional(),
  scope: z.string().optional(),
  limit: z.number().int().min(1).max(200).optional(),
});

export const IndexMatchSchema = z.object({
  resourceId: z.string(),
  name: z.string(),
  kind: z.string(),
  file: z.string(),
  lines: z.tuple([z.number(), z.number()]),
  signature: z.string().optional(),
  refs: z.number().int().min(0).optional(),
  match: z.enum(['exact', 'prefix', 'qualified-suffix', 'substring']),
  evidence: z.record(z.any()).optional(),
});

export const IndexResultSchema = z
  .object({
    matches: z.array(IndexMatchSchema),
    truncated: z.boolean(),
    totalMatches: z.number().int().min(0).optional(),
  })
  .passthrough();

export const QueryParamsSchema = z.object({
  ...CorrelationFieldsSchema,
  sql: z.string().min(1),
  params: z.array(z.any()).optional(),
  limit: z.number().int().min(1).max(1000).optional(),
});

export const QueryResultSchema = z
  .object({
    columns: z.array(z.string()),
    rows: z.array(z.array(z.any())),
    rowCount: z.number().int().min(0),
    truncated: z.boolean(),
  })
  .passthrough();

export const BuildParamsSchema = z.object({
  ...CorrelationFieldsSchema,
  command: z.string().optional(),
  target: z.string().optional(),
});

export const DiagnosticEventSchema = z.object({
  severity: z.enum(['error', 'warning', 'info']),
  source: z.enum(['build', 'test', 'hmr', 'tool']),
  message: z.string(),
  file: z.string().optional(),
  line: z.number().int().min(1).optional(),
  tool: z.string().optional(),
  reason: z.string().optional(),
  ts: z.number().optional(),
});

export const BuildResultSchema = z
  .object({
    status: z.enum(['passed', 'failed', 'skipped']),
    command: z.string(),
    diagnostics: z.array(DiagnosticEventSchema),
    durationMs: z.number().optional(),
    truncated: z.boolean().optional(),
    skipReason: z.string().optional(),
  })
  .passthrough();

export const CancelParamsSchema = z
  .object({
    sessionId: z.string().optional(),
    requestId: z.string().optional(),
    target: z.enum(['last']).optional(),
  })
  .refine((v) => Boolean(v.requestId) !== Boolean(v.target), {
    message: 'cancel takes exactly one of requestId / target:"last"',
  });

export const CancelResultSchema = z
  .object({
    cancelled: z.boolean(),
    requestId: z.string().optional(),
    finished: z.boolean().optional(),
  })
  .passthrough();
