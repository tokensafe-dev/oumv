# OUMV: The Universal Agent-Runtime Protocol (UARP)
### Observe · Understand · Mutate · Verify

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://github.com/tokensafe-dev/oumv/blob/main/LICENSE)
[![Spec License: CC-BY-4.0](https://img.shields.io/badge/spec-CC--BY--4.0-lightgrey.svg)](https://github.com/tokensafe-dev/oumv/blob/main/spec/LICENSE)
[![Protocol Version](https://img.shields.io/badge/OUMV-v1.1.0-blue)](https://github.com/tokensafe-dev/oumv/blob/main/spec/SPEC.md)
[![Status: Stable](https://img.shields.io/badge/status-stable%20%2F%20v1.1.0-brightgreen)](https://github.com/tokensafe-dev/oumv/blob/main/spec/SPEC.md)
[![Specification](https://img.shields.io/badge/docs-RFC%20Specification-blue)](https://github.com/tokensafe-dev/oumv/blob/main/spec/SPEC.md)

> **OUMV (Observe, Understand, Mutate, Verify) is the open, transport-agnostic standard that enables autonomous AI coding agents to inspect, reason about, safely edit, and verify software systems (user interfaces, backend services, APIs) with zero context waste.**
>
> With the **OUMV Retrofit Architecture**, any existing application (React, Node.js/Express/Fastify, Go, Python/FastAPI; Vue is planned) can adopt OUMV progressively without rewriting its framework.

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
TokenSafe runtime. Certified rows have a committed report or a CI test asserting the level;
uncertified rows are advertised capability, not a claim — a skipped case caps the claim
instead of inflating it (spec §10.1).

| Profile | Stack | Adapter entry point | Certification |
| :--- | :--- | :--- | :--- |
| Frontend | React 18/19 + Vite | `tokensafe-ui/vite` (zero-footprint bridge) | Level 3 (in-process conformance) |
| Frontend | Vue 3 + Vite | — | planned: the Vite plugin serves no OUMV endpoints for Vue yet |
| Backend | Go (Gin / Chi / net/http) | `tokensafe-backend/go/pkg/adapters/*` | Level 3 (all cases) |
| Backend | Python / FastAPI | `tokensafe-backend-python` (`mount_tokensafe`) | Level 3 (all cases) |
| Backend | Node.js / Express, Fastify | `tokensafe-backend/node` | Level 3 (all cases) |

The native SolidJS runtime in `tokensafe-ui` and the `tokensafe.New()` Go framework remain
in the trees as reference implementations for tests; they are not the recommended path.

### Core Concepts

- **Resource Reference (`ResourceReference`)**: Unified descriptor with stable resource ID, URI, source location, and available operations.
- **Evidence Metadata (`EvidenceMetadata`)**: Every discovered relationship carries provenance (`static`, `runtime`, `contract`, `inferred`) and confidence (`confirmed`, `probable`, `unknown`).
- **Standardized Error Model**: one typed JSON-RPC code per failure mode, never a silent no-op — full table in [Error model](#error-model) below.

---

## Error model

Every failure is a typed JSON-RPC error. The normative table is [spec §5.1](spec/SPEC.md); this is the same set, kept in sync by hand.

| Code | Name | Emitted when |
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
| **-32011** | `VALIDATION_FAILED` | Payload violated a contract (missing `expectedVersion`, expired session). |
| **-32603** | `INTERNAL_ERROR` | Unexpected adapter failure. |

`-32010` is reserved and MUST NOT be emitted. `applyEdit` has a fixed guard order: workspace boundary → resource exists → syntax pre-flight → `expectedVersion` present → OCC match → policy (spec §4.3).

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
- [**tokensafe-backend**](https://github.com/tokensafe-dev/tokensafe-backend) — Backend Profile accumulator: Go adapters (`go/` — Gin, Chi, net/http) and the Python runtime (`python/` — FastAPI, SQLAlchemy rollback sandbox), published as `tokensafe-backend-python`. All six adapters are certified Level 3. Exact case counts and fixture revisions are generated from the committed reports in [`tokensafe-backend/certification/`](https://github.com/tokensafe-dev/tokensafe-backend/tree/main/certification), so this page cannot drift from them.
- [**tokensafe**](https://github.com/tokensafe-dev/tokensafe) — Main engine containing the Retrofit CLI (`tokensafe integrate`), out-of-the-box stack detection, and the MCP OUMV Gateway with Level 1 static fallback.

---

## Versioning

Three independent numbers, often mistaken for a mismatch:

| Axis | Current | Meaning |
| :--- | :--- | :--- |
| Standard release | `v1.1.0` (2026-11-26) | Additive MINOR: multi-step verify, symbol/delete/rename mutations, pagination. `tokensafe-oumv` and the monorepo are at 1.1.0. |
| Document revision | `v1.5-canonical` | The revision of `spec/SPEC.md`; see the changelog in that file. |
| Wire `protocolVersion` | `1.2.0` | Sent in `oumv/handshake`. A runtime MUST echo the version it actually serves; clients accept a matching MAJOR. |
| Fixtures | `fixtureVersion 6` (25 cases) | `fixtures/conformance-cases.json`; every report records the revision it ran. |

These axes move independently by design: v1.1.0 ships document revision v1.5-canonical,
wire version 1.2.0 and fixture set v6. A v1.0 adapter stays valid for the capabilities it
declares — new modes answer `-32006` where unimplemented. Implementations negotiate the
**wire** version, never the document revision.

---

## Protocol Specification

Read the complete RFC specification in [spec/SPEC.md](https://github.com/tokensafe-dev/oumv/blob/main/spec/SPEC.md).

---

## License

| Artifact | License |
| :--- | :--- |
| Implementations (`packages/`, `schemas/`, `examples/`) | [Apache-2.0](LICENSE) |
| Specification text (`spec/SPEC.md`) and conformance fixtures (`fixtures/`) | [CC-BY-4.0](spec/LICENSE) |

Apache-2.0 adds an express patent grant (§3), terminates that grant for anyone who sues over
the software, and explicitly excludes trademark rights (§6) — so the code stays open while
the name does not. CC-BY-4.0 lets anyone quote, translate, and implement the spec with
attribution; implementing the protocol neither requires nor grants the code license.

The name "OUMV Certified" and certification reports signed by the maintainers are marks and
are not licensed by either grant. Usage rules, including the certification program and the
fork/package-naming boundaries: [TRADEMARK.md](TRADEMARK.md).
