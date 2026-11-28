# The OUMV Protocol Specification (v1.11-canonical)
**The Universal Agent-Runtime Protocol (UARP)**

- **Date**: 2026-11-22 (v1.0 draft) · 2026-11-26 (v1.0.0 frozen; document revision v1.4-canonical) · 2026-11-26 (v1.1.0; revision v1.5-canonical, wire `protocolVersion` 1.2.0) · 2026-11-27 (v1.2.0; revision v1.6-canonical, wire `protocolVersion` 1.3.0) · 2026-11-27 (v1.3.0; revision v1.7-canonical, wire `protocolVersion` 1.4.0) · 2026-11-27 (v1.4.0; revision v1.8-canonical, wire `protocolVersion` 1.5.0) · 2026-11-27 (v1.5.0; revision v1.9-canonical, wire `protocolVersion` 1.6.0) · 2026-11-28 (revision v1.10-canonical: transport auth contract codified, wire `protocolVersion` 1.6.0 unchanged) · 2026-11-28 (revision v1.11-canonical: read-only deployments drop mutating methods from the registry instead of refusing them, wire `protocolVersion` 1.6.0 unchanged)  
- **Status**: Stable — v1.5.0  
- **Author**: Oleg Savelev  
- **Repository**: [github.com/tokensafe-dev/oumv](https://github.com/tokensafe-dev/oumv)

---

## 1. Abstract

The **OUMV Protocol** (Observe, Understand, Mutate, Verify) defines an open, transport-agnostic standard for autonomous AI coding agents to inspect, reason about, modify, and verify running software systems (user interfaces, backend services, APIs) in real time.

Much like the **Language Server Protocol (LSP)** decouples code intelligence from editor implementations, and the **Model Context Protocol (MCP)** standardizes tool calling for LLMs, **OUMV (The Universal Agent-Runtime Protocol)** decouples agent runtime interaction from technology stacks (tokensafe-ui, React; tokensafe-backend, Go, Node, Python). Vue, ASP.NET Core, Spring and PHP adapters ship today alongside the Go, Node and Python backends (a Solid adapter is planned); the protocol is not UI-only and both profiles share one wire contract.

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

* **Request correlation (v1.5.0, wire 1.6.0).** A client MAY send
  `params.requestId` (opaque string) on any method. A runtime that accepts it MUST
  echo the value back in the response/error object as `requestId` (top level, next to
  `result`/`error`), so an agent can correlate a late reply with the request it
  cancelled or retried. Runtimes MUST NOT reject an unknown `requestId`.

Success Response:
```json
{
  "jsonrpc": "2.0",
  "id": "req-101",
  "requestId": "op-42",
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
  MAY leave it empty; a non-loopback bind MUST require it. A refused request is answered
  **before dispatch** with HTTP 401 (missing, invalid, or wrong-scheme credential) or
  HTTP 403 (a non-loopback bind that has no token configured), and the body carries the
  §5.1 registry envelope `{"jsonrpc":"2.0","id":null,"error":{"code":-32007,…}}`; no
  JSON-RPC method runs for it. The refusal semantics are certified by the `authCases`
  family (§10.2).
* Bodies above `maxBodyBytes` (default 8 MiB) → HTTP 413.

### 2.3 SSE binding (optional, MUST be advertised)

* Endpoint: `GET <base>/__oumv/events` with `Accept: text/event-stream`.
* Events: `trace` (`oumv/observe` L4 entries), `state` (resource changed),
  `diagnostic` (build/test/tool diagnostics, §2.6), `heartbeat` (every 15 s). Each
  event has an `id:`; reconnecting with `Last-Event-ID` replays from that id. Server
  MAY filter by `?target=` / `?types=`.
* SSE is one-way: requests still go over HTTP (§2.2).

### 2.4 WebSocket binding (optional, MUST be advertised)

* Upgrade on `<base>/__oumv/rpc`; frames are JSON-RPC 2.0 objects (text frames), one
  message per frame; batch arrays allowed.
* Server-initiated notifications use `"method": "notifications/oumv.trace"` /
  `"notifications/oumv.state"` / `"notifications/oumv.diagnostic"` with
  `params.sessionId`.
* After `oumv/handshake` the connection is bound to that `sessionId`; closing the socket
  ends the session.

### 2.5 stdio binding (headless adapters/tools)

Newline-delimited JSON-RPC, one object per line, stdout only for responses, diagnostics
to stderr. Used by CLI/MCP bridges; no batching requirement.

### 2.6 Diagnostics events (v1.5.0, wire 1.6.0)

A runtime that compiles, transforms or hot-reloads code SHOULD publish structured
diagnostics on the push transports (§2.3 event type `diagnostic`, §2.4 notification
`notifications/oumv.diagnostic`) instead of leaving the agent to re-run a blind
edit → run → parse loop. A `diagnostic` event payload is:

```json
{
  "severity": "error" | "warning" | "info",
  "source": "build" | "test" | "hmr" | "tool",
  "file": "src/App.tsx",
  "line": 12,
  "message": "Cannot find name 'orders'.",
  "tool": "vite",
  "ts": 1764249600000
}
```

* `file`/`line`/`tool` are optional; `severity`, `source` and `message` are required.
* Advertising `capabilities.events.diagnostic: true` commits a runtime to forwarding
  build/HMR failures it already observes; it does NOT require running a compiler.
* Diagnostics are observations, not verification: they never substitute `oumv/verify`.

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
* **TTL negotiation (v1.4.0, wire 1.5.0).** A client MAY send `sessionTtlSeconds`
  (integer 1..86400) in the handshake. A runtime that advertises
  `capabilities.sessions.ttlSeconds` MUST clamp the request to that range, issue the
  session with the granted lifetime and answer the granted value as `ttlSeconds`; a
  runtime that does not advertise it ignores the field and serves its own default. The
  granted `ttlSeconds` is what a client may rely on, not the requested value: a client
  that needs a short session MUST verify the echo (the `expired-session-is-rejected`
  case does exactly that before waiting).
* **Request correlation & timeouts (v1.5.0, wire 1.6.0).** `params.requestId` (§2.1)
  correlates replies with requests. Any method MAY carry `params.timeoutMs` (integer
  > 0); a runtime that cannot finish within the budget MUST answer
  `-32008 RUNTIME_UNAVAILABLE` with `data.reason = "timeout"` (and echo `requestId`)
  rather than leave the request open indefinitely — a partial write MUST be rolled
  back per §4.3 before answering. Without `timeoutMs` the runtime applies its own
  default; no transport may block a batch beyond `maxBodyBytes`-scale processing time.
* **Cancellation (v1.5.0, wire 1.6.0).** A runtime that advertises
  `capabilities.sessions.cancel` accepts `oumv/cancel`:

  Request: `{ "requestId": string }` (or `{ "target": "last" }` for the most recent
  in-flight request on this session) →
  ```json
  { "cancelled": true, "requestId": "op-42" }
  ```
  A request that already finished answers `{ "cancelled": false, "finished": true }`.
  Cancellation is cooperative: a mutating request cancelled mid-write still honours
  the §4.3 atomicity rules (rollback what was written, then answer the original
  request with `-32008` `reason="cancelled"`). An unknown `requestId` is
  `{ "cancelled": false }` — cancellation is best-effort by design, never an error.
* **Idempotency (v1.5.0, wire 1.6.0).** `oumv/applyEdit` and `oumv/previewEdit` MAY
  carry `params.idempotencyKey` (opaque string). A runtime that accepts it keeps a
  per-session map key → final result: a retry with the same key returns the FIRST
  result verbatim (same `status`, same `newVersion`) instead of re-applying the edit
  or answering `-32001` because the bytes already changed. Keys MUST be scoped to the
  session and MAY be pruned after the TTL; advertising the behaviour is
  `capabilities.sessions.idempotency`. Without a key, retries keep the plain OCC
  semantics.

### 3.1 Handshake (`oumv/handshake`)

Upon establishing a connection, the agent and runtime exchange capabilities:

**Client Request:**
```json
{
  "protocolVersion": "1.6.0",
  "clientInfo": { "name": "Antigravity", "version": "2.0.0" },
  "supportedTransports": ["http", "memory"],
  "sessionTtlSeconds": 900,
  "requestedCapabilities": {
    "observe": { "levels": ["L0", "L1", "L2", "L3", "L4"], "formats": ["yaml", "json"] },
    "understand": { "causality": true, "signalsGraph": true },
    "mutate": { "occ": true, "syntaxGuard": true, "multiFile": true, "preview": true },
    "verify": { "multiMetric": true, "surfaceDiff": true, "build": true },
    "index": { "symbols": true },
    "observeQuery": { "readOnly": true }
  }
}
```

**Server Response:**
```json
{
  "protocolVersion": "1.6.0",
  "profile": "frontend",
  "sessionId": "sess-4f2a…",
  "ttlSeconds": 900,
  "runtimeInfo": { "name": "tokensafe-ui", "version": "0.1.28" },
  "capabilities": {
    "observe": { "levels": ["L0", "L1", "L2", "L3", "L4"], "formats": ["yaml", "json"] },
    "understand": { "causality": true, "signalsGraph": true },
    "mutate": { "occ": true, "syntaxGuard": true, "multiFile": true, "preview": true },
    "verify": { "multiMetric": true, "surfaceDiff": true, "build": true },
    "index": { "symbols": true },
    "observeQuery": { "readOnly": true },
    "events": { "diagnostic": true },
    "sessions": { "ttlSeconds": true, "cancel": true },
    "transports": ["http", "sse", "ws"]
  }
}
```

**Negotiation rules (normative).**

1. `protocolVersion` is the version the runtime actually implements; a runtime MUST NOT echo a version it does not serve.
2. `profile` MUST be `"frontend"` or `"backend"` (spec §7). A runtime serving both reports the profile of the surface the agent is attached to.
3. A runtime MUST either honour `requestedCapabilities` (returning only the requested capabilities it implements) or return the full implemented set and omit the rest. It MUST NOT advertise a level, method or capability it cannot serve: over-claiming is a conformance failure (§10).
4. `requestedCapabilities` is advisory. Runtimes that cannot negotiate (older adapters) return their static capability set, and the agent MUST treat absent keys as unsupported.
5. **A capability that is not advertised is not registered.** When a runtime runs without a capability (`capabilities.mutate`, `verify`, `observe` or `understand` absent or empty), the methods that capability covers MUST NOT be in its dispatch table, and a call to one of them MUST answer `-32601 METHOD_NOT_FOUND` like any unknown method. Refusing a registered method with `-32007` is reserved for transport auth (§12) and for workspace policy on a method the runtime does register (`permissions.query: false`, §14.2); gating absence behind `-32007` is a conformance failure. A read-only deployment (§8.5) MUST also advertise `capabilities.readOnly: true`, so a client never mistakes absence for an older adapter that merely lacks the method.

---

## 4. The Four Pillars

All payloads below are **normative**. Field names are exact; unknown fields are allowed
but MUST be ignored. A runtime MUST NOT emit the deprecated aliases listed in §4.7.

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
`version` at L3 MUST be `"sha256:" + sha256(bytes of the whole file)`, independent of the
returned slice: it is the OCC token, so a windowed or symbol-scoped read still guards a
whole-file mutation. `startLine`/`endLine` describe the bytes actually returned. An empty
collection MUST be returned as `[]` with a `note`, never as an error.

* **Result versioning (wire 1.6.0).** Every observe answer carries
  `workspaceVersion` — a digest over the workspace inventory. A caller MAY send
  `params.ifVersion`: on match the runtime answers the short envelope
  `{level, format, unchanged: true, workspaceVersion}` (the cached copy is still
  fresh); on mismatch `-32010 STALE_RESOURCE_VERSION` with
  `data.reason = "stale_version"` and `data.current` — the caller refetches
  without `ifVersion`. `understand` honours the same handshake (§4.2).

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

`getSource`: request `{path, symbol?, startLine?, endLine?, ifVersion?}` →
`{path, symbol?, source?, unchanged?, version, startLine, endLine}`.
`startLine`/`endLine` return a 1-based inclusive window (an `endLine` past EOF is clamped);
the `version` is still the sha256 of the whole file, so OCC never depends on the window.
`ifVersion` is the dedup pointer: when the file still has that version the adapter MUST
answer `{path, version, unchanged: true}` with **no** `source`, instead of resending bytes
the agent already has. A `symbol` that does not exist in the file is `-32009`; it is never
answered with the whole file under a symbol label.

`applyEdit`: request `{path, symbol?, replacement?, expectedVersion?, mode?: "replace"|"create"|"symbol"|"delete"|"rename"|"patch", renameTo?, hunks?}` — or the batch envelope `{edits: [{path, mode?, expectedVersion?, replacement?, hunks?}]}` documented below — → 
```json
{ "status": "APPLIED"|"CURRENT", "path": "src/api/orders.go", "symbol": "CreateOrder",
  "newPath": "src/api/orders_v2.go", "newVersion": "sha256:…", "created": true, "deleted": true,
  "hunksApplied": 1,
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
* **`patch`** — splice exact snippets into an existing file. `hunks` is an array of
  `{target, replacement, startLine?, endLine?, replaceAll?}`, applied **in order to the
  evolving text** so a later hunk matches what the earlier ones produced. `target` is
  matched literally (not as a regex); it MUST occur exactly once in the search range
  unless `replaceAll: true` or `startLine`/`endLine` narrow it to one occurrence. A
  `target` that occurs zero times is `-32009` (`data.reason="target_not_found"`); more
  than once is `-32011` (`data.reason="target_not_unique"` with `data.count` and
  `data.lines`). The first failing hunk aborts the whole request with **no bytes
  written** — a patch is atomic per file. `expectedVersion` is mandatory and the syntax
  pre-flight runs on the resulting file. This is the mode for a local fix: the agent
  sends the changed lines, not the file it already observed.
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

**Multi-file atomic mutation (v1.4.0, wire 1.5.0).** A request whose parameters carry
`edits` instead of top-level `path` is a batch:

```json
{ "edits": [
    { "path": "src/api/orders.go", "mode": "create", "replacement": "…" },
    { "path": "src/api/routes.go", "expectedVersion": "sha256:…", "replacement": "…" },
    { "path": "src/api/util.go", "mode": "patch", "expectedVersion": "sha256:…",
      "hunks": [{ "target": "old()", "replacement": "new()" }] } ] }
```
→
```json
{ "status": "APPLIED",
  "edits": [ { "path": "src/api/orders.go", "newVersion": "sha256:…", "created": true },
             { "path": "src/api/routes.go", "newVersion": "sha256:…" },
             { "path": "src/api/util.go", "newVersion": "sha256:…", "hunksApplied": 1 } ] }
```

`edits` holds 1..16 items; an item's `mode` is `replace` (default), `create` or `patch`
— the single-file modes `symbol`/`delete`/`rename` are `-32006` inside a batch with
`data.editIndex`, because a rename that a later item's path depends on cannot be
staged without ordering assumptions the spec refuses to make. A path may appear only
once (`-32011`, `data.reason="duplicate_path"`).

A batch is **all or nothing**. The runtime MUST validate every item — jail, existence,
`expectedVersion` rules, OCC match, hunk resolution — and syntax-check every staged
result **before writing the first byte**. A failure in item *i* answers with the error
that item alone would produce, plus `data.editIndex: i` and `data.path`; nothing is
written. Only after every item staged cleanly are the files written, in order; if a
write fails after some files were already written, the runtime MUST restore the
already-written files to their previous bytes (and delete created ones) and answer
`-32603 INTERNAL_ERROR` with `data.rolledBack: true` and `data.editIndex`. The result
carries one entry per item, in request order. `mutate.multiFile` advertises the
capability; a runtime that does not advertise it answers `-32006`.

Batch semantics are proven by two cases: `apply-edit-batch-applies-all` (two creates,
both present in the result) and `apply-edit-batch-is-atomic` (second item invalid →
`-32002` with `data.editIndex=1`, and the first path still answers `-32009`).

Normative guards, in this order (first failure wins):

| # | Guard | Error |
| :--- | :--- | :--- |
| 1 | workspace boundary / sensitive path (source and `renameTo`) | `-32003 SECURITY_VIOLATION` |
| 2 | resource exists (`-32009`), or target must not exist for `create`/`rename` (`-32001`, `data.reason="file_exists"` / `"target_exists"`) | `-32009` / `-32001` |
| 3 | syntax pre-flight of the resulting file (`replace`/`create`/`symbol`/`patch`; `skipped` for `delete`/`rename`) | `-32002 SYNTAX_ERROR` |
| 4 | `expectedVersion` rules: present for `replace`/`symbol`/`delete`/`rename`/`patch`, absent for `create`; forbidden `replacement`/`renameTo` fields; `symbol`/`renameTo`/`hunks` required by their mode | `-32011 VALIDATION_FAILED` |
| 5 | `expectedVersion` matches current bytes | `-32001 CONFLICT_DETECTED` |
| 6 | policy allows mutation | `-32007 PERMISSION_DENIED` |

`expectedVersion` is **mandatory** for every mutation of an existing file; a write without
it is never accepted. Backups are the previous bytes; the path is reported in `backupPath`
when the runtime keeps one (`create` has no previous bytes, so no backup). A `symbol` edit
without `symbol` is `-32011` (`data.reason="symbol_required"`); a `rename` without
`renameTo` is `-32011` (`data.reason="rename_to_required"`); a `patch` without `hunks` is
`-32011` (`data.reason="hunks_required"`). A hunk whose `endLine` is past EOF is clamped,
not rejected, and a hunk that changes nothing is reported in `hunksApplied` all the same.

### 4.4 Preview (`oumv/previewEdit`) — v1.5.0, wire 1.6.0

A dry-run of `applyEdit`: identical params (single edit or the batch `edits` envelope,
plus the optional `idempotencyKey`/`timeoutMs`), identical guard order — boundary →
existence → syntax pre-flight → `expectedVersion` rules → OCC match → policy — but
**no bytes are written**. The response is what `applyEdit` WOULD answer:

```json
{
  "status": "PREVIEW",
  "previews": [
    { "path": "src/a.py", "mode": "replace", "unchanged": false,
      "currentVersion": "sha256:…", "newVersion": "sha256:…",
      "diff": "--- a/src/a.py\n+++ b/src/a.py\n@@ -1 +1 @@\n-old\n+new",
      "syntaxCheck": { "status": "passed", "tool": "python-ast" },
      "wouldApply": true }
  ],
  "applied": false
}
```

* `newVersion` is the sha256 of the would-be bytes; `diff` is a unified diff per file
  (omitted when `unchanged` is true). `wouldApply: false` is a valid, honest result for
  a no-op edit — the guard verdict travelled, nothing else.
* A preview MUST NOT consume the batch's `expectedVersion` protection: it neither
  mutates the workspace nor invalidates another agent's OCC token.
* A runtime that does not implement the method answers `-32601` like any unknown
  method; a runtime that advertises `capabilities.mutate.preview` MUST implement the
  full guard order, not a diff guess. Offline gateways MAY preview whole-file
  replacements locally but MUST label such results with their own provenance (e.g.
  `mode: "OFFLINE_FULL_FILE_PREVIEW"`) rather than implying the runtime verified them.

### 4.5 VERIFY (`oumv/verify`)

Request: `{target, method?, action?, payload?, headers?, steps?, sandbox?}` → 
```json
{ "status": "passed"|"failed", "target": "POST /api/orders", "statusCode": 409,
  "steps": [{ "target": "POST /api/orders", "statusCode": 201, "status": "passed", "responseBody": "…" },
            { "target": "POST /api/orders", "statusCode": 409, "status": "failed", "responseBody": "…" }],
  "diff": { "…": { "before": …, "after": … } }, "surfaceDiff": [{ "op": "attr"|"text"|"visibility", "target": "…", "before": "…", "after": "…" }],
  "timings": { "t_action_ms": 0.1, "t_schema_ms": 0, "t_propagation_ms": 0.2, "t_dom_ms": 0, "t_total_ms": 0.3 },
  "durationMs": 0.3,
  "scope": { "checked": ["in-memory dispatch"], "notExecuted": ["real network"], "notSupported": ["browser DOM"] },
  "rolledBack": true, "rollbackStatus": "verified"|"unverified"|"not_applicable",
  "dbDiff": { "rollback": true, "queries": 4, "driver": "sqlalchemy" } }
```
`status` is `passed` iff the dispatched action satisfied the request (HTTP status < 400 for
request targets). `surfaceDiff` is frontend-only. `rolledBack` MUST only be `true` when a
rollback was observed; otherwise `rollbackStatus` says `unverified` or `not_applicable`.
An adapter must not emit `rolledBack: false` to imply a rollback happened and was verified.

**Transactional sandbox (v1.3.0, wire 1.4.0).** `sandbox: {mode: "rollback"}` asks the
runtime to execute the whole verify — every `step` of a multi-step request — inside one
transaction and roll it back before answering. It is advertised as
`capabilities.verify.sandboxRollback`; a runtime that does not advertise it MUST answer
`-32006` and clients MUST NOT send the parameter. Evidence rules: `rollbackStatus` is
`verified` only when the runtime observed the rollback (Python/Node also report
`dbDiff.queries`, the number of statements executed — never SQL text or parameters);
`unverified` when an engine exists but no rollback was observed; `not_applicable` when
the runtime has no database layer wired. `scope.notExecuted` MUST omit
`"persistent database state"` only when the status is `verified`.

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

### 4.6 Target grammar

`target` strings use exactly one of:
* `"METHOD /path"` — backend endpoint (e.g. `"POST /api/orders"`);
* `"/path"` — backend endpoint, method unspecified;
* `"path#symbol"` — source + symbol (`"src/orders.go#CreateOrder"`);
* `"component:<id>"` — frontend component (`"component:CheckoutButton"`).

`componentId` is an accepted alias for `component:<id>`; runtimes MUST NOT require both.

### 4.7 Deprecated aliases (accepted on input, never emitted)

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

The canonical registry is [`schemas/errors.json`](../schemas/errors.json) — this
table and the README copy render the same set, and
`packages/protocol/src/errors.ts` is generated from it. Runtimes MUST NOT emit a
code that is absent from the registry.

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
| **-32010** | `STALE_RESOURCE_VERSION` | A version token carried by the caller no longer matches the versioned resource (static result or OCC token); refetch before retrying. |
| **-32011** | `VALIDATION_FAILED` | Payload violated a contract (incl. missing `expectedVersion`, expired session). |
| **-32012** | `RATE_LIMITED` | Per-session request limit exhausted (`data.retryAfterMs` hints when to retry; HTTP 429 may precede dispatch). |
| **-32603** | `INTERNAL_ERROR` | Unexpected adapter failure. |

`-32601 METHOD_NOT_FOUND` is the answer for a method the runtime does not register,
including a method whose capability is switched off (§3.1 rule 5). `-32007
PERMISSION_DENIED` is reserved for transport auth (§12) and for a workspace policy
that denies a method the runtime does register (`permissions.query: false`, §8.5,
§14.2).

`error.data.reason` values per code are enumerated in the registry; runtimes MAY
add more but MUST keep the code's documented meaning.

### 5.2 Method → code mapping

| Method | Conditions |
| :--- | :--- |
| `handshake` | invalid params `-32602`; unsupported protocol version `-32006` |
| `observe` | unknown level `-32006`; unresolvable target `-32009`; missing target for L2/L3 `-32602` |
| `getSource` | boundary `-32003`; missing file or unknown `symbol` `-32009`; policy `-32007` |
| `applyEdit` | §4.3 guard order; a `patch` hunk matching 0 times `-32009` (`target_not_found`), more than once `-32011` (`target_not_unique`) |
| `previewEdit` | §4.4 guard order, no write; never `-32001` from its own run (no bytes changed) |
| `verify` | missing target `-32602`; sandbox unavailable `-32008`; unknown action `-32005` |
| `build` | command failed to start or timed out `-32008` (`reason="timeout"`); refusal outside declared scope `-32003` |
| `index` | empty/missing `query` `-32602` |
| `query` | non-read-only statement `-32003` (`reason="query_forbidden"`); no DB layer wired `-32006` |
| `cancel` | best-effort — an unknown `requestId` answers `{cancelled: false}`, never an error |
| `understand` | unknown query `-32006`; an unresolvable target returns an empty result with `observed: false` and a `note` (§4.2), because route/model registration is adapter-dependent and "no evidence yet" is a legitimate answer |
| any | malformed body `-32700`; unknown method `-32601`; store failure `-32603` |

### 5.3 `error.data`

Error objects MAY carry `data`; when present it is an object with:
`{ "reason": snake_case_string, ...details }`. `reason` is the machine-readable cause
(`"path_traversal"`, `"expected_version_required"`, `"session_expired"`,
`"unsupported_level"`, `"syntax_error"`, `"target_not_found"`, `"target_not_unique"`,
`"hunks_required"`, …). Human-readable details belong in `message`, never in `reason`.

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
   - Optimistic Concurrency Control (`expectedVersion`; `-32001 CONFLICT_DETECTED` on
     byte mismatch; `-32010 STALE_RESOURCE_VERSION` when a versioned-resource token —
     e.g. a static analysis result — no longer matches and the caller must refetch);
   - workspace path boundary (`SECURITY_VIOLATION` on traversal);
   - syntax pre-flight before persistence (`SYNTAX_ERROR` on failure; if a language cannot be checked, the result MUST state `syntaxCheck: "skipped"` rather than imply success);
   - automatic backup of previous file content before direct edits;
   - secret-leak redaction before any data reaches the agent-facing interface.
3. **Production runtimes are fail-closed**: mutation and unrestricted observation MUST NOT be exposed in production unless explicitly enabled and authenticated. A production runtime that was not given an explicit mutation switch runs read-only in the sense of §8.5: the mutating methods are absent, not merely refused.
4. **Opt-out**: a workspace MAY set `permissions.mutate: false` in `.tokensafe/oumv.json` to force read-only mode, and an adapter MAY expose a read-only deployment switch. Both are implemented as method absence (§8.5), not as a per-handler refusal.

Runtimes MUST NOT advertise mutation capabilities they cannot guard.

### 8.5 Read-only deployments

A read-only deployment is a **shape of the runtime, not a check inside it**. The
registry is closed: the dispatch table is built once at boot from the advertised
capability set, and a method that is not in the table cannot be reached, whatever a
handler might decide later.

In read-only mode these methods MUST NOT be registered and MUST answer `-32601`:

| Absent method | Why it writes |
| :--- | :--- |
| `oumv/mutate`, `oumv/applyEdit` | writes source bytes |
| `oumv/previewEdit` | carries the mutation surface (`mutate.preview`); kept absent so a client cannot mistake the profile for a writable one |
| `oumv/verify` | executes the application, and the tests it runs may write to disk or the database outside any rollback sandbox |
| `oumv/build` | executes a client-supplied command |
| `mutation.apply`, `mutation.simulate` | TokenSafe extensions that dispatch live in-process requests |

Everything that only reads stays registered: `oumv/handshake`, `oumv/disconnect`,
`oumv/observe`, `oumv/understand`, `oumv/getSource`, `oumv/index`, `oumv/cancel`,
`oumv/query` (subject to `permissions.query`, §14.2), `state.read`, `state.diff`,
`causality.*` and `verification.assert`.

A read-only runtime MUST advertise `capabilities.readOnly: true` and MUST NOT
advertise `mutate` or `verify`. A client MUST treat `readOnly: true` as authoritative:
it must not perform the edit through its own tools, because that would silently
restore the write path the deployment removed. Logging the refusal is expected; the
edit itself is out of scope for that workspace.

The advertised capability set and the registered method set MUST be equal in both
directions: nothing advertised may be unregistered, and nothing registered may be
unadvertised. Conformance asserts this on the handshake answer.

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

Cases live in `fixtures/conformance-cases.json` (`fixtureVersion` 14). Every case declares the `level` it certifies and may declare `preconditions` such as `verify` (which establishes the runtime evidence that L4/causality cases assert on). Each runtime executes the same file with its native toolchain — no TypeScript required for Go or Python certification.

Besides the ordered `cases`, the file carries four gated families: `pushCases` (run only by the SSE/WS certificate whose `transport` matches), `capabilityCases` (run only when the runtime's handshake advertises `requiresCapability`, and dropped from the report otherwise, so no claim is ever certified by a skipped case), `sessionCases` (handshake with `sessionTtlSeconds: ttlSeconds`, wait the granted lifetime, then assert `-32011` + `data.reason="session_expired"`) and `authCases` (spec §12: the same ordinary request with a deliberately defective credential — `auth: "missing" | "invalid" | "wrong-scheme"` — must be refused with the declared `expectHttpStatus` and `expectError.code` before dispatch; run only by an HTTP certifier whose target was started with auth enabled, since a stdio binding has no transport auth and a tokenless loopback target has nothing to refuse). A capability case may name `cleanup` paths removed before it runs and a `followUp` call whose expectations it also asserts — the second half of an atomicity proof. Any case may also declare `minWireVersion`: it is skipped, and dropped from the report, when the runtime negotiates an older wire version — that is how the §4.1 result-versioning cases stay Level-2 assertions for wire 1.6.0 runtimes without penalizing runtimes frozen on 1.5.0. `requiresCapability` is not limited to `capabilityCases`: any case may declare it, and a mutating or verifying case that declares it is dropped from the report of a runtime that does not advertise that capability. That is how a read-only deployment (§8.5) certifies the surface it actually serves instead of failing on methods it never registered — a dropped case is never a pass either.

A case declares its expectations declaratively: `expectResultFields`, `expectValues` (JSON-path equality on the result), `expectError.code` (with optional `expectError.data`), `expectLevelEquals`, `expectSha256Field`, `expectArrayField`, `expectEvidence`, `expectVersionMatchesContent`. A case may also declare `headers`, merged into that single request after the transport's own auth headers. The reference runners are the Go/Python packages in `tokensafe-backend` and `@oumv/conformance` (CLI `oumv-certify`); a certification claim is reproduced in CI by re-running one of them.

**OCC is mandatory.** Exactly one case (`apply-edit-without-version-rejected`) omits `expectedVersion`, and it asserts `-32011 VALIDATION_FAILED`. A runtime that accepts an unversioned edit of an existing file cannot pass Level 2.

### 10.3 Certification report

A level claim MUST be accompanied by a report (schema: `schemas/conformance-report.json`) produced by a reproducible run:

```json
{
  "adapterName": "go-gin",
  "framework": "gin",
  "specVersion": "1.6.0",
  "fixtureVersion": 13,
  "total": 36, "passed": 36, "failed": 0,
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
* Deprecated fields (§4.7) remain accepted for one MINOR after their replacement ships,
  are announced in the CHANGELOG, and are removed at the next MAJOR.
* `fixtures/conformance-cases.json` carries `fixtureVersion`; a certification report is
  only comparable with the same `fixtureVersion`.
* Conformance claims are per `specVersion`; a runtime re-certifies when MAJOR changes and
  SHOULD re-certify on MINOR.
* **v1.1 (wire 1.2.0)** adds the `applyEdit` modes `symbol`/`delete`/`rename`, `verify.steps`
  and observe `limit`/`cursor` pagination. All are additive: a v1.0 adapter stays valid for
  the capabilities it declares, and an adapter that does not implement a mode MUST answer
  `-32006` for it — never silently fall back to `replace`.
* **v1.2 (wire 1.3.0)** adds the `applyEdit` mode `patch` (hunks spliced under OCC) and the
  `getSource` window/dedup parameters `startLine`/`endLine`/`ifVersion`. Both are additive:
  a v1.1 adapter stays valid for its declared capabilities and answers `-32006` for
  `mode=patch`. This release also states the OCC rule the runtimes already implemented —
  `version` is the hash of the whole file even when the read returned a slice.
* **Compatibility matrix (v1.5.0, wire 1.6.0).** [`compatibility.json`](../compatibility.json)
  is the generated one-table answer to "which spec revision, wire version, fixture set and
  adapter release work together": it pins, per released revision, the document revision,
  wire `protocolVersion`, `fixtureVersion`, the published package versions that shipped it
  and the certification reports that prove it. The generator script writes it at release
  time and CI checks that the checked-in file matches the repo's current versions. When
  this spec, the fixtures and a runtime disagree, `compatibility.json` is the arbiter of
  what an adopter can rely on.
* **Deprecation notice (v1.5.0, wire 1.6.0).** A runtime that receives a request using a
  field or method listed as deprecated SHOULD include `data.deprecated: true` (plus
  `data.since`/`data.useInstead` when known) in its successful response — the answer stays
  correct, the agent learns the deadline. Runtimes MUST NOT fail a deprecated-but-accepted
  call.
* **Transport auth contract (revision v1.10, wire 1.6.0 unchanged, fixtures v13).** The
  §2.2/§12 refusal is now normative and certified: a defective credential answers HTTP
  401 before dispatch, a non-loopback bind with no token answers HTTP 403, and both bodies
  carry the registry envelope with `-32007`. This codifies what every shipped runtime
  already did — it adds no field, method or wire version — so a wire 1.6.0 adapter stays
  valid. Fixtures gain the gated `authCases` family plus per-case `headers`; a certificate
  produced with `oumv-certify --auth` records `environment.auth: "required"`, and one
  produced without it simply has no auth cases (nothing is claimed that was not run).

---

## 12. Security & Rate Limits

The runtime is an attack surface: it reads and writes source and dispatches requests. The
baseline rules:

* **Authentication.** The RPC endpoint accepts `X-OUMV-Session-Token` or
  `Authorization: Bearer <token>` (§2.2). Loopback development MAY run without a token;
  every non-loopback binding MUST require one and answer `401`/`403` before dispatch. The
  refusal is HTTP 401 with the §5.1 envelope `{"jsonrpc":"2.0","id":null,"error":
  {"code":-32007,"message":"PERMISSION_DENIED: …"}}` for a missing, invalid or wrong-scheme
  credential, and HTTP 403 with `-32007` (`data.reason="token_required_non_loopback"`) when
  a non-loopback bind has no token configured — never a JSON-RPC *method* error, because no
  method runs. Optional transports follow the same rule: an SSE/WS endpoint served by an
  authenticated binding MUST refuse an unauthenticated connection too.
  Adapters MUST fail closed in production: disabled unless explicitly enabled, no
  descriptor, no source reads, no mutations.
* **Path jail.** Every path is resolved (symlinks included) and must stay inside the
  workspace root; credential files (`.env*`, keys, `credentials.json`, VCS internals) are
  refused with `-32003` even inside the workspace. `renameTo` is jail-checked like `path`.
* **Secrets.** The descriptor may carry the session token (`0600`, outside the repo) and
  MUST NOT carry credentials, connection strings or environment dumps. Tool results are
  redacted by the client, not trusted from the runtime.
* **Rate limits.** An adapter MAY enforce a per-session request limit. When it does, a
  throttled call answers `-32012 RATE_LIMITED` (or HTTP `429` before dispatch) with a
  `Retry-After` header or `data.retryAfterMs`. Limits are advisory for local development
  and MUST NOT be the only protection for a non-loopback binding.
* **Non-loopback bindings (v1.5.0, wire 1.6.0).** A runtime bound beyond the loopback
  interface is a remote attack surface, so: the session token (§2.2) is REQUIRED —
  loopback's MAY-stay-empty does not apply; the transport MUST be TLS or a private
  tunnel the operator controls (plain HTTP beyond loopback is a conformance failure);
  discovery MUST be by explicit URL (the operator's configuration, an env var, or a
  user-entered descriptor) — the local zero-footprint registry (`~/.tokensafe/runtimes/`,
  §9.2) is a loopback-only mechanism and MUST NOT be consulted for, or written by,
  remote bindings; and §14 extensions stay read-only unless the workspace policy
  explicitly enables them. The protocol cannot distinguish production from staging by
  itself — an agent working against a non-loopback runtime MUST treat it as someone's
  real environment.
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

## 14. Optional Extensions: Index, Query & Build (informative)

Three extensions follow the `oumv/graph` pattern (§13): a runtime that does not
implement them answers `-32601` like any unknown method, no certification claim is
made, and an adopting agent MUST fall back to its own tools instead of assuming a
static runtime can serve them. Each advertises a capability (`index.symbols`,
`observeQuery.readOnly`, `verify.build`) in the handshake when implemented.

### 14.1 `oumv/index` — repo-wide symbol search

The largest remaining agent cost is not reading but *finding* what to read; grep is
the fallback this method removes.

Request: `{ "query": string, "kinds"?: string[], "scope"?: string, "limit"?: integer }` →
```json
{
  "matches": [
    { "resourceId": "function:create_order@orders.py", "name": "create_order",
      "kind": "function", "file": "orders.py", "lines": [12, 20],
      "signature": "def create_order(payload: dict) -> dict", "refs": 2,
      "match": "exact" }
  ],
  "truncated": false
}
```

* Ranking MUST prefer, in order: exact name, prefix, qualified-suffix
  (`Type.member`), substring. `refs` (reverse-edge count) breaks ties.
* `kinds` filters by symbol kind (`function`, `class`, `method`, `endpoint`, …);
  `scope` filters by path prefix. An empty query is `-32602`.
* `match` states which ranking tier answered, so an agent can weigh a substring hit.
* A static runtime serves this from its AST; a live runtime MAY union runtime-known
  symbols (registered routes, mounted components) and MUST mark such entries with
  `evidence` provenance.

### 14.2 `oumv/query` — read-only data access

Answering "what is actually in the table/session" without handing the agent a shell.

Request: `{ "sql": string, "params"?: unknown[], "limit"?: integer }` →
```json
{ "columns": ["id", "status"], "rows": [[1, "open"]], "rowCount": 1, "truncated": false }
```

* **Read-only, enforced by the runtime**: only `SELECT`/`EXPLAIN`/read-only pragma
  statements are accepted; anything else is `-32003 SECURITY_VIOLATION` with
  `data.reason = "query_forbidden"`. A runtime MUST NOT rely on the client to pass
  only SELECTs (statement allow-listing or a read-only connection/transaction both
  qualify; the mechanism MAY be stated in the capability).
* `limit` (default ≤ 100) caps rows; `truncated` states the cut. Results are subject
  to the §12 redaction rules like any other payload.
* Gated by an explicit opt-in capability (`observeQuery.readOnly`); a workspace
  policy may disable it like mutation (`permissions.query: false` → `-32007`).
* A runtime without a wired database layer answers `-32006` — never an empty result
  that looks like "the table is empty".

### 14.3 `oumv/build` — run a build/test command, return diagnostics

The edit → verify loop needs the compiler's verdict, not a guess.

Request: `{ "command"?: string, "target"?: string, "timeoutMs"?: integer }` →
```json
{
  "status": "passed" | "failed" | "skipped",
  "command": "go build ./...",
  "diagnostics": [
    { "severity": "error", "source": "build", "file": "internal/api/orders.go",
      "line": 41, "message": "undefined: orders", "tool": "go build" }
  ],
  "durationMs": 1840
}
```

* Without `command`, the runtime uses its configured default (e.g. the adapter's
  verify command); `target` narrows the scope the same way `oumv/verify` does.
* `timeoutMs` (§3) bounds the run; on expiry the process is stopped and the answer is
  `status: "failed"` with a `reason="timeout"` diagnostic — never a hanging request.
* `status: "skipped"` is honest only with a stated reason (no tool configured, policy
  denied); a runtime MUST NOT report `skipped` in a way that reads as success.
* The command runs in the workspace root with the §12 boundaries: no network reach the
  application itself would not have, no persistence beyond what the command itself
  creates, output truncated to `maxBodyBytes` with `truncated` set.
* Diagnostics emitted during the run SHOULD also flow on the push transports (§2.6).

---

## Changelog

- **Revision v1.11 (2026-11-28, wire 1.6.0 unchanged, `fixtureVersion` 14)**: a read-only deployment becomes method absence instead of a per-handler refusal (§3.1 rule 5, new §8.5). The registry is closed and built at boot from the advertised capabilities, so `oumv/mutate`/`oumv/applyEdit`, `oumv/previewEdit`, `oumv/verify`, `oumv/build`, `mutation.apply` and `mutation.simulate` are not reachable and answer `-32601` when their capability is off, while handshake, observe, understand, getSource, index, cancel, query, state, causality and verification.assert stay. Handshake gains `capabilities.readOnly: true`, which is authoritative for clients: a client MUST NOT perform the edit through its own tools, because that would restore the write path the deployment removed. `-32007` narrows to transport auth (§12) and to workspace policy on a registered method (`permissions.query: false`). Fixtures: any case may carry `requiresCapability`, so mutating cases are dropped from a read-only report without lowering the level it attains, and the new `read-only-*` capability cases assert `-32601`, the `readOnly` flag and that observe still works. Additive: wire 1.6.0 adapters stay valid, and a runtime that does not advertise `readOnly` keeps answering `-32007`.

- **Revision v1.10 (2026-11-28, wire 1.6.0 unchanged, `fixtureVersion` 13)**: the transport auth refusal is codified (§2.2, §12) — HTTP 401 before dispatch for a missing/invalid/wrong-scheme credential, HTTP 403 (`data.reason="token_required_non_loopback"`) for a non-loopback bind with no token, both carrying the §5.1 envelope with `-32007`; SSE/WS under an authenticated binding must refuse unauthenticated connections too. Fixtures gain the gated `authCases` family and per-case `headers`; `oumv-certify --auth` runs the family and records `environment.auth: "required"`. Additive documentation of behavior every shipped runtime already implemented — no field, method or wire version changes, so wire 1.6.0 adapters stay valid.

- **v1.5.0 release (2026-11-27)**: wire `protocolVersion` **1.6.0**, document revision `v1.9-canonical`, `fixtureVersion` **11**. New methods: `oumv/previewEdit` (§4.4 — applyEdit's guard order as a dry-run with per-file `wouldApply`/`newVersion`/`diff`, never writing), `oumv/cancel` (§3 — best-effort cooperative cancellation by `requestId` or `target:"last"`), `oumv/index` (§14.1 — repo-wide symbol search, ranked exact > prefix > qualified-suffix > substring with reverse-edge counts), `observe.query` (§14.2 — runtime-enforced read-only SQL access, opt-in capability), `oumv/build` (§14.3 — run the build/test command and return structured `diagnostics`). Envelope gains `params.requestId` (echoed in replies; §2.1) and per-method `timeoutMs`; mutations accept `idempotencyKey` with first-result-wins replay (§3). Push transports gain the `diagnostic` event / `notifications/oumv.diagnostic` (§2.6) with `capabilities.events.diagnostic`. Error model: `-32010` activated as `STALE_RESOURCE_VERSION`, new `-32012 RATE_LIMITED`, and the whole code set is now generated from the canonical registry `schemas/errors.json` (errors.ts generated, spec/README tables checked 1:1 by the conformance suite). §11 adds `compatibility.json` (generated cross-repo compat matrix) and a deprecation-notice field; §12 formalizes non-loopback bindings (token required, TLS/tunnel, explicit-URL discovery, registry stays loopback-only). Handshake capabilities grow `mutate.preview`, `verify.build`, `index.symbols`, `observeQuery.readOnly`, `events.diagnostic`, `sessions.cancel`.

- **v1.4.0 release (2026-11-27)**: wire `protocolVersion` **1.5.0**, document revision `v1.8-canonical`, `fixtureVersion` **10**. New: `applyEdit` accepts a batch envelope — `edits: [{path, mode?, expectedVersion?, replacement?, hunks?}]` with 1..16 items, modes `replace|create|patch`, every item validated and syntax-checked before the first write, a write failure restoring the files already written (`-32603` + `data.rolledBack: true`), item-scoped errors carrying `data.editIndex`/`data.path`, and a per-item result `{status: "APPLIED", edits: [{path, newVersion, created?, hunksApplied?}]}`; advertised as `capabilities.mutate.multiFile` and proven by `apply-edit-batch-applies-all` and `apply-edit-batch-is-atomic`. Handshake gains `sessionTtlSeconds` (1..86400, clamped, echoed as the granted `ttlSeconds`) with `capabilities.sessions.ttlSeconds`, and the new `sessionCases` family proves an expired id answers `-32011` with `data.reason="session_expired"`. Certification: all six backend adapters, the Go/Python live servers and the React/Vue controllers re-run on fixtures v10.

- **v1.3.0 release (2026-11-27)**: wire `protocolVersion` **1.4.0**, document revision `v1.7-canonical`, `fixtureVersion` **9**. New: `verify.sandbox: {mode: "rollback"}` — one transaction for the whole request, evidence-gated `rolledBack`/`rollbackStatus`, `dbDiff {rollback, queries?, driver?}`, advertised as `capabilities.verify.sandboxRollback` and proven by the `verify-sandbox-rolls-back` capability case. Handshake capabilities now carry `transports` (the bindings a runtime actually mounted, §2.3/§2.4). `mutate.ephemeralDispatch` is documented here (it was already in the schema). Behavioural alignment: SSE ids are monotonic integers on every runtime, `Last-Event-ID` replays `trace` and `state`, WS `notifications/oumv.state` is bound to the handshake session, and the fixture v8 push cases certify those bindings. Certification: Go/Node/Python adapters at Level 3, Spring/PHP at Level 2 with the named L4 gap; Node Express/Fastify carry SSE and WS transport certificates.

- **v1.2.0 release (2026-11-27)**: wire `protocolVersion` **1.3.0**, document revision `v1.6-canonical`, `fixtureVersion` **7**. New: `applyEdit mode=patch` — `hunks: [{target, replacement, startLine?, endLine?, replaceAll?}]` spliced in order under OCC, literal match, exactly-one-unless-scoped, first failure aborting with no bytes written (`-32009 target_not_found` / `-32011 target_not_unique`), `hunksApplied` in the result. `getSource` gains `startLine`/`endLine` windows and the `ifVersion` dedup pointer (`{unchanged: true}` with no source). Clarified: `version` is the sha256 of the whole file even when the read returns a slice, so OCC never depends on the window. This release also aligns the shipped runtimes with §4/§5 (Python observe L0/L1/L4 shapes and deprecated `version`/`mode` fields, Go `getSource` unknown-symbol and `verify` unavailable-sandbox codes, `protocolVersion` validation on handshake, `understand` unresolvable target) and adds conformance cases for those conditions. Certification: all six backend adapters + React re-run on fixtures v7.

- **v1.1.0 release (2026-11-26)**: wire `protocolVersion` **1.2.0**, document revision `v1.5-canonical`, `fixtureVersion` **6** (25 cases). New: `applyEdit` modes `symbol` (replace one function/method/class without re-emitting the file), `delete` and `rename` (jail-checked, OCC, `renameTo`); `verify.steps` for ordered multi-request scenarios that share state (the duplicate-idempotency repro); observe `limit`/`cursor` with `hasMore`/`nextCursor` for L1/L4. New §12 security/rate-limit policy and the informative §13 cross-stack graph. Certification: all six backend adapters + React re-run on fixtures v6.

- **v1.0.0 release (2026-11-26)**: first stable release. Freezes document revision `v1.4-canonical`, wire `protocolVersion` **1.1.0** and `fixtureVersion` **4**. Certification: go-gin/go-chi/go-stdhttp/python-fastapi level 3 (18/18), React/Vite level 1 offline (15/18; L2–L3 need a browser tab). Tooling: `oumv-certify`, `oumv-lint-adapter`, adapter manifests with a capability gate.
- **v1.4-canonical (2026-11-26)**: normative transport bindings (§2.2 HTTP/batch, §2.3 SSE, §2.4 WebSocket, §2.5 stdio), §3 gains a session-lifecycle body (sessionId/TTL/disconnect, `session_expired`), §4 replaces prose with normative per-level/per-profile payloads, target grammar, mandatory-OCC guard order and the deprecated-alias table, §5 adds the full code table (JSON-RPC codes included, `-32010` reserved) plus method→code mapping and `error.data.reason`.
- **v1.3-guidance (2026-11-26)**: handshake negotiation rules (profile required, no over-claiming, absent capability = unsupported), new §9.2 Runtime Discovery & Agent Guidance (zero-footprint descriptor contract, first-contact activation, no-trace injection preference).
- **v1.2-conformance (2026-11-26)**: §10 rewritten — per-profile level definitions (frontend/backend), level-tagged fixtures (v2, `preconditions`), cumulative level derivation, mandatory-OCC guard case, and the certification report artifact (`schemas/conformance-report.json`) that a level claim must reference.
- **v1.1-retrofit (2026-11-24)**: Retrofit architecture — resource model & evidence metadata (§6), profiles (§7), normative Mutation Policy (§8: enabled-by-default with guardrails, production fail-closed), error codes −32007…−32011 / −32603, accumulator repository landscape (§9), language-neutral conformance fixtures.
- **v1.0 (2026-11-22)**: Initial draft — transports, handshake, four pillars, error codes −32001…−32006, conformance levels.
