import type { OumvHandshakeParams, OumvHandshakeResult } from './capabilities.js';
import type { ObserveParams, ObserveResult } from './observe.js';
import type { UnderstandParams, ImpactResult, CausalityResult } from './understand.js';
import type { GetSourceParams, GetSourceResult, ApplyEditParams, ApplyEditResult } from './mutate.js';
import type { VerifyParams, VerifyResult } from './verify.js';

/**
 * Standard OUMV Runtime Adapter Contract.
 * Every frontend framework runtime (agent-dom, React, Vue, Solid)
 * implements this interface to become certified OUMV compliant.
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
}
