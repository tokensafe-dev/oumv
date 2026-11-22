export type ObserveLevel = 'L0' | 'L1' | 'L2' | 'L3' | 'L4';
export type ObserveFormat = 'yaml' | 'json' | 'sexp';

export interface ObserveParams {
  level: ObserveLevel;
  format?: ObserveFormat;
  componentId?: string;
}

export interface ObserveResult {
  level: ObserveLevel;
  format: ObserveFormat;
  payload: string;
  tokenEstimate?: number;
  timestamp: number;
}
