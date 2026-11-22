# OUMV: The Universal Agent-Runtime Protocol (UARP)
### Observe · Understand · Mutate · Verify

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/tokensafe-dev/oumv/blob/main/LICENSE)
[![Protocol Version](https://img.shields.io/badge/OUMV-v1.0--draft-orange)](https://github.com/tokensafe-dev/oumv/blob/main/spec/SPEC.md)
[![Specification](https://img.shields.io/badge/docs-RFC%20Specification-blue)](https://github.com/tokensafe-dev/oumv/blob/main/spec/SPEC.md)

> **OUMV (Observe, Understand, Mutate, Verify) is the open, transport-agnostic standard that enables autonomous AI coding agents to inspect, reason about, edit, and verify running software systems (user interfaces, backend services, APIs) with zero context waste.**

---

## What is OUMV?

Much like **LSP (Language Server Protocol)** standardizes code editing across IDEs, **DAP (Debug Adapter Protocol)** standardizes debugging runtimes, and **MCP (Model Context Protocol)** standardizes tool execution for LLMs:

**OUMV (The Universal Agent-Runtime Protocol)** standardizes how AI agents interface with running software systems across any runtime (frontend: `tokensafe-ui`, React, Vue; backend: `tokensafe-backend`, Go, Node.js):
1. **Observe**: Progressive context disclosure (L0 Pulse, L1 Surface, L2 Contract, L3 Source, L4 Traces) without wasting tokens on raw dumps.
2. **Understand**: Live dynamic causality and runtime dependency analysis (*"Why is this request failing / why is this button disabled?"*).
3. **Mutate**: Symbol-level source editing with Optimistic Concurrency Control (OCC) and pre-flight compiler/syntax guards.
4. **Verify**: Low-millisecond synchronous action verification with structured state, API diffs, and accessibility diffs.

---

## Protocol Architecture

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

## Monorepo Packages

| Package | Description | Status |
| :--- | :--- | :--- |
| [`@oumv/protocol`](packages/protocol) | Zero-dependency TypeScript contracts, message envelopes, and capability types. | Ready |
| [`@oumv/schema`](packages/schema) | Zod runtime validators and JSON Schema declarations. | Ready |
| [`@oumv/conformance`](packages/conformance) | Standardized compliance test suite to certify runtime adapters. | Ready |

---

## Reference Implementations & Adapters

- [tokensafe-ui](https://github.com/tokensafe-dev/tokensafe-ui) — The native reactive micro-framework implementing the OUMV protocol.
- `@oumv/react` *(Planned)* — React adapter with Fiber hooks introspection.
- `@oumv/vue` *(Planned)* — Vue 3 adapter with reactivity effect tracking.

---

## Protocol Specification

Read the complete RFC specification in [spec/SPEC.md](https://github.com/tokensafe-dev/oumv/blob/main/spec/SPEC.md).

---

## License

MIT © 2026 TokenSafe & Contributors
