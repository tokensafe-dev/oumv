import type { OumvHandshakeParams, OumvHandshakeResult } from './capabilities.js';
import type { ObserveParams, ObserveResult } from './observe.js';
import type { UnderstandParams, ImpactResult, CausalityResult } from './understand.js';
import type { GetSourceParams, GetSourceResult, ApplyEditParams, ApplyEditResult } from './mutate.js';
import type { VerifyParams, VerifyResult } from './verify.js';
import type { PreviewEditParams, PreviewEditResult } from './preview.js';
import type { IndexParams, IndexResult } from './symbols.js';
import type { QueryParams, QueryResult } from './query.js';
import type { BuildParams, BuildResult } from './build.js';
import type { CancelParams, CancelResult } from './session.js';

/**
 * Standard OUMV Runtime Adapter Contract.
 * Every frontend framework runtime (tokensafe-ui, React, Vue, Solid)
 * implements this interface to become certified OUMV compliant.
 *
 * The wire 1.6.0 methods (previewEdit/index/query/build/cancel) are OPTIONAL:
 * a runtime that does not implement them answers -32601 like any unknown
 * method, and agents MUST fall back to their own tools (spec §14).
 */
export interface OumvRuntimeAdapter {
  readonly name: string;
  readonly version: string;

  /**
   * Initializes session and exchanges capabilities with the agent.
   */
  handshake(params?: OumvHandshakeParams): Promise<OumvHandshakeResult>;

  /**
   * Pillar 1: Progressive semantic context observation (L0-L4).
   */
  observe(params: ObserveParams): Promise<ObserveResult>;

  /**
   * Pillar 2: Impact analysis and runtime causality telemetry.
   */
  understand(
    params: UnderstandParams
  ): Promise<ImpactResult | CausalityResult | { yaml: string }>;

  /**
   * Pillar 3A: Retrieves symbol-level source with OCC version token.
   */
  getSource(params: GetSourceParams): Promise<GetSourceResult>;

  /**
   * Pillar 3B: Applies symbol-level source edit with OCC and syntax verification.
   */
  applyEdit(params: ApplyEditParams): Promise<ApplyEditResult>;

  /**
   * Pillar 4: Sub-millisecond to low-millisecond local action verification.
   */
  verify(params: VerifyParams): Promise<VerifyResult>;

  /** §4.4 dry-run of applyEdit (optional, wire 1.6.0, capability mutate.preview). */
  previewEdit?(params: PreviewEditParams): Promise<PreviewEditResult>;

  /** §14.1 repo-wide symbol search (optional, wire 1.6.0, capability index.symbols). */
  index?(params: IndexParams): Promise<IndexResult>;

  /** §14.2 read-only data access (optional, wire 1.6.0, capability observeQuery.readOnly). */
  query?(params: QueryParams): Promise<QueryResult>;

  /** §14.3 build/test diagnostics (optional, wire 1.6.0, capability verify.build). */
  build?(params: BuildParams): Promise<BuildResult>;

  /** §3 best-effort cancellation (optional, wire 1.6.0, capability sessions.cancel). */
  cancel?(params: CancelParams): Promise<CancelResult>;
}
