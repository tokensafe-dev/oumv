export enum OumvErrorCode {
  CONFLICT_DETECTED = -32001,
  SYNTAX_ERROR = -32002,
  SECURITY_VIOLATION = -32003,
  COMPONENT_NOT_FOUND = -32004,
  ACTION_NOT_FOUND = -32005,
  UNSUPPORTED_CAPABILITY = -32006,
  INTERNAL_ERROR = -32603,
}

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
