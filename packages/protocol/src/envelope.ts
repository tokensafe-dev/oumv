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
  result: TResult;
}

export interface OumvErrorResponse {
  jsonrpc: '2.0';
  id: string | number;
  error: {
    code: OumvErrorCode | number;
    message: string;
    data?: any;
  };
}

export type OumvMessage = OumvRequest | OumvResponse | OumvErrorResponse;
