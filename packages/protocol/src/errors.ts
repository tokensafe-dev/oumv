/**
 * GENERATED FILE — DO NOT EDIT BY HAND.
 * Source of truth: schemas/errors.json (registryVersion 1).
 * Regenerate with: node scripts/gen-errors.mjs
 * Validated against spec/SPEC.md §5.1 by packages/conformance/test/errors.test.ts.
 */

export enum OumvErrorCode {
  PARSE_ERROR = -32700,
  INTERNAL_ERROR = -32603,
  INVALID_PARAMS = -32602,
  METHOD_NOT_FOUND = -32601,
  INVALID_REQUEST = -32600,
  RATE_LIMITED = -32012,
  VALIDATION_FAILED = -32011,
  STALE_RESOURCE_VERSION = -32010,
  RESOURCE_NOT_FOUND = -32009,
  RUNTIME_UNAVAILABLE = -32008,
  PERMISSION_DENIED = -32007,
  UNSUPPORTED_CAPABILITY = -32006,
  ACTION_NOT_FOUND = -32005,
  TARGET_NOT_FOUND = -32004,
  SECURITY_VIOLATION = -32003,
  SYNTAX_ERROR = -32002,
  CONFLICT_DETECTED = -32001,
}

/** Canonical code -> name mapping (mirrors the registry). */
export const ERROR_CODE_NAMES: Readonly<Record<number, string>> = {
  [OumvErrorCode.PARSE_ERROR]: 'PARSE_ERROR',
  [OumvErrorCode.INTERNAL_ERROR]: 'INTERNAL_ERROR',
  [OumvErrorCode.INVALID_PARAMS]: 'INVALID_PARAMS',
  [OumvErrorCode.METHOD_NOT_FOUND]: 'METHOD_NOT_FOUND',
  [OumvErrorCode.INVALID_REQUEST]: 'INVALID_REQUEST',
  [OumvErrorCode.RATE_LIMITED]: 'RATE_LIMITED',
  [OumvErrorCode.VALIDATION_FAILED]: 'VALIDATION_FAILED',
  [OumvErrorCode.STALE_RESOURCE_VERSION]: 'STALE_RESOURCE_VERSION',
  [OumvErrorCode.RESOURCE_NOT_FOUND]: 'RESOURCE_NOT_FOUND',
  [OumvErrorCode.RUNTIME_UNAVAILABLE]: 'RUNTIME_UNAVAILABLE',
  [OumvErrorCode.PERMISSION_DENIED]: 'PERMISSION_DENIED',
  [OumvErrorCode.UNSUPPORTED_CAPABILITY]: 'UNSUPPORTED_CAPABILITY',
  [OumvErrorCode.ACTION_NOT_FOUND]: 'ACTION_NOT_FOUND',
  [OumvErrorCode.TARGET_NOT_FOUND]: 'TARGET_NOT_FOUND',
  [OumvErrorCode.SECURITY_VIOLATION]: 'SECURITY_VIOLATION',
  [OumvErrorCode.SYNTAX_ERROR]: 'SYNTAX_ERROR',
  [OumvErrorCode.CONFLICT_DETECTED]: 'CONFLICT_DETECTED',
};

/** Known `data.reason` values per code (informative; runtimes MAY add more). */
export const ERROR_CODE_REASONS: Readonly<Record<number, readonly string[]>> = {
  [OumvErrorCode.PARSE_ERROR]: ["malformed_json"],
  [OumvErrorCode.INTERNAL_ERROR]: ["store_failure"],
  [OumvErrorCode.INVALID_PARAMS]: ["missing_target","invalid_level","invalid_params"],
  [OumvErrorCode.METHOD_NOT_FOUND]: ["unknown_method"],
  [OumvErrorCode.INVALID_REQUEST]: ["invalid_envelope"],
  [OumvErrorCode.RATE_LIMITED]: ["rate_limited"],
  [OumvErrorCode.VALIDATION_FAILED]: ["expected_version_required","session_expired","target_not_unique","symbol_required","rename_to_required","hunks_required","duplicate_path","invalid_batch","replacement_forbidden"],
  [OumvErrorCode.STALE_RESOURCE_VERSION]: ["stale_version"],
  [OumvErrorCode.RESOURCE_NOT_FOUND]: ["resource_not_found","file_not_found","patch_target_not_found"],
  [OumvErrorCode.RUNTIME_UNAVAILABLE]: ["sandbox_unavailable"],
  [OumvErrorCode.PERMISSION_DENIED]: ["mutate_disabled","policy_denied"],
  [OumvErrorCode.UNSUPPORTED_CAPABILITY]: ["unsupported_level","unsupported_query","unsupported_mode","capability_not_advertised","unsupported_protocol_version"],
  [OumvErrorCode.ACTION_NOT_FOUND]: ["unknown_action"],
  [OumvErrorCode.TARGET_NOT_FOUND]: ["target_not_found"],
  [OumvErrorCode.SECURITY_VIOLATION]: ["path_traversal","sensitive_path","query_forbidden"],
  [OumvErrorCode.SYNTAX_ERROR]: ["syntax_error"],
  [OumvErrorCode.CONFLICT_DETECTED]: ["version_mismatch","file_exists","target_exists"],
};

export class OumvError extends Error {
  public readonly code: OumvErrorCode;
  public readonly data?: any;

  constructor(code: OumvErrorCode, message: string, data?: any) {
    super(message);
    this.name = 'OumvError';
    this.code = code;
    this.data = data;
    Object.setPrototypeOf(this, OumvError.prototype);
  }
}
