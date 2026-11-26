# OUMV: The Universal Agent-Runtime Protocol (UARP)
### Observe · Understand · Mutate · Verify

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/tokensafe-dev/oumv/blob/main/LICENSE)
[![Protocol Version](https://img.shields.io/badge/OUMV-v1.3--guidance-orange)](https://github.com/tokensafe-dev/oumv/blob/main/spec/SPEC.md)
[![Specification](https://img.shields.io/badge/docs-RFC%20Specification-blue)](https://github.com/tokensafe-dev/oumv/blob/main/spec/SPEC.md)

> **OUMV (Observe, Understand, Mutate, Verify) is the open, transport-agnostic standard that enables autonomous AI coding agents to inspect, reason about, safely edit, and verify software systems (user interfaces, backend services, APIs) with zero context waste.**
>
> With the **OUMV Retrofit Architecture**, any existing application (React, Vue, SolidJS, Go, Python/FastAPI, Node.js) can adopt OUMV progressively without rewriting its framework.

---

## What is OUMV?

Much like **LSP (Language Server Protocol)** standardizes code intelligence across IDEs and **MCP (Model Context Protocol)** standardizes tool execution for LLMs:

**OUMV (The Universal Agent-Runtime Protocol)** standardizes how AI agents interface with running software systems:
1. **Observe**: Progressive context disclosure (L0 Pulse, L1 Surface, L2 Contract, L3 Source, L4 Traces) without wasting tokens on raw dumps.
2. **Understand**: Live dynamic causality and runtime dependency analysis (*"Why is this request failing / why is this button disabled?"*).
3. **Mutate**: Symbol-level source editing with Optimistic Concurrency Control (OCC) and pre-flight compiler/syntax guards.
4. **Verify**: Low-millisecond synchronous action verification with structured state, API diffs, and accessibility diffs.

---

## Protocol Architecture & Profiles

OUMV Core defines the transport-neutral JSON-RPC 2.0 handshake, OCC mutation lifecycle, session management, and universal resource models:

```text
       AI Coding Agent (Claude Code / Codex / Antigravity)
                             │
                             ▼
               [ OUMV Core Protocol (JSON-RPC) ]
       (Handshake · Sessions · OCC · Error Model · Evidence)
                             │
             ┌───────────────┴───────────────┐
             ▼                               ▼
    [ Frontend Profile ]            [ Backend Profile ]
  (Components · Props · Surface)   (Endpoints · DTOs · Sandboxes)
             │                               │
             ▼                               ▼
       tokensafe-ui                  tokensafe-backend
 (React, Vue, Vite)               (Go: Gin/Chi/net-http · Python: FastAPI)
```

### Supported stacks (adapters, not frameworks of our own)

OUMV ships adapters for stacks users already have; there is no requirement to adopt a
TokenSafe runtime. Each adapter below is certified per spec §10 — reports live in the
implementation repo and are reproduced in CI.

| Profile | Stack | Adapter entry point | Certification |
| :--- | :--- | :--- | :--- |
| Frontend | React 18/19 + Vite | `tokensafe-ui/vite` (zero-footprint bridge) | Level 3 (in-process conformance) |
| Frontend | Vue 3 + Vite | `tokensafe-ui/vite` (DOM level) | L0-L2 advertised, not yet certified |
| Backend | Go (Gin / Chi / net/http) | `tokensafe-backend/go/pkg/adapters/*` | Level 3, 15/15 over HTTP |
| Backend | Python / FastAPI | `tokensafe-python` (`mount_tokensafe`) | Level 3, 15/15 over ASGI |
| Backend | Node.js / Express | — | planned |

The native SolidJS runtime in `tokensafe-ui` and the `tokensafe.New()` Go framework remain
in the trees as reference implementations for tests; they are not the recommended path.

### Core Concepts

- **Resource Reference (`ResourceReference`)**: Unified descriptor with stable resource ID, URI, source location, and available operations.
- **Evidence Metadata (`EvidenceMetadata`)**: Every discovered relationship carries provenance (`static`, `runtime`, `contract`, `inferred`) and confidence (`confirmed`, `probable`, `unknown`).
- **Standardized Error Model**: Distinct codes for `CONFLICT_DETECTED (-32001)`, `SYNTAX_ERROR (-32002)`, `SECURITY_VIOLATION (-32003)`, `TARGET_NOT_FOUND (-32004)`, `UNSUPPORTED_CAPABILITY (-32006)`, `PERMISSION_DENIED (-32007)`, and `RUNTIME_UNAVAILABLE (-32008)`.

---

## Monorepo Packages

| Package | Description | Status |
| :--- | :--- | :--- |
| [`@oumv/protocol`](packages/protocol) | Zero-dependency TypeScript contracts: Core, Frontend Profile, Backend Profile, and Resource models. | Ready |
| [`@oumv/schema`](packages/schema) | Zod runtime validators and JSON Schema declarations for all protocol envelopes. | Ready |
| [`@oumv/conformance`](packages/conformance) | Standardized compliance test suite to certify frontend and backend runtime adapters. | Ready |

---

## Reference Implementations

- [**tokensafe-ui**](https://github.com/tokensafe-dev/tokensafe-ui) — Frontend Profile accumulator: React adapter (`tokensafe-ui/react` — Zustand, Redux, Context, useReducer), Vue adapter (`tokensafe-ui/vue`), and the zero-footprint Vite bridge (`tokensafe-ui/vite`). The native SolidJS runtime remains in the package as a legacy reference implementation, not the recommended path.
- [**tokensafe-backend**](https://github.com/tokensafe-dev/tokensafe-backend) — Backend Profile accumulator: Go adapters (`go/` — Gin, Chi, net/http) and the Python runtime (`python/` — FastAPI, SQLAlchemy rollback sandbox). All four adapters are certified Level 3 (spec §10).
- [**tokensafe**](https://github.com/tokensafe-dev/tokensafe) — Main engine containing the Retrofit CLI (`tokensafe integrate`), out-of-the-box stack detection, and the MCP OUMV Gateway with Level 1 static fallback.

---

## Protocol Specification

Read the complete RFC specification in [spec/SPEC.md](https://github.com/tokensafe-dev/oumv/blob/main/spec/SPEC.md).

---

## License

MIT © 2026 TokenSafe & Contributors
