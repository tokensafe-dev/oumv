# The OUMV Protocol Specification (v1.1-retrofit)
**The Universal Agent-Runtime Protocol (UARP)**

- **Date**: 2026-11-22 (v1.0) · 2026-11-24 (v1.1-retrofit)  
- **Status**: Draft Standard  
- **Author**: Oleg Savelev  
- **Repository**: [github.com/tokensafe-dev/oumv](https://github.com/tokensafe-dev/oumv)

---

## 1. Abstract

The **OUMV Protocol** (Observe, Understand, Mutate, Verify) defines an open, transport-agnostic standard for autonomous AI coding agents to inspect, reason about, modify, and verify running software systems (user interfaces, backend services, APIs) in real time.

Much like the **Language Server Protocol (LSP)** decouples code intelligence from editor implementations, and the **Model Context Protocol (MCP)** standardizes tool calling for LLMs, **OUMV (The Universal Agent-Runtime Protocol)** decouples agent runtime interaction from technology stacks (tokensafe-ui, React, Vue, tokensafe-backend, Go, Node.js).

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

---

## 3. Session Lifecycle & Capability Negotiation

### 3.1 Handshake (`oumv/handshake`)

Upon establishing a connection, the agent and runtime exchange capabilities:

**Client Request:**
```json
{
  "protocolVersion": "1.0.0",
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
  "protocolVersion": "1.0.0",
  "runtimeInfo": { "name": "tokensafe-ui", "version": "0.1.6" },
  "capabilities": {
    "observe": { "levels": ["L0", "L1", "L2", "L3", "L4"], "formats": ["yaml", "json"] },
    "understand": { "causality": true, "signalsGraph": true },
    "mutate": { "occ": true, "syntaxGuard": true },
    "verify": { "multiMetric": true, "surfaceDiff": true }
  }
}
```

---

## 4. The Four Pillars

### Pillar 1: OBSERVE (`oumv/observe`)

Progressive context disclosure guarantees agents do not waste token budgets on raw HTML/DOM:

| Level | Name | Target Payload | Token Budget |
| :--- | :--- | :--- | :--- |
| **L0** | **Page Pulse** | Active route, mounted roots, global error count, loading status. | ~20 tokens |
| **L1** | **Surface** | Focused map of actionable elements (buttons, inputs), ARIA roles, action triggers. | ~100–250 tokens |
| **L2** | **Contract** | Schema, props, signals, pure actions, and managed effects of a targeted component. | ~80 tokens |
| **L3** | **Source** | Symbol-level source code with AST line numbering and OCC version token. | ~300–600 tokens |
| **L4** | **Traces** | Event stream, signal mutations, and active subscriptions. | On-demand |

### Pillar 2: UNDERSTAND (`oumv/understand`)

Answers two fundamental questions:
1. **Impact Analysis (`query: "impact"`)**:
   Answers *"What breaks if I modify this state or component?"*
2. **Runtime Causality Engine (`query: "causality"` / `query: "why_state"`)**:
   Answers *"Why is this button disabled / why is field X invalid?"* by evaluating the live subscriber graph:
   $$\text{Signal} \longrightarrow \text{Computed} \longrightarrow \text{Effect} \longrightarrow \text{DOM Binding}$$

### Pillar 3: MUTATE (`oumv/mutate`)

All mutations strictly implement **Optimistic Concurrency Control (OCC)**:
1. The agent fetches component source via `oumv/getSource`, receiving content and `version: "sha256:..."`.
2. The agent submits edits via `oumv/applyEdit` supplying `expectedVersion`.
3. If concurrent modifications occurred, the edit is aborted with `CONFLICT_DETECTED`.
4. Prior to disk persistence, syntax and security leak guards evaluate the payload.

### Pillar 4: VERIFY (`oumv/verify`)

Provides sub-millisecond to low-millisecond local action verification without launching heavy browser automation:
- Returns structured state diffs (`diff`).
- Returns accessibility surface diffs (`surfaceDiff`).
- Returns 5-metric latency breakdown:
  $$\Delta t = t_{\text{action}} + t_{\text{schema}} + t_{\text{propagation}} + t_{\text{dom}} + t_{\text{total}}$$

---

## 5. Standard Error Codes

| Code | Name | Description |
| :--- | :--- | :--- |
| **-32001** | `CONFLICT_DETECTED` | Stale version token in optimistic concurrency write. |
| **-32002** | `SYNTAX_ERROR` | Target code edit failed compiler / AST parse. |
| **-32003** | `SECURITY_VIOLATION` | Path traversal out of workspace jail or credential leak. |
| **-32004** | `COMPONENT_NOT_FOUND` | Target component ID is not mounted or registered. |
| **-32005** | `ACTION_NOT_FOUND` | Requested action or effect is not defined on target. |
| **-32006** | `UNSUPPORTED_CAPABILITY` | Requested feature is not supported by runtime adapter. |
| **-32007** | `PERMISSION_DENIED` | Runtime or workspace policy explicitly prohibits the operation. |
| **-32008** | `RUNTIME_UNAVAILABLE` | Target runtime is offline or unreachable. |
| **-32009** | `RESOURCE_NOT_FOUND` | Referenced resource does not exist (generic form of `COMPONENT_NOT_FOUND`). |
| **-32010** | `STALE_RESOURCE_VERSION` | Resource version token is stale (generic OCC). |
| **-32011** | `VALIDATION_FAILED` | Payload failed schema or contract validation. |
| **-32603** | `INTERNAL_ERROR` | Unexpected adapter failure (JSON-RPC reserved). |

---

## 6. Resource Model & Evidence Metadata

Every adapter MUST expose resources through the canonical `ResourceReference` model (contracts: `packages/protocol/src/resources.ts`, JSON Schema: `schemas/`):

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

Profiles extend Core with domain-specific semantic models. They are profiles of one protocol, not separate protocols.

### 7.1 Frontend Profile

`FrontendComponentContract`: `id`, `name`, `filePath`, `description`, `propsSchema`, `stateFields`, `actionNames`, `elementAgentIds`, `constraints`.

`FrontendVerifyResult`: `status` (`passed`/`failed`), `diff` (state before/after), `surfaceDiff` (A11y), `durationMs`, `evidence`.

### 7.2 Backend Profile

`BackendEndpointContract`: `id` (e.g. `backend.endpoint:POST:/api/orders`), `path`, `method`, `handlerName`, `summary`, `requestSchema`, `responseSchema`, `middleware`, `dbOperations`.

`BackendOperationContract`: `id`, `description`, `inputSchema`, `constraints`, `verification`.

`BackendVerifyResult`: `status`, `statusCode`, `responseBody`, `dbDiff`, `rolledBack`, `durationMs`, `evidence`.

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
| [tokensafe-backend](https://github.com/tokensafe-dev/tokensafe-backend) | Backend Profile accumulator: Go runtime (native typed router, Gin, Chi, net/http) **and** Python/FastAPI runtime (pip package `tokensafe-python`, published from the `python/` subdirectory). |
| [tokensafe-ui](https://github.com/tokensafe-dev/tokensafe-ui) | Frontend Profile accumulator: native SolidJS runtime, React adapter (Zustand/Redux/Context/useReducer), Vue adapter, Vite dev-server bridge. |
| [tokensafe](https://github.com/tokensafe-dev/tokensafe) | Orchestration: Retrofit CLI (`tokensafe integrate`), OUMV Gateway MCP tools, static Level-1 fallback, cross-stack graph. |

### 9.1 Agent Entry Points

The **TokenSafe MCP Gateway is the primary agent entry point** for full installations: its `oumv_*` tools route to live frontend/backend runtimes, fall back to static AST analysis, and merge cross-stack intelligence. The tokensafe-ui standalone MCP server (12 `tokensafe_*` tools) remains available for consumers of the npm package without the full TokenSafe install. Adapters MUST NOT be required to know which entry point an agent uses — both speak the same OUMV methods over the same transports.

---

## 10. Conformance & Certification

Any frontend runtime claiming OUMV compliance MUST pass the test suites in `@oumv/conformance`:
1. **Level 1 (Basic)**: Handshake, L0–L1 Observe, Action Verification.
2. **Level 2 (Standard)**: L2–L3 Observe, Impact Analysis, OCC Mutations, A11y surface diffs.
3. **Level 3 (Full)**: L4 Traces, Dynamic Signals Graph, Runtime Causality (`why_state`).

Conformance fixtures are **language-neutral JSON** (`fixtures/`) so that Go and Python runtimes can be certified with their native toolchains, without TypeScript tooling. A runtime MUST NOT claim a conformance level without a reproducible passing run.

---

## Changelog

- **v1.1-retrofit (2026-11-24)**: Retrofit architecture — resource model & evidence metadata (§6), profiles (§7), normative Mutation Policy (§8: enabled-by-default with guardrails, production fail-closed), error codes −32007…−32011 / −32603, accumulator repository landscape (§9), language-neutral conformance fixtures.
- **v1.0 (2026-11-22)**: Initial draft — transports, handshake, four pillars, error codes −32001…−32006, conformance levels.
