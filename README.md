# oumv

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Protocol Version](https://img.shields.io/badge/OUMV-v1.0--draft-orange)](spec/SPEC.md)

> **The universal protocol and standard for autonomous AI coding agents to Observe, Understand, Mutate, and Verify live running web interfaces.**

---

## What is OUMV?

OUMV (Observe, Understand, Mutate, Verify) is an open, transport-agnostic communication standard for AI agents interacting with running user interfaces.

Much like **LSP (Language Server Protocol)** standardizes code editing across IDEs, and **MCP (Model Context Protocol)** standardizes tool calling for LLMs, **OUMV** standardizes how AI agents:
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

Read the complete RFC specification in [spec/SPEC.md](spec/SPEC.md).

---

## License

MIT © 2026 TokenSafe & Contributors
