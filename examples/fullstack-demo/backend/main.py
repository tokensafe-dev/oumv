"""OUMV full-stack demo backend: FastAPI + tokensafe-python runtime.

The runtime mounts /__oumv/rpc and /__oumv/health, auto-discovers routes and
Pydantic schemas, and writes the .tokensafe/runtime.json beacon for zero-config
discovery by the TokenSafe OUMV Gateway.
"""

from fastapi import FastAPI
from pydantic import BaseModel

from tokensafe_python import mount_tokensafe


class OrderCreate(BaseModel):
    title: str
    quantity: int = 1


class OrderResponse(BaseModel):
    id: int
    title: str
    quantity: int


app = FastAPI(title="Orders API", version="1.0.0")

_orders: list[OrderResponse] = []
_next_id = 1


@app.get("/api/orders", response_model=list[OrderResponse])
def list_orders() -> list[OrderResponse]:
    """Lists all orders."""
    return _orders


@app.post("/api/orders", response_model=OrderResponse, status_code=201)
def create_order(order: OrderCreate) -> OrderResponse:
    """Creates a new order."""
    global _next_id
    created = OrderResponse(id=_next_id, title=order.title, quantity=order.quantity)
    _next_id += 1
    _orders.append(created)
    return created


# OUMV instrumentation: auto-introspection + JSON-RPC endpoint.
# Mount AFTER registering routes so introspection sees them.
# Optional: pass a SQLAlchemy engine to enable transactional dry-run rollback evidence.
mount_tokensafe(app)
