# The OUMV Protocol Specification (v1.5-canonical)
**The Universal Agent-Runtime Protocol (UARP)**

- **Date**: 2026-11-22 (v1.0 draft) · 2026-11-26 (v1.0.0 frozen; document revision v1.4-canonical) · 2026-11-26 (v1.1.0; revision v1.5-canonical, wire `protocolVersion` 1.2.0)  
- **Status**: Stable — v1.1.0  
- **Author**: Oleg Savelev  
- **Repository**: [github.com/tokensafe-dev/oumv](https://github.com/tokensafe-dev/oumv)

---

## 1. Abstract

The **OUMV Protocol** (Observe, Understand, Mutate, Verify) defines an open, transport-agnostic standard for autonomous AI coding agents to inspect, reason about, modify, and verify running software systems (user interfaces, backend services, APIs) in real time.

Much like the **Language Server Protocol (LSP)** decouples code intelligence from editor implementations, and the **Model Context Protocol (MCP)** standardizes tool calling for LLMs, **OUMV (The Universal Agent-Runtime Protocol)** decouples agent runtime interaction from technology stacks (tokensafe-ui, React; tokensafe-backend, Go, Node, Python). Vue and Solid adapters are planned; the protocol is not UI-only and both profiles share one wire contract.

```text
       AI Coding Agent (Claude Code / Codex / Antigravity)
                             │
                             ▼
               [ OUMV Protocol Specification ]
        (Observe · Understand · Mutate · Verify Interfaces)
                             │
            ┌────────────────┴────────────────┐
            ▼                                 ▼
   [ OUMV Frontend Adapters ]        [ OUMV Backend Adapters ]
 (tokensafe-ui, React, Vue)        (tokensafe-backend, Go, Node)
```

---

## 2. Transports & Wire Framing

OUMV is strictly decoupled from transport. An adapter MAY expose:
1. **In-Memory JavaScript/TypeScript Function Calls** (zero serialization overhead for co-located test runners).
2. **JSON-RPC 2.0 over HTTP POST / Server-Sent Events (SSE)** (ideal for local DevServers, e.g. `/__oumv/rpc`).
3. **JSON-RPC 2.0 over WebSocket** (real-time bi-directional event streaming).
4. **Model Context Protocol (MCP) Tools Bridge** (mapping OUMV tools to LLM function declarations).

### 2.1 Protocol Envelope

Every JSON-RPC message conforms to the standard envelope:

```json
{
  "jsonrpc": "2.0",
  "id": "req-101",
  "method": "oumv/observe",
  "params": { ... }
}
```

Success Response:
```json
{
  "jsonrpc": "2.0",
  "id": "req-101",
  "result": { ... }
}
```

Error Response:
```json
{
  "jsonrpc": "2.0",
  "id": "req-101",
  "error": {
    "code": -32001,
    "message": "CONFLICT_DETECTED",
    "data": { ... }
  }
}
```

### 2.2 HTTP binding (MUST for every adapter)

* Endpoint: `POST <base>/__oumv/rpc` (other paths allowed, discovery advertises them).
* Body: one JSON-RPC object **or** an array (batch). Batch responses are arrays in any
  order; notifications (no `id`) get no entry.
* `Content-Type: application/json` required; anything else → `-32600` with HTTP 415.
* HTTP status is **200 for every well-formed request**, including JSON-RPC errors
  (`error` field carries the code). 4xx is reserved for transport failures:
  401/403 auth, 405 wrong method, 413 body too large.
* Auth: `X-OUMV-Session-Token` or `Authorization: Bearer <token>`. Loopback development
  MAY leave it empty; a non-loopback bind MUST require it.
* Bodies above `maxBodyBytes` (default 8 MiB) → HTTP 413.

### 2.3 SSE binding (optional, MUST be advertised)

* Endpoint: `GET <base>/__oumv/events` with `Accept: text/event-stream`.
* Events: `trace` (`oumv/observe` L4 entries), `state` (resource changed), `heartbeat`
  (every 15 s). Each event has an `id:`; reconnecting with `Last-Event-ID` replays from
  that id. Server MAY filter by `?target=` / `?types=`.
* SSE is one-way: requests still go over HTTP (§2.2).

### 2.4 WebSocket binding (optional, MUST be advertised)

* Upgrade on `<base>/__oumv/rpc`; frames are JSON-RPC 2.0 objects (text frames), one
  message per frame; batch arrays allowed.
* Server-initiated notifications use `"method": "notifications/oumv.trace"` /
  `"notifications/oumv.state"` with `params.sessionId`.
* After `oumv/handshake` the connection is bound to that `sessionId`; closing the socket
  ends the session.

### 2.5 stdio binding (headless adapters/tools)

Newline-delimited JSON-RPC, one object per line, stdout only for responses, diagnostics
to stderr. Used by CLI/MCP bridges; no batching requirement.

---

## 3. Session Lifecycle & Capability Negotiation

A session begins with `oumv/handshake` and ends with `oumv/disconnect` or a TTL expiry.

* The runtime issues `sessionId` (opaque string, unique per workspace) in the handshake
  result together with `ttlSeconds` (default 3600). The agent sends it back as
  `params.sessionId` on every call; a runtime MAY accept calls without it (stateless
  mode) but MUST then treat capabilities as re-negotiated per call.
* Concurrent sessions per workspace are allowed; mutations are serialised by OCC, not by
  session locks.
* `notifications/oumv.trace` and other server-initiated messages are only sent on
  transports that support them (SSE, WebSocket); see §2.1.
* An expired or unknown `sessionId` MUST return `-32011 VALIDATION_FAILED` with
  `data.reason = "session_expired"` — the agent re-handshakes.

### 3.1 Handshake (`oumv/handshake`)

Upon establishing a connection, the agent and runtime exchange capabilities:

**Client Request:**
```json
{
  "protocolVersion": "1.1.0",
  "clientInfo": { "name": "Antigravity", "version": "2.0.0" },
  "supportedTransports": ["http", "memory"],
  "requestedCapabilities": {
    "observe": { "levels": ["L0", "L1", "L2", "L3", "L4"], "formats": ["yaml", "json"] },
    "understand": { "causality": true, "signalsGraph": true },
    "mutate": { "occ": true, "syntaxGuard": true },
    "verify": { "multiMetric": true, "surfaceDiff": true }
  }
}
```

**Server Response:**
```json
{
  "protocolVersion": "1.1.0",
  "profile": "frontend",
  "runtimeInfo": { "name": "tokensafe-ui", "version": "0.1.22" },
  "capabilities": {
    "observe": { "levels": ["L0", "L1", "L2", "L3", "L4"], "formats": ["yaml", "json"] },
    "understand": { "causality": true, "signalsGraph": true },
    "mutate": { "occ": true, "syntaxGuard": true },
    "verify": { "multiMetric": true, "surfaceDiff": true }
  }
}
```

**Negotiation rules (normative).**

1. `protocolVersion` is the version the runtime actually implements; a runtime MUST NOT echo a version it does not serve.
2. `profile` MUST be `"frontend"` or `"backend"` (spec §7). A runtime serving both reports the profile of the surface the agent is attached to.
3. A runtime MUST either honour `requestedCapabilities` (returning only the requested capabilities it implements) or return the full implemented set and omit the rest. It MUST NOT advertise a level, method or capability it cannot serve: over-claiming is a conformance failure (§10).
4. `requestedCapabilities` is advisory. Runtimes that cannot negotiate (older adapters) return their static capability set, and the agent MUST treat absent keys as unsupported.

---

## 4. The Four Pillars

All payloads below are **normative**. Field names are exact; unknown fields are allowed
but MUST be ignored. A runtime MUST NOT emit the deprecated aliases listed in §4.6.

### 4.1 OBSERVE (`oumv/observe`)

Request: `{ "level": "L0"|"L1"|"L2"|"L3"|"L4", "format": "json" (default), "target": string?, "limit": integer?, "cursor": string? }`

Response envelope (all levels):
```json
{ "level": "L2", "format": "json", "data": { ... }, "tokenEstimate": 80, "evidence": { "provenance": "runtime", "sourceAdapter": "go-gin", "confidence": "confirmed" } }
```

`data` per level and profile:

| Level | Backend profile | Frontend profile |
| :--- | :--- | :--- |
| L0 | `{status: "HEALTHY"\|"DEGRADED"\|"ERROR", uptimeSeconds, goroutines?, memoryAllocMB?, activeRoutes, errorCount1m}` | `{route, mountedRoots[], errorCount, loading}` |
| L1 | `{endpoints: [{method, path, handlerName, middlewares?}], hasMore?, nextCursor?}` | `{elements: [{id, tag, role?, label?, action?}], hasMore?, nextCursor?}` |
| L2 | `{target, method?, path?, handlerName?, requestDTO?, responseDTO?, middlewares?, note?}` | `{target, componentId, propsSchema?, actions[], effects[], contracts[]}` |
| L3 | `{path, symbol?, source, version: "sha256:…", startLine, endLine}` | same, `path` = component file |
| L4 | `{target?, traces: [{method, path, route?, handler?, statusCode, durationMs, timestamp}], traceCount, note?, hasMore?, nextCursor?}` | `{target?, events: [{type, signal?, value?, timestamp}], count, hasMore?, nextCursor?}` |

Rules: `target` is required for L2/L3; a target that cannot be resolved is `-32009`.
`limit` and `cursor` page L1/L4 collections: `limit` is the maximum number of items
returned (the adapter may cap it), `cursor` is the opaque `nextCursor` from a previous
response. When a page is truncated the response MUST carry `hasMore: true` and a
`nextCursor` string; the last page carries `hasMore: false` and no cursor. Adapters that
return a collection in one response MAY omit both fields (that means "complete").
`tokenEstimate` is the number of tokens in the returned `payload`/`data` under the
adapter's documented tokenizer — never an estimate of the whole conversation. It is
advisory (agents use it to budget an observation before making it) and MUST be omitted
rather than guessed when the adapter has no calibrated tokenizer.
`format` is a rendering hint: an adapter MAY return an additional `payload` string when
`format` is `"yaml"` — the same information as `data`, rendered for token efficiency.
`data` stays structured in every format, so an agent never has to parse YAML to act.
`version` at L3 MUST be `"sha256:" + sha256(bytes of the returned source)`. An empty
collection MUST be returned as `[]` with a `note`, never as an error.

### 4.2 UNDERSTAND (`oumv/understand`)

Request: `{ "query": "impact"|"causality"|"why_state"|"dependencies"|"signals", "target": string }`

Impact:
```json
{ "query": "impact", "target": "GET /api/orders",
  "impact": { "target": "GET /api/orders", "affectedSymbols": ["handler.CreateOrder"], "breakingRisk": "LOW"|"MEDIUM"|"HIGH"|"UNKNOWN",
              "summary": "…", "observed": false, "evidence": { "provenance": "static", "sourceAdapter": "go-gin", "confidence": "probable" } } }
```
Causality / why_state:
```json
{ "query": "causality", "target": "GET /api/orders",
  "causality": { "target": "GET /api/orders", "observed": true, "traceCount": 3, "traceChain": ["GET /api/orders", "handler.CreateOrder"],
                 "statusCode": 500, "latencyMs": 12.4, "rootCause": "…", "note": "…", "evidence": { "provenance": "runtime", "sourceAdapter": "go-gin", "confidence": "confirmed" } } }
```
`observed=false` MUST come with `note` explaining what evidence is missing; a runtime that
never observed an execution MUST NOT return a root cause.

### 4.3 MUTATE — source (`oumv/getSource`, `oumv/applyEdit`)

`getSource`: request `{path, symbol?}` → `{path, symbol?, source, version, startLine, endLine}`.

`applyEdit`: request `{path, symbol?, replacement?, expectedVersion?, mode?: "replace"|"create"|"symbol"|"delete"|"rename", renameTo?}` → 
```json
{ "status": "APPLIED"|"CURRENT", "path": "src/api/orders.go", "symbol": "CreateOrder",
  "newPath": "src/api/orders_v2.go", "newVersion": "sha256:…", "created": true, "deleted": true,
  "syntaxCheck": { "status": "passed"|"skipped"|"failed", "tool": "go/parser", "error": "…" },
  "backupPath": "/…/.tokensafe/backups/…", "rollbackHint": "…" }
```

`mode` selects the mutation (default `"replace"`); every mode keeps OCC and the
workspace jail:

* **`replace`** — rewrite an existing file. `replacement` and `expectedVersion` are mandatory.
* **`create`** — write a file that must not exist yet. `expectedVersion` MUST be absent
  (a caller that sends it is asking to replace, not create) and `created: true` is
  returned. Creating a file that already exists is a conflict, never a silent overwrite.
* **`symbol`** — replace only the source range of `symbol` (a function, method or class)
  with `replacement`; the rest of the file is preserved byte for byte. `symbol` and
  `expectedVersion` are mandatory; an unknown symbol is `-32009`. The syntax pre-flight
  runs on the resulting file, not on the fragment alone. This is the mode an agent uses to
  avoid re-emitting a whole file for a one-line change.
* **`delete`** — remove an existing file. `replacement` MUST be absent
  (`-32011`, `data.reason="replacement_forbidden"`), `expectedVersion` is mandatory, and
  the result carries `deleted: true`. The syntax check is `skipped`; the backup is optional.
* **`rename`** — move `path` to `renameTo`. `renameTo` is mandatory and MUST stay inside
  the workspace (both paths are jail-checked); the target MUST NOT exist (`-32001`,
  `data.reason="target_exists"`); `replacement` MUST be absent; `expectedVersion` is
  mandatory on the source. The result carries `newPath`; a rename never rewrites bytes, so
  the syntax check is `skipped`.

Why `create`/`delete`/`rename` are modes and not separate methods: an agent that cannot
express them through the protocol falls back to shell redirects or `mv`, which bypasses
the workspace jail, the syntax pre-flight and the mutation policy — the four pillars would
have a hole exactly where files enter, leave or move in the repository.

Normative guards, in this order (first failure wins):

| # | Guard | Error |
| :--- | :--- | :--- |
| 1 | workspace boundary / sensitive path (source and `renameTo`) | `-32003 SECURITY_VIOLATION` |
| 2 | resource exists (`-32009`), or target must not exist for `create`/`rename` (`-32001`, `data.reason="file_exists"` / `"target_exists"`) | `-32009` / `-32001` |
| 3 | syntax pre-flight of the resulting file (`replace`/`create`/`symbol`; `skipped` for `delete`/`rename`) | `-32002 SYNTAX_ERROR` |
| 4 | `expectedVersion` rules: present for `replace`/`symbol`/`delete`/`rename`, absent for `create`; forbidden `replacement`/`renameTo` fields | `-32011 VALIDATION_FAILED` |
| 5 | `expectedVersion` matches current bytes | `-32001 CONFLICT_DETECTED` |
| 6 | policy allows mutation | `-32007 PERMISSION_DENIED` |

`expectedVersion` is **mandatory** for every mutation of an existing file; a write without
it is never accepted. Backups are the previous bytes; the path is reported in `backupPath`
when the runtime keeps one (`create` has no previous bytes, so no backup). A `symbol` edit
without `symbol` is `-32011` (`data.reason="symbol_required"`); a `rename` without
`renameTo` is `-32011` (`data.reason="rename_to_required"`).

### 4.4 VERIFY (`oumv/verify`)

Request: `{target, method?, action?, payload?, headers?, steps?}` → 
```json
{ "status": "passed"|"failed", "target": "POST /api/orders", "statusCode": 409,
  "steps": [{ "target": "POST /api/orders", "statusCode": 201, "status": "passed", "responseBody": "…" },
            { "target": "POST /api/orders", "statusCode": 409, "status": "failed", "responseBody": "…" }],
  "diff": { "…": { "before": …, "after": … } }, "surfaceDiff": [{ "op": "attr"|"text"|"visibility", "target": "…", "before": "…", "after": "…" }],
  "timings": { "t_action_ms": 0.1, "t_schema_ms": 0, "t_propagation_ms": 0.2, "t_dom_ms": 0, "t_total_ms": 0.3 },
  "durationMs": 0.3,
  "scope": { "checked": ["in-memory dispatch"], "notExecuted": ["real network"], "notSupported": ["browser DOM"] },
  "rolledBack": true, "rollbackStatus": "verified"|"unverified"|"not_applicable" }
```
`status` is `passed` iff the dispatched action satisfied the request (HTTP status < 400 for
request targets). `surfaceDiff` is frontend-only. `rolledBack` MUST only be `true` when a
rollback was observed; otherwise `rollbackStatus` says `unverified` or `not_applicable`.
No v1.x runtime implements rollback yet, so both fields are normally **omitted** — an
adapter must not emit `rolledBack: false` to imply a rollback happened and was verified.
`scope` is mandatory: a verifier MUST state what it did not execute.

**Multi-step verify.** `steps` is an ordered array of request targets
(`{target, action?, payload?, headers?}`) executed in order **against one application
instance**, so state created by an earlier step is visible to later ones. This is how an
agent reproduces a bug that needs two calls (create, then repeat the idempotency key). When
`steps` is present the top-level `target`/`action`/`payload` describe the scenario, not an
extra dispatch. The response carries one `steps[]` entry per request with its own
`statusCode`, `status` and `responseBody`; the top-level `status` is `passed` when every
step was dispatched (a `4xx` inside a scenario is an observation, not a protocol failure).
A runtime that cannot share state across steps MUST reject `steps` with `-32006`
(`data.reason="multi_step_unsupported"`) instead of silently running them isolated.

### 4.5 Target grammar

`target` strings use exactly one of:
* `"METHOD /path"` — backend endpoint (e.g. `"POST /api/orders"`);
* `"/path"` — backend endpoint, method unspecified;
* `"path#symbol"` — source + symbol (`"src/orders.go#CreateOrder"`);
* `"component:<id>"` — frontend component (`"component:CheckoutButton"`).

`componentId` is an accepted alias for `component:<id>`; runtimes MUST NOT require both.

### 4.6 Deprecated aliases (accepted on input, never emitted)

| Canonical | Deprecated alias |
| :--- | :--- |
| `observe.data` | `observe.payload` (string form) |
| `applyEdit.path` | `filePath` |
| `applyEdit.replacement` | `source` |
| `applyEdit` result `status`/`newVersion` | `success`/`version` |
| `verify` result `status` | `success` (boolean) |

Aliases are accepted for one minor version after v1.0 and then removed.

---

## 5. Standard Error Codes

### 5.1 Code table

| Code | Name | Meaning |
| :--- | :--- | :--- |
| **-32700** | `PARSE_ERROR` | Body is not valid JSON. |
| **-32600** | `INVALID_REQUEST` | Not a valid JSON-RPC 2.0 request. |
| **-32601** | `METHOD_NOT_FOUND` | Unknown `oumv/*` method. |
| **-32602** | `INVALID_PARAMS` | Params missing or of the wrong type. |
| **-32001** | `CONFLICT_DETECTED` | `expectedVersion` does not match the current bytes. |
| **-32002** | `SYNTAX_ERROR` | Replacement failed the syntax pre-flight. |
| **-32003** | `SECURITY_VIOLATION` | Path escapes the workspace or targets a sensitive file. |
| **-32004** | `TARGET_NOT_FOUND` | Endpoint/component/symbol target does not exist in the runtime. |
| **-32005** | `ACTION_NOT_FOUND` | Named action/effect is not defined on the target. |
| **-32006** | `UNSUPPORTED_CAPABILITY` | Method/level/query not implemented (never a silent no-op). |
| **-32007** | `PERMISSION_DENIED` | Policy forbids the operation. |
| **-32008** | `RUNTIME_UNAVAILABLE` | Runtime or its sandbox is unreachable. |
| **-32009** | `RESOURCE_NOT_FOUND` | File/resource does not exist. |
| **-32011** | `VALIDATION_FAILED` | Payload violated a contract (incl. missing `expectedVersion`, expired session). |
| **-32603** | `INTERNAL_ERROR` | Unexpected adapter failure. |

`-32010` is reserved and MUST NOT be emitted in v1.0 (it duplicated `-32001`).

### 5.2 Method → code mapping

| Method | Conditions |
| :--- | :--- |
| `handshake` | invalid params `-32602`; unsupported protocol version `-32006` |
| `observe` | unknown level `-32006`; unresolvable target `-32009`; missing target for L2/L3 `-32602` |
| `getSource` | boundary `-32003`; missing file `-32009`; policy `-32007` |
| `applyEdit` | §4.3 guard order |
| `verify` | missing target `-32602`; sandbox unavailable `-32008`; unknown action `-32005` |
| `understand` | unknown query `-32006`; unresolvable target `-32009` |
| any | malformed body `-32700`; unknown method `-32601`; store failure `-32603` |

### 5.3 `error.data`

Error objects MAY carry `data`; when present it is an object with:
`{ "reason": snake_case_string, ...details }`. `reason` is the machine-readable cause
(`"path_traversal"`, `"expected_version_required"`, `"session_expired"`,
`"unsupported_level"`, `"syntax_error"`, …). Human-readable details belong in `message`,
never in `reason`.

---

## 6. Resource Model & Evidence Metadata

Every adapter MUST expose resources through the canonical `ResourceReference` model
(JSON Schema: `schemas/resources.schema.json`; TypeScript types: `packages/protocol/src/resources.ts`).
Required fields are `id`, `type`, `name`; the rest are optional and `evidence` is required
whenever the resource was not read from a contract file:

```json
{
  "id": "backend.endpoint:POST:/api/orders",
  "type": "backend.endpoint",
  "name": "POST /api/orders",
  "sourceLocation": { "filePath": "src/api/orders.py", "lineStart": 12, "lineEnd": 40 },
  "versionToken": "sha256:...",
  "evidence": {
    "provenance": "static",
    "sourceAdapter": "tokensafe-graph-engine",
    "confidence": "probable"
  },
  "availableOperations": ["observe", "verify", "applyEdit"]
}
```

### 6.1 Resource Type Namespace

`type` is `"<profile>.<kind>"` with exactly these values:
`backend.endpoint`, `backend.handler`, `backend.model`, `backend.operation`, `backend.service`,
`frontend.component`, `frontend.route`, `frontend.store`, `frontend.action`.
Identifiers are stable across runs: `backend.endpoint:GET:/api/orders`,
`frontend.component:CheckoutButton`. `id` MUST NOT contain version or hash information.


| Domain | Types |
| :--- | :--- |
| Frontend | `frontend.component`, `frontend.route`, `frontend.action`, `frontend.state`, `frontend.effect` |
| Backend | `backend.service`, `backend.endpoint`, `backend.handler`, `backend.middleware`, `backend.dto`, `backend.model`, `backend.operation` |
| Project | `project.dependency`, `project.module`, `project.contract` |

Identifiers MUST be stable within their documented scope. Raw memory addresses, temporary runtime object IDs, or source line numbers MUST NOT be used as globally stable identifiers.

### 6.2 Evidence Metadata

Every discovered relationship or semantic assertion MUST carry provenance:

- `provenance`: `static` · `runtime` · `contract` · `inferred` · `external`
- `confidence`: `confirmed` · `probable` · `unknown`

An `inferred` relationship MUST NOT be presented as a confirmed fact. Adapters MUST NOT fabricate evidence — a rollback, causality edge, or verification that was not actually observed MUST be reported as `unverified` / `notExecuted`, never as successful.

---

## 7. Profiles

A profile fixes the meaning of the shared payloads (§4) for one kind of runtime. Both
profiles implement the same six methods; only the `data` shapes differ (§4.1).

### 7.1 Frontend Profile

Contract of a component (L2): 
```json
{ "target": "component:CheckoutButton", "componentId": "CheckoutButton",
  "propsSchema": { "type": "object", "properties": { "disabled": { "type": "boolean" } } },
  "actions": [{ "name": "submit", "params": { "type": "object" } }],
  "effects": [{ "name": "saveCart", "managed": true }],
  "contracts": [{ "id": "checkout.submit", "constraints": ["disabled when total=0"] }] }
```
L3 `source` is the component file (or symbol slice) with the OCC version of those bytes.
L4 `events` are recorded user/state events with `type`, optional `signal`, `value`, `timestamp`.

`verify` returns `surfaceDiff` for accessibility-relevant changes and `diff` for state.
`rolledBack` applies to optimistic UI updates.

### 7.2 Backend Profile

Contract of an endpoint (L2):
```json
{ "target": "POST /api/orders", "method": "POST", "path": "/api/orders", "handlerName": "handler.CreateOrder",
  "requestDTO": { "type": "object", "properties": { "items": { "type": "array" } } },
  "responseDTO": { "type": "object", "properties": { "id": { "type": "string" } } },
  "middlewares": ["auth", "rateLimit"],
  "note": "DTOs are not reflectable from a mounted router — use L3 for the handler source" }
```
`requestDTO`/`responseDTO` are optional and MUST be omitted when the runtime cannot
reflect them (the `note` then says why). L4 `traces` are recorded executions.
`verify` for a request target returns `statusCode`, `responseBody` in `diff`, and
`rolledBack`/`rollbackStatus` for sandboxed database work (`verified` only with evidence).

### 7.3 Level requirements per profile

| Level | Frontend requires | Backend requires |
| :--- | :--- | :--- |
| 1 | handshake, L0–L1, verify | handshake, L0–L1 (routes/health), verify |
| 2 | L2 contracts, L3 source+OCC, impact, OCC edits, surfaceDiff | L2 endpoint contract, L3 source+OCC, impact, OCC edits |
| 3 | L4 events, signals graph, causality | L4 traces, causality from real traces |

---

## 8. Mutation Policy

OUMV follows an **enabled-by-default with mandatory guardrails** policy for development workspaces:

1. **Out of the box**: on a newly integrated project, Observe and Mutate are immediately usable with zero configuration. Zero-config adoption is a core product requirement — safety comes from guardrails, not from opt-in settings.
2. **Mandatory guardrails** (applied automatically by every runtime):
   - Optimistic Concurrency Control (`expectedVersion`; `CONFLICT_DETECTED` / `STALE_RESOURCE_VERSION` on mismatch);
   - workspace path boundary (`SECURITY_VIOLATION` on traversal);
   - syntax pre-flight before persistence (`SYNTAX_ERROR` on failure; if a language cannot be checked, the result MUST state `syntaxCheck: "skipped"` rather than imply success);
   - automatic backup of previous file content before direct edits;
   - secret-leak redaction before any data reaches the agent-facing interface.
3. **Production runtimes are fail-closed**: mutation and unrestricted observation MUST NOT be exposed in production unless explicitly enabled and authenticated (`PERMISSION_DENIED` by default).
4. **Opt-out**: a workspace MAY set `permissions.mutate: false` in `.tokensafe/oumv.json` to force read-only mode.

Runtimes MUST NOT advertise mutation capabilities they cannot guard.

---

## 9. Reference Implementations & Repository Landscape

The ecosystem consolidates technology knowledge into **two accumulator libraries** rather than one repository per technology:

| Repository | Role |
| :--- | :--- |
| [tokensafe-backend](https://github.com/tokensafe-dev/tokensafe-backend) | Backend Profile accumulator: Go runtime (native typed router, Gin, Chi, net/http) **and** Python/FastAPI runtime (package `tokensafe-backend-python` in the `python/` subdirectory — not on PyPI by decision). |
| [tokensafe-ui](https://github.com/tokensafe-dev/tokensafe-ui) | Frontend Profile accumulator: native SolidJS runtime, React adapter (Zustand/Redux/Context/useReducer), Vue adapter, Vite dev-server bridge. |
| [tokensafe](https://github.com/tokensafe-dev/tokensafe) | Orchestration: Retrofit CLI (`tokensafe integrate`), OUMV Gateway MCP tools, static Level-1 fallback, cross-stack graph. |

### 9.1 Agent Entry Points

The **TokenSafe MCP Gateway is the primary agent entry point** for full installations: its `oumv_*` tools route to live frontend/backend runtimes, fall back to static AST analysis, and merge cross-stack intelligence. The tokensafe-ui standalone MCP server (12 `tokensafe_*` tools) remains available for consumers of the npm package without the full TokenSafe install. Adapters MUST NOT be required to know which entry point an agent uses — both speak the same OUMV methods over the same transports.

### 9.2 Runtime Discovery & Agent Guidance

An OUMV runtime is only useful if the agent can find it and knows what it is for. Three requirements make that automatic:

1. **Zero-footprint discovery registry.** A dev-server sidecar writes a per-workspace registry to `~/.tokensafe/runtimes/<sha256(realpath(workspace))[:16]>.json` (mode 0600) — never into the repository. The registry is keyed by profile, so a React frontend and a Go/FastAPI backend in one workspace share it: `{workspaceRoot, pid, updatedAt, frontend?, backend?}`, where each profile value carries `type` (`frontend` | `backend`), `name`, `version`, `url` (JSON-RPC endpoint), optional `sessionToken`, and `capabilities.observeLevels` + `capabilities.transports` (`http` | `sse` | `ws` | `stdio`). A writer MUST preserve the other profile's entry (read-modify-write, atomic rename) and MUST delete only its own entry on shutdown. Readers MUST prefer this file over port scanning and MUST treat an entry without a live handshake as stale.
2. **Activation on first contact.** The host integration (CLI / hooks / MCP server) MUST, on the first prompt in a workspace, (a) detect the stack, (b) ensure the adapter is present or state the exact install command, and (c) inject a routing brief that names, per profile, whether the agent works through OUMV or through the host's own tools. The brief MUST be delivered out-of-band (hook context or MCP `instructions`) and MUST NOT require committing files to the repository.
3. **No-trace preference.** Where a runtime can be launched by a wrapper (Vite dev server, ASGI/uvicorn), adapters SHOULD be loadable without editing tracked files: an inline dev-server config, a global `sitecustomize` hook, or a command wrapper. In-process edits (e.g. one `AutoMount` line in Go `main`) MUST be marker-delimited, backed up outside the repository, validated by a build, and revertible byte-for-byte.

---

## 10. Conformance & Certification

Conformance is **per adapter and per profile**, and it is a claim that MUST be backed by a report artifact (see §10.3). Levels are cumulative: a runtime attains Level N only when every case at level ≤ N passes. A skipped case is never a pass — it caps the claim.

### 10.1 Level definitions

| Level | Frontend Profile requires | Backend Profile requires |
| :--- | :--- | :--- |
| **1 (Basic)** | Handshake, L0–L1 observe, action verification | Handshake, L0–L1 observe (routes/health), in-memory verify |
| **2 (Standard)** | L2–L3 observe (contracts, source + OCC token), impact analysis, OCC mutations, surface diffs | L2–L3 observe (declared contract / DTOs, source + OCC token), impact analysis, OCC mutations with mandatory `expectedVersion` |
| **3 (Full)** | L4 traces, dynamic signals graph, runtime causality (`why_state`) | L4 request traces, runtime causality (`observed` from real traces, never fabricated) |

### 10.2 Language-neutral fixtures

Cases live in `fixtures/conformance-cases.json` (`fixtureVersion` 6). Every case declares the `level` it certifies and may declare `preconditions` such as `verify` (which establishes the runtime evidence that L4/causality cases assert on). Each runtime executes the same file with its native toolchain — no TypeScript required for Go or Python certification.

A case declares its expectations declaratively: `expectResultFields`, `expectValues` (JSON-path equality on the result), `expectError.code` (with optional `expectError.data`), `expectLevelEquals`, `expectSha256Field`, `expectArrayField`, `expectEvidence`, `expectVersionMatchesContent`. The reference runners are the Go/Python packages in `tokensafe-backend` and `@oumv/conformance` (CLI `oumv-certify`); a certification claim is reproduced in CI by re-running one of them.

**OCC is mandatory.** Exactly one case (`apply-edit-without-version-rejected`) omits `expectedVersion`, and it asserts `-32011 VALIDATION_FAILED`. A runtime that accepts an unversioned edit of an existing file cannot pass Level 2.

### 10.3 Certification report

A level claim MUST be accompanied by a report (schema: `schemas/conformance-report.json`) produced by a reproducible run:

```json
{
  "adapterName": "go-gin",
  "framework": "gin",
  "specVersion": "1.2.0",
  "fixtureVersion": 6,
  "total": 25, "passed": 25, "failed": 0,
  "attainedLevel": 3,
  "levels": { "1": "passed", "2": "passed", "3": "passed" },
  "cases": [{ "id": "handshake-negotiates-capabilities", "level": 1, "status": "passed" }],
  "generatedAt": "2026-11-26T09:20:37Z"
}
```

Reports are committed per adapter (e.g. `tokensafe-backend/certification/*.json`) and regenerated in CI, so a claim that stops passing is visible as a failing build rather than stale prose. An adapter MUST NOT advertise capabilities or observe levels it does not implement: over-claiming is a conformance failure in its own right.

---

## 11. Versioning & Compatibility

* The protocol follows semver (`MAJOR.MINOR.PATCH`): MAJOR = breaking payload/error changes,
  MINOR = additive fields/methods, PATCH = clarifications only.
* `protocolVersion` in the handshake is the version the runtime serves. A runtime MUST
  accept a client whose MAJOR matches and MAY reject others with `-32006`.
* **Minimum supported version.** A runtime MUST serve its own version and every earlier
  MINOR of the same MAJOR; a client sending a higher MINOR MUST tolerate additive
  fields it does not know. Dropping support for a MINOR is a MAJOR change.
* Deprecated fields (§4.6) remain accepted for one MINOR after their replacement ships,
  are announced in the CHANGELOG, and are removed at the next MAJOR.
* `fixtures/conformance-cases.json` carries `fixtureVersion`; a certification report is
  only comparable with the same `fixtureVersion`.
* Conformance claims are per `specVersion`; a runtime re-certifies when MAJOR changes and
  SHOULD re-certify on MINOR.
* **v1.1 (wire 1.2.0)** adds the `applyEdit` modes `symbol`/`delete`/`rename`, `verify.steps`
  and observe `limit`/`cursor` pagination. All are additive: a v1.0 adapter stays valid for
  the capabilities it declares, and an adapter that does not implement a mode MUST answer
  `-32006` for it — never silently fall back to `replace`.

---

## 12. Security & Rate Limits

The runtime is an attack surface: it reads and writes source and dispatches requests. The
baseline rules:

* **Authentication.** The RPC endpoint accepts `X-OUMV-Session-Token` or
  `Authorization: Bearer <token>` (§2.2). Loopback development MAY run without a token;
  every non-loopback binding MUST require one and answer `401`/`403` before dispatch.
  Adapters MUST fail closed in production: disabled unless explicitly enabled, no
  descriptor, no source reads, no mutations.
* **Path jail.** Every path is resolved (symlinks included) and must stay inside the
  workspace root; credential files (`.env*`, keys, `credentials.json`, VCS internals) are
  refused with `-32003` even inside the workspace. `renameTo` is jail-checked like `path`.
* **Secrets.** The descriptor may carry the session token (`0600`, outside the repo) and
  MUST NOT carry credentials, connection strings or environment dumps. Tool results are
  redacted by the client, not trusted from the runtime.
* **Rate limits.** An adapter MAY enforce a per-session request limit. When it does, a
  throttled call answers `-32005 RATE_LIMITED` (or HTTP `429` before dispatch) with a
  `Retry-After` header or `data.retryAfterMs`. Limits are advisory for local development
  and MUST NOT be the only protection for a non-loopback binding.
* **No execution beyond the declared scope.** `verify` runs the application's own handler
  in-process; it MUST NOT spawn shells, reach the network outside the handler, or persist
  state it did not create. `scope.notExecuted` states the boundary.

## 13. Cross-Stack Graph (informative extension)

`oumv/graph` is an **optional** read-only extension for agents that work across a mixed
frontend/backend workspace. It is informative in v1.1: no adapter certification claim is
made for it, and a runtime that does not implement it answers `-32601` like any unknown
method.

Request: `{ "workspace"?: string, "depth"?: integer }` →
```json
{ "nodes": [{ "id": "backend.endpoint:GET /api/orders", "type": "backend.endpoint", "stack": "go", "file": "internal/api/orders.go" }],
  "edges": [{ "from": "frontend.component:OrdersPage", "to": "backend.endpoint:GET /api/orders", "kind": "fetch|ws|graphql|event" }],
  "truncated": false }
```
Nodes use the §6.1 resource namespace; ids are stable across runs. Edges are derived from
real call sites when available and MUST carry `kind` plus an evidence object when the
provenance is inferred rather than observed.

---

## Changelog

- **v1.1.0 release (2026-11-26)**: wire `protocolVersion` **1.2.0**, document revision `v1.5-canonical`, `fixtureVersion` **6** (25 cases). New: `applyEdit` modes `symbol` (replace one function/method/class without re-emitting the file), `delete` and `rename` (jail-checked, OCC, `renameTo`); `verify.steps` for ordered multi-request scenarios that share state (the duplicate-idempotency repro); observe `limit`/`cursor` with `hasMore`/`nextCursor` for L1/L4. New §12 security/rate-limit policy and the informative §13 cross-stack graph. Certification: all six backend adapters + React re-run on fixtures v6.

- **v1.0.0 release (2026-11-26)**: first stable release. Freezes document revision `v1.4-canonical`, wire `protocolVersion` **1.1.0** and `fixtureVersion` **4**. Certification: go-gin/go-chi/go-stdhttp/python-fastapi level 3 (18/18), React/Vite level 1 offline (15/18; L2–L3 need a browser tab). Tooling: `oumv-certify`, `oumv-lint-adapter`, adapter manifests with a capability gate.
- **v1.4-canonical (2026-11-26)**: normative transport bindings (§2.2 HTTP/batch, §2.3 SSE, §2.4 WebSocket, §2.5 stdio), §3 gains a session-lifecycle body (sessionId/TTL/disconnect, `session_expired`), §4 replaces prose with normative per-level/per-profile payloads, target grammar, mandatory-OCC guard order and the deprecated-alias table, §5 adds the full code table (JSON-RPC codes included, `-32010` reserved) plus method→code mapping and `error.data.reason`.
- **v1.3-guidance (2026-11-26)**: handshake negotiation rules (profile required, no over-claiming, absent capability = unsupported), new §9.2 Runtime Discovery & Agent Guidance (zero-footprint descriptor contract, first-contact activation, no-trace injection preference).
- **v1.2-conformance (2026-11-26)**: §10 rewritten — per-profile level definitions (frontend/backend), level-tagged fixtures (v2, `preconditions`), cumulative level derivation, mandatory-OCC guard case, and the certification report artifact (`schemas/conformance-report.json`) that a level claim must reference.
- **v1.1-retrofit (2026-11-24)**: Retrofit architecture — resource model & evidence metadata (§6), profiles (§7), normative Mutation Policy (§8: enabled-by-default with guardrails, production fail-closed), error codes −32007…−32011 / −32603, accumulator repository landscape (§9), language-neutral conformance fixtures.
- **v1.0 (2026-11-22)**: Initial draft — transports, handshake, four pillars, error codes −32001…−32006, conformance levels.
