---
name: oumv-protocol
description: "Universal OUMV (Observe, Understand, Mutate, Verify) protocol guide for autonomous AI coding agents interacting with running web interfaces. Trigger on: 'oumv', 'OUMV protocol', 'observe UI', 'understand UI state', 'why is button disabled', 'OCC mutation', 'verify UI action', 'oumv client'."
---

# Universal OUMV Protocol Agent Skill

The **OUMV Protocol** (Observe, Understand, Mutate, Verify) standardizes how autonomous AI coding agents inspect, reason about, edit, and verify live user interfaces across different frontend frameworks (`tokensafe-ui`, React, Vue, Solid).

---

## 1. Protocol Architecture & Lifecycle

The agent connects to an OUMV runtime via In-Memory, HTTP/WebSocket JSON-RPC 2.0, or MCP Server tools:

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
```

### 1.1 Handshake (`oumv/handshake`)
Upon connection, negotiate capabilities:
- **`observe`**: supported levels (`L0`–`L4`) and formats (`yaml`, `json`, `sexp`).
- **`understand`**: `causality`, `signalsGraph`, `impactAnalysis`.
- **`mutate`**: `occ` (Optimistic Concurrency Control), `syntaxGuard`.
- **`verify`**: `multiMetric` timings, `surfaceDiff`.

---

## 2. The Four Pillars Specification

### Pillar 1: OBSERVE (`oumv/observe`)
Progressive context disclosure guarantees zero context bloat:

| Level | Name | Purpose | Token Budget |
| :--- | :--- | :--- | :--- |
| **L0** | **Page Pulse** | Route, mounted roots, errors, loading state. | ~20 tokens |
| **L1** | **Surface** | Focused interactive map (buttons, inputs, roles, actions). | ~100–250 tokens |
| **L2** | **Contract** | Targeted component state schema, props, actions, and effects. | ~80 tokens |
| **L3** | **Source** | Symbol-level source code with line mapping and OCC version token. | ~300–600 tokens |
| **L4** | **Traces** | Event log, signal mutation timeline, active subscriptions. | On-demand |

**Directive**: ALWAYS inspect **L0 + L1** first. Only query **L2** or **L3** when a specific component anomaly is targeted.

### Pillar 2: UNDERSTAND (`oumv/understand`)
Never guess causality or assume state dependencies:
- **Causality (`query: "causality"` / `"why_state"`)**:
  Answers *"Why is button#submit disabled?"* by querying runtime signal subscribers:
  $$\text{Signal (state.email)} \longrightarrow \text{Computed (isValid)} \longrightarrow \text{DOM Binding (button[disabled])}$$
- **Impact Analysis (`query: "impact"`)**:
  Answers *"What components will break if I modify stateKey X?"* before making code edits.

### Pillar 3: MUTATE (`oumv/getSource` & `oumv/applyEdit`)
All code mutations MUST strictly follow **Optimistic Concurrency Control (OCC)**:
1. Call `getSource(componentId, filePath)`.
2. Extract the concurrency token: `version: "sha256:..."`.
3. Apply surgical edits and call `applyEdit(filePath, source, expectedVersion)`.
4. If concurrent writes occurred on disk, the runtime responds with `CONFLICT_DETECTED` (-32001).

### Pillar 4: VERIFY (`oumv/verify`)
Provides sub-millisecond to low-millisecond local action verification:
- Dispatches pure actions or managed effects in memory.
- Returns structured state diffs (`diff`): `{ [key]: { before, after } }`.
- Returns accessibility surface diffs (`surfaceDiff`): `{ op: "attr" | "text" | "visibility", target, before, after }`.
- Returns high-resolution latency telemetry:
  $$\Delta t = t_{\text{action}} + t_{\text{schema}} + t_{\text{propagation}} + t_{\text{dom}} + t_{\text{total}}$$

---

## 3. Agent Recovery Loop (Handling Diagnostics & Errors)

When an operation fails, handle the standard protocol error code:

### 1. `CONFLICT_DETECTED` (Code: -32001)
- **Cause**: The file was modified on disk since `getSource` was called.
- **Recovery**: Re-fetch `getSource` $\rightarrow$ obtain fresh `version` $\rightarrow$ merge changes into updated AST $\rightarrow$ re-submit `applyEdit`.

### 2. `SYNTAX_ERROR` (Code: -32002)
- **Cause**: The submitted code failed TypeScript/JSX AST parsing.
- **Recovery**: Inspect the error payload for `line` and `column` $\rightarrow$ correct syntax without touching the disk file $\rightarrow$ re-submit.

### 3. `SECURITY_VIOLATION` (Code: -32003)
- **Cause**: Path traversal out of workspace jail (`..`) or unmasked API credentials detected.
- **Recovery**: Restrict path within project root; use environment variables for secrets.

### 4. `ACTION_NOT_FOUND` (Code: -32005)
- **Cause**: The requested action or effect does not exist on the component.
- **Recovery**: Inspect `observe(level: 'L2', componentId)` to check valid action/effect names.

---

## 4. Conformance Test Certification

Every OUMV runtime adapter MUST pass the standardized compliance test suite:

```typescript
import { runConformanceSuite } from '@oumv/conformance';
import { createMyAdapter } from './adapter.js';

const adapter = createMyAdapter();
const report = await runConformanceSuite(adapter);
console.log(`Passed: ${report.passed}/${report.total}`);
```
