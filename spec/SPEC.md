# The OUMV Protocol Specification (v1.0-draft)
**Standardized Agent-UI Interaction Protocol**

- **Date**: 2026-11-22  
- **Status**: Draft Standard  
- **Author**: Oleg Savelev  
- **Repository**: [github.com/tokensafe-dev/oumv](https://github.com/tokensafe-dev/oumv)

---

## 1. Abstract

The **OUMV Protocol** (Observe, Understand, Mutate, Verify) defines an open, transport-agnostic standard for autonomous AI coding agents to inspect, reason about, modify, and verify running graphical user interfaces in real time.

Much like the **Language Server Protocol (LSP)** decouples code intelligence from editor implementations, and the **Model Context Protocol (MCP)** standardizes tool calling for LLMs, **OUMV** decouples agent UI interaction from framework specifics (tokensafe-ui, React, Vue, Solid, Svelte).

```text
       AI Coding Agent (Claude Code / Codex / Antigravity)
                             │
                             ▼
               [ OUMV Protocol Specification ]
        (Observe · Understand · Mutate · Verify Interfaces)
                             │
            ┌────────────────┼────────────────┐
            ▼                ▼                ▼
  [ tokensafe-ui Adapter ] [ React Adapter ] [ Vue Adapter ]
            │                │                │
   tokensafe-ui Runtime React + Hooks    Vue 3 Reactivity
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
  "runtimeInfo": { "name": "agent-dom", "version": "0.3.0" },
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

---

## 6. Conformance & Certification

Any frontend runtime claiming OUMV compliance MUST pass the test suites in `@oumv/conformance`:
1. **Level 1 (Basic)**: Handshake, L0–L1 Observe, Action Verification.
2. **Level 2 (Standard)**: L2–L3 Observe, Impact Analysis, OCC Mutations, A11y surface diffs.
3. **Level 3 (Full)**: L4 Traces, Dynamic Signals Graph, Runtime Causality (`why_state`).
