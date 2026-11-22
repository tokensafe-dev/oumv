# OUMV: The Universal Agent-UI Protocol
### Observe · Understand · Mutate · Verify

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/tokensafe-dev/oumv/blob/main/LICENSE)
[![Protocol Version](https://img.shields.io/badge/OUMV-v1.0--draft-orange)](https://github.com/tokensafe-dev/oumv/blob/main/spec/SPEC.md)
[![Specification](https://img.shields.io/badge/docs-RFC%20Specification-blue)](https://github.com/tokensafe-dev/oumv/blob/main/spec/SPEC.md)

> **OUMV (Observe, Understand, Mutate, Verify) is the open, transport-agnostic standard that enables autonomous AI coding agents to inspect, reason about, edit, and verify running user interfaces with zero context waste.**

---

## What is OUMV?

Much like **LSP (Language Server Protocol)** standardizes code editing across IDEs, **DAP (Debug Adapter Protocol)** standardizes debugging runtimes, and **MCP (Model Context Protocol)** standardizes tool execution for LLMs:

**OUMV (The Universal Agent-UI Protocol)** standardizes how AI agents interface with running frontends across any framework (`tokensafe-ui`, React, Vue, Solid, Svelte):
1. **Observe**: Progressive context disclosure (L0 Pulse, L1 Surface, L2 Contract, L3 Source, L4 Traces) without wasting tokens on raw HTML.
2. **Understand**: Live dynamic signals graphs, impact analysis, and runtime causality (*"Why is this button disabled?"*).
3. **Mutate**: Symbol-level source editing with Optimistic Concurrency Control (OCC) and pre-flight syntax guards.
4. **Verify**: Low-millisecond synchronous action verification with structured state and accessibility diffs.

---

## Protocol Architecture

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
