// Frontend API client — the static cross-stack link source.
// The TokenSafe graph engine links these fetch('/api/orders') calls to the
// FastAPI endpoint declared in backend/main.py and surfaces the edge (with
// evidence) in oumv_observe(level="L1").relationships.

export interface Order {
  id: number;
  title: string;
  quantity: number;
}

export async function listOrders(): Promise<Order[]> {
  const res = await fetch('/api/orders');
  if (!res.ok) throw new Error(`GET /api/orders failed: ${res.status}`);
  return res.json();
}

export async function createOrder(title: string, quantity = 1): Promise<Order> {
  const res = await fetch('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, quantity }),
  });
  if (!res.ok) throw new Error(`POST /api/orders failed: ${res.status}`);
  return res.json();
}
