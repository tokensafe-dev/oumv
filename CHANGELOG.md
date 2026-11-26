# Changelog

The wire contract is versioned by `protocolVersion` (currently **1.1.0**); this
changelog tracks the OUMV specification and its reference tooling.

## Unreleased

- **Golden wire examples.** `examples/wire/{backend,frontend}/<method>.json` capture
  real request/response pairs from the net/http adapter (`TestWireExamples`) and the
  React controller (`capture-wire-examples.mjs`). The conformance suite validates
  every captured params object against `$defs/Request` and every result against
  `$defs/Response`, so the examples cannot drift from the schemas.
- **Capability negotiation (§3.1).** Go, Python and React narrow the advertised
  observe `levels`/`formats` to the client's `requestedCapabilities`; an empty
  intersection is reported as `[]` instead of being widened back.
- **Canonical result types.** `@oumv/schema` (zod) now mirrors §4: observe is
  `{level, format, data, payload?}`, getSource is `path`-keyed, applyEdit returns
  `status/path/newVersion`, verify requires timings/scope. The legacy in-process
  `runConformanceSuite` was removed — the fixture runner is the single definition
  of conformance.
- **React adapter conformance.** Profile metadata moved inside `data` (the envelope
  is `{level, format, data}` plus the optional YAML `payload`), L1 exposes spec
  `elements`, L2/L3 `payload`/`data` are canonical, `getSource` no longer emits the
  `filePath` alias. Two committed reports now exist: `react-vite.json` (offline,
  Level 1 — `verify` answers `-32008` without a tab) and
  `react-vite-browser.json` (**Level 3, 18/18** in headless Chrome via
  `certify-react-browser.mjs` over the committed `certification/app`). The same
  Level 3 result is asserted in `react-conformance.test.ts` with a stubbed bridge.

## v1.0.0 — 2026-11-26 (protocol freeze)

OUMV leaves design-document status: the spec is an implementable contract, every
claim is backed by a fixture run, and certification is reproducible.

### Specification

- **§2 transports.** Normative bindings: HTTP POST with batch arrays (200 for RPC
  errors, 401/403/405/413 for transport failures, `maxBodyBytes`), SSE
  (`GET /__oumv/events`, `trace`/`state`/`heartbeat`, `Last-Event-ID` replay), WebSocket
  (JSON-RPC frames on `/__oumv/rpc`, `notifications/oumv.trace`), stdio NDJSON.
- **§3 sessions.** Handshake issues `sessionId` + `ttlSeconds`; unknown/expired ids
  are `-32011` with `data.reason="session_expired"`; `oumv/disconnect`; concurrent
  sessions per workspace.
- **§4 payloads.** Per-level, per-profile response shapes, the guard order
  `-32003 → -32009 → -32002 → -32011 → -32001 → -32007`, deprecated aliases, and the
  target grammar `"METHOD /path" | "path#symbol" | "component:<id>"`.
- **§9.2 discovery.** The per-workspace file is a registry keyed by profile
  (`frontend`/`backend`) with read-modify-write + atomic rename; the URL,
  `sessionToken` and mounted `transports` live per entry.
- **§10 certification.** Levels are cumulative, a skipped case is not a pass, and a
  level claim requires a report conforming to `schemas/conformance-report.json`.
- **§11 versioning.** One-minor deprecation window for renamed fields; removals
  require a major bump.

### Schemas

- JSON Schema 2020-12 with `$defs` + `anyOf` roots, `additionalProperties: false`,
  per-level `data` unions, sha256 patterns on OCC tokens; new `resources`,
  `descriptor` (registry), `fixtures` and `conformance-report` schemas. Every schema
  is compiled and exercised with positive and negative examples in CI.

### Fixtures (v4) and runners

- 18 language-neutral cases covering handshake/sessions, observe L0–L4 (+ `format`),
  impact, causality, getSource, OCC conflicts, missing `expectedVersion`, syntax
  guard, path traversal, missing resource, real `newVersion`, and solve-based verify.
- Three independent runners consume the same file: Go (`pkg/conformance`), Python
  (`tokensafe_python.conformance`), and TypeScript (`@oumv/conformance`).

### Tooling

- `oumv-certify` (HTTP, WebSocket, stdio): derives the OCC version via
  `oumv/getSource` instead of guessing it, writes the certification report, exits
  non-zero below `--min-level`. It and `oumv-lint-adapter` ship as bins of
  `tokensafe-oumv@1.0.0` (`npx -p tokensafe-oumv oumv-certify …`).
- `oumv-lint-adapter`: validates adapter manifests against `schemas/adapter.json`.
- `adapters/*.json` for gin, chi, net/http, FastAPI and React/Vite, with a CI gate
  that fails any capability claiming a level above its fixture case.

### Reference implementations

- Go: sessions, descriptor registry, SSE/WS handlers, batch, `AutoMount` for
  gin/chi/net/http; capabilities restricted to what is implemented (no YAML, type
  graph, type guard, DB sandbox or payload diff claims).
- Python: sessions, descriptor registry, SSE/WS, honest capabilities, canonical
  verify envelope.
- React/Vite: batch, SSE, WS, per-call trace ring, `type: "frontend"` descriptor
  entry, headless stdio adapter for certification.

### Certification status

| Adapter | Level | Report |
| :--- | :--- | :--- |
| go-gin, go-chi, go-stdhttp, python-fastapi | 3 (18/18) | `tokensafe-backend/certification/*.json` |
| frontend/react | 1 (15/18 offline) | `agent-dom/certification/react-vite.json` |

The React adapter's L2/L3 cases require a live browser tab (`oumv/verify` answers
`-32008` without one, and L4 has no traces); the report records both failures.

### Compatibility

- Wire `protocolVersion` stays **1.1.0**; no field was removed from a previously
  implemented adapter.
- Fixture version is part of every report (`fixtureVersion: 4`), so a level always
  maps to a concrete suite.

### Known limits

- Frontend certification levels 2–3 need a browser-driving harness (Playwright) that
  is not part of this release.
- Node/Express, Django/Flask, Next and Angular adapters are post-1.0 work.
