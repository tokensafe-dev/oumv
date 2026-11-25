# OUMV Full-Stack Demo

Minimal runnable demonstration of the **OUMV (Observe · Understand · Mutate · Verify)** retrofit
architecture end-to-end: a **tokensafe-ui** frontend talking to a **FastAPI** backend, both
instrumented, plus TokenSafe's static cross-stack intelligence.

This demo reproduces the MVP acceptance criteria of the
[OUMV Retrofit Architecture](../../spec/SPEC.md) §23.

## Stack

| Layer | Technology | OUMV integration |
| :--- | :--- | :--- |
| Frontend | tokensafe-ui (SolidJS runtime) + Vite | `@tokensafe-ui/vite` dev-server bridge → `/__oumv/rpc` |
| Backend | FastAPI + `tokensafe-python` | `mount_tokensafe(app)` → `/__oumv/rpc` |
| Orchestration | TokenSafe CLI + MCP | `tokensafe integrate`, `oumv_*` MCP tools, static cross-stack graph |

## Quickstart

```bash
# 1. Adopt OUMV in this project (zero-config, non-invasive):
#    writes .tokensafe/oumv.json only — no framework code is modified.
tokensafe integrate

# 2. Backend (terminal 1):
cd backend
pip install -r requirements.txt
uvicorn main:app --port 8000

# 3. Frontend (terminal 2):
cd frontend
npm install
npm run dev          # vite on :5173, /__oumv/rpc auto-mounted
```

## The agent experience (via TokenSafe MCP tools)

```
oumv_status                       → frontend: CONNECTED (tokensafe-ui), backend: CONNECTED (fastapi)
oumv_observe(level="L0")          → FULLSTACK_PULSE: routes, mounted roots, health
oumv_observe(level="L1")          → endpoints + client calls + relationships (cross-stack edges with evidence)
oumv_understand(query="impact", target="/api/orders")
                                  → static graph impact + crossStack frontend callers of the endpoint
oumv_verify(target="POST /api/orders", payload={"title":"Demo"})
                                  → in-memory verification with state diff + honest rollback evidence
oumv_mutate(path="backend/main.py", replacement=..., expectedVersion="sha256:...")
                                  → OCC edit with syntax pre-flight and automatic backup
```

## Cross-stack evidence

`frontend/src/api.ts` calls `fetch('/api/orders')`; `backend/main.py` declares
`@app.post('/api/orders')`. The TokenSafe graph engine links the two statically:

```
frontend.action  fetch /api/orders   ──(static, probable)──▶  backend.endpoint  POST /api/orders
```

`oumv_observe(level="L1")` returns this edge in `relationships` with evidence metadata,
satisfying the MVP criterion *"link at least one frontend API call to a backend endpoint"*.

## Honest verification semantics

- `oumv_verify` reports `rolled_back: true` **only** when an actual ROLLBACK was observed
  (`rollback_status: verified | unverified | not_applicable`).
- `oumv_mutate` returns real `sha256:` version tokens of the written content; rejected
  edits (`SYNTAX_ERROR`, `CONFLICT_DETECTED`, `SECURITY_VIOLATION`) never touch the file.
