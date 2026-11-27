import { OumvErrorCode } from './errors.js';

export interface OumvRequest<TMethod extends string = string, TParams = any> {
  jsonrpc: '2.0';
  id: string | number;
  method: TMethod;
  params: TParams;
}

export interface OumvResponse<TResult = any> {
  jsonrpc: '2.0';
  id: string | number;
  /** Echo of `params.requestId` (§2.1) for request correlation (wire 1.6.0). */
  requestId?: string;
  result: TResult;
}

export interface OumvErrorResponse {
  jsonrpc: '2.0';
  id: string | number;
  /** Echo of `params.requestId` (§2.1) for request correlation (wire 1.6.0). */
  requestId?: string;
  error: {
    code: OumvErrorCode | number;
    message: string;
    data?: any;
  };
}

export type OumvMessage = OumvRequest | OumvResponse | OumvErrorResponse;
