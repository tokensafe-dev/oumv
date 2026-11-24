import type { CheckoutRequest, CheckoutResponse } from '../types/checkout.js';

export async function submitCheckout(req: CheckoutRequest): Promise<CheckoutResponse> {
  const res = await fetch('/api/v1/checkout', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-App-Client': 'web-react-19',
    },
    body: JSON.stringify(req),
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({ error: 'Network response was not ok' }));
    throw new Error(errorBody.error || `HTTP ${res.status}`);
  }

  return (await res.json()) as CheckoutResponse;
}
