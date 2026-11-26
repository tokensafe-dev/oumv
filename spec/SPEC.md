# The OUMV Protocol Specification (v1.3-guidance)
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

### 9.2 Runtime Discovery & Agent Guidance

An OUMV runtime is only useful if the agent can find it and knows what it is for. Three requirements make that automatic:

1. **Zero-footprint discovery descriptor.** A dev-server sidecar writes a per-workspace descriptor to `~/.tokensafe/runtimes/<sha256(realpath(workspace))[:16]>.json` (mode 0600) — never into the repository. Required fields: `type` (`frontend` | `backend`), `name`, `version`, `url` (JSON-RPC endpoint), `sessionToken`, `capabilities.observeLevels`. Readers MUST prefer this file over port scanning and MUST treat a descriptor without a live handshake as stale.
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

Cases live in `fixtures/conformance-cases.json` (`fixtureVersion` 2). Every case declares the `level` it certifies and may declare `preconditions` such as `verify` (which establishes the runtime evidence that L4/causality cases assert on). Each runtime executes the same file with its native toolchain — no TypeScript required for Go or Python certification.

A case declares its expectations declaratively: `expectResultFields`, `expectError.code`, `expectLevelEquals`, `expectSha256Field`, `expectArrayField`, `expectEvidence`, `expectVersionMatchesContent`.

**OCC is mandatory.** Exactly one case (`apply-edit-without-version-rejected`) omits `expectedVersion`, and it asserts `-32011 VALIDATION_FAILED`. A runtime that accepts an unversioned edit of an existing file cannot pass Level 2.

### 10.3 Certification report

A level claim MUST be accompanied by a report (schema: `schemas/conformance-report.json`) produced by a reproducible run:

```json
{
  "adapterName": "go-gin",
  "framework": "gin",
  "specVersion": "1.1.0",
  "fixtureVersion": 2,
  "total": 15, "passed": 15, "failed": 0,
  "attainedLevel": 3,
  "levels": { "1": "passed", "2": "passed", "3": "passed" },
  "cases": [{ "id": "handshake-negotiates-capabilities", "level": 1, "status": "passed" }],
  "generatedAt": "2026-11-26T09:20:37Z"
}
```

Reports are committed per adapter (e.g. `tokensafe-backend/certification/*.json`) and regenerated in CI, so a claim that stops passing is visible as a failing build rather than stale prose. An adapter MUST NOT advertise capabilities or observe levels it does not implement: over-claiming is a conformance failure in its own right.

---

## Changelog

- **v1.3-guidance (2026-11-26)**: handshake negotiation rules (profile required, no over-claiming, absent capability = unsupported), new §9.2 Runtime Discovery & Agent Guidance (zero-footprint descriptor contract, first-contact activation, no-trace injection preference).
- **v1.2-conformance (2026-11-26)**: §10 rewritten — per-profile level definitions (frontend/backend), level-tagged fixtures (v2, `preconditions`), cumulative level derivation, mandatory-OCC guard case, and the certification report artifact (`schemas/conformance-report.json`) that a level claim must reference.
- **v1.1-retrofit (2026-11-24)**: Retrofit architecture — resource model & evidence metadata (§6), profiles (§7), normative Mutation Policy (§8: enabled-by-default with guardrails, production fail-closed), error codes −32007…−32011 / −32603, accumulator repository landscape (§9), language-neutral conformance fixtures.
- **v1.0 (2026-11-22)**: Initial draft — transports, handshake, four pillars, error codes −32001…−32006, conformance levels.
