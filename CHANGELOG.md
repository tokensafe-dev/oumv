# Changelog

The wire contract is versioned by `protocolVersion` (currently **1.6.0**); this
changelog tracks the OUMV specification and its reference tooling.

## v1.5.6 — 2026-11-28 (wire 1.6.0, fixtures v13, revision v1.10)

Pin fix: the React/Vue manifests tracked `tokensafe-ui` 0.1.33, a version that
was never published (the npm package is `packages/tokensafe-ui`, which shipped
the multi-file batch build as 0.1.34). The manifests now name the version that
actually exists; no other change.

## v1.5.5 — 2026-11-28 (wire 1.6.0, fixtures v13, revision v1.10)

Adapter catalog sync after the backend v0.11.0 release; no protocol change.

- **Twelve manifests.** `adapters/next-app-router.json` joins the catalog: the
  Next.js App Router Route Handler is certified Level 3 (46/46, fixtures v13,
  auth refusals included) as a server-profile adapter; the client-component DOM
  bridge is explicitly not claimed.
- **Pins.** Go manifests install `@v0.11.0` (the module tag that carries the DB
  options and the transport authorizer), `tokensafe-backend-node` 0.9.0,
  `tokensafe-ui` 0.1.33 (multi-file batches), `TokenSafe.Oumv.AspNetCore` 0.2.0.
- `compatibility.json` gains the v1.5.5 row.

## v1.5.4 — 2026-11-28 (wire 1.6.0, fixtures v13, revision v1.10)

Transport auth stops being folklore and becomes a certified contract; no wire
changes.

- **Spec revision v1.10-canonical (§2.2/§12).** The refusal every runtime
  already implemented is now normative: a missing, invalid or wrong-scheme
  credential answers **HTTP 401 before dispatch**, a non-loopback bind with no
  token configured answers **HTTP 403**, and both bodies carry the §5.1 registry
  envelope with `-32007` (403 adds `data.reason="token_required_non_loopback"`).
  No method runs for a refused request, so this is not a JSON-RPC method error.
  SSE/WS endpoints served by an authenticated binding must refuse an
  unauthenticated connection too.
- **Fixtures v13 — the `authCases` family.** Three cases send an ordinary
  `oumv/observe`/`oumv/handshake` request with a deliberately defective
  credential (`auth: missing | invalid | wrong-scheme`) and assert the HTTP
  status plus `-32007`. They run only when the certifier passes
  `oumv-certify --auth` (the target was started with auth enabled) and the
  transport can report a status; a stdio binding has no transport auth, so the
  family is absent there and nothing is claimed that was not run. The report's
  `environment.auth: "required"` records the mode.
- **Conformance runner.** Transports may now report a transport status
  (`requestWithStatus`), requests accept per-case controls (`headers`,
  `omitAuth`), and cases may declare `headers` merged into that single request
  after the transport's auth headers.
- **Golden corpus.** `examples/wire/auth/transport-auth.json` freezes the
  refusals captured from the Express adapter: three 401s carrying `-32007` and a
  positive control that the same request with the configured token is dispatched.
- **`compatibility.json`** gains the v1.5.4 row (revision v1.10, fixtures 13).

## v1.5.3 — 2026-11-28 (wire 1.6.0, fixtures v12)

Patch to v1.5.2: the Go manifests pinned `go@v0.9.1`, which is the previous
backend release (the Go module tag that carries the permissions policy and the
fixtures-v12 work is `go/v0.9.2`). Install commands corrected; no other change.

## v1.5.2 — 2026-11-28 (wire 1.6.0, fixtures v12)

Fixtures v12 makes §4.1 result versioning testable and the adapter catalog
truthful; no wire changes.

- **Fixtures v12 — the §4.1 handshake as ordered cases.** `observe` and
  `understand` must carry `workspaceVersion`, a matching `ifVersion` must answer
  the short `{unchanged, workspaceVersion}` envelope, and a stale token must be
  rejected with `-32010` + `data.reason="stale_version"`. They are gated by a new
  case field, `minWireVersion`, so a runtime frozen on wire 1.5.0 skips them
  instead of failing them — the honest alternative to a capability gate for a
  normative-core feature.
- **Conformance runner.** `minWireVersion` gating and a `${WORKSPACE_VERSION}`
  marker captured just in time: earlier cases legitimately mutate the workspace,
  so a token captured up front would already be stale.
- **Adapter manifests.** `dotnet-aspnetcore.json` added (the adapter shipped on
  NuGet without a manifest, so the CI capability gate never saw it); the Go, Node,
  Python, React and Vue manifests now declare the wire 1.6.0 capabilities their
  certifications prove (157 claims across 11 manifests).
- **Java and PHP sidecars are frozen at wire 1.5.0 on purpose** — the handshake
  negotiates `1.5.0` instead of claiming a core they do not implement. Their
  reports stay at 32/33 with the documented L4 gap.
- `-32007` gains the `query_disabled` reason for §14.2 `permissions.query`.
- Spec fixes: §14.2 capability name harmonised to `observeQuery.readOnly`, §10.2
  documents `minWireVersion`, stale fixture pins and adapter counts corrected.

## v1.5.1 — 2026-11-27 (wire 1.6.0, fixtures v11)

Patch follow-up to v1.5.0, no wire changes: the golden wire corpus now covers
all eleven methods from live runtimes (backend from the net/http adapter —
including the honest `-32001`/`-32006` refusals; frontend from the React
controller — including the §14 `-32601` answers for index/query/build),
METHOD_SCHEMAS pins the full surface, `oumv-cancel.json` schema added, the
preview capability case clears `${NEW_FILE}` before running, and §4.1 gains
the §8 result-versioning note (`workspaceVersion`/`ifVersion`, `-32010`).

## v1.5.0 — 2026-11-27 (wire 1.6.0, fixtures v11)

Agent-UX MINOR: the protocol closes the loop an agent actually runs — find what to read,
preview before writing, get the compiler's verdict, interrupt what hangs.

- **`oumv/previewEdit` (§4.4, capability `mutate.preview`).** applyEdit's guard order
  (boundary → existence → syntax → version → OCC → policy) as a dry-run: per-file
  `{wouldApply, currentVersion, newVersion, diff, syntaxCheck}` and `applied: false`.
  Never writes, never consumes the OCC token.
- **Correlation, timeouts, cancellation, idempotency (§3).** `params.requestId` is echoed
  in replies; per-method `timeoutMs` answers `-32008 reason="timeout"` with the partial
  write rolled back; `oumv/cancel` is best-effort (unknown id answers `{cancelled: false}`,
  never an error); `idempotencyKey` on applyEdit/previewEdit replays the FIRST result —
  a retry of a successful create no longer answers `-32001 file_exists`
  (capability `sessions.idempotency`, proven by `apply-edit-idempotency-key-replays`).
- **§14 optional extensions** (the §13 `oumv/graph` pattern: `-32601` when absent,
  capability-gated): `oumv/index` (§14.1, `index.symbols`) — repo-wide symbol search
  ranked exact > prefix > qualified-suffix > substring with reverse-edge counts;
  `oumv/query` (§14.2, `observeQuery.readOnly`) — runtime-enforced read-only SQL
  (SELECT/EXPLAIN only, `-32003 query_forbidden` otherwise, opt-in, policy-disableable);
  `oumv/build` (§14.3, `verify.build`) — run the build/test command and return structured
  `diagnostics` with an honest `skipped` + `skipReason` path.
- **Diagnostics events (§2.6, capability `events.diagnostic`).** The `diagnostic`
  event (SSE) / `notifications/oumv.diagnostic` (WS) carries
  `{severity, source, file?, line?, message, tool?, ts}` for build/test/HMR failures the
  runtime already observes.
- **Error registry.** `schemas/errors.json` is the canonical code set;
  `packages/protocol/src/errors.ts` is generated (`scripts/gen-errors.mjs`, CI-checked);
  spec §5.1 and README tables are rendered 1:1 from it (conformance-checked). Reconciled:
  `-32004` = TARGET_NOT_FOUND, `-32010` is active as `STALE_RESOURCE_VERSION`, rate
  limiting gets its own `-32012 RATE_LIMITED` (was overloading `-32005`).
- **Versioning & security.** §11 adds `compatibility.json` (generated cross-repo matrix)
  and a deprecation-notice field (`data.deprecated`/`data.since`/`data.useInstead`).
  §12 formalizes non-loopback bindings: token REQUIRED, TLS/tunnel, discovery by
  explicit URL, the local registry stays loopback-only.
- **Fixtures v11.** Capability cases for every new surface, gated on the handshake claim
  (a runtime that does not advertise stays absent from the report); the reference runtime
  serves wire 1.6.0 and implements all new methods, including the idempotency map.

## v1.4.0 — 2026-11-27 (wire 1.5.0, fixtures v10)

Additive MINOR: two long-standing gaps in the contract's evidence are closed by the wire
itself, not by an adapter-specific extension.

- **`applyEdit` multi-file batch.** A request may carry `edits: [{path, mode?,
  expectedVersion?, replacement?, hunks?}]` (1..16 items, modes `replace|create|patch`).
  Every item is jail-, version- and syntax-checked before the first byte is written; a
  write failure restores the files already written and answers `-32603` with
  `data.rolledBack` and `data.editIndex`. Item-scoped errors carry `data.editIndex` and
  `data.path`; the result is `{status: "APPLIED", edits: [{path, newVersion, created?,
  hunksApplied?}]}`. Advertised as `capabilities.mutate.multiFile` and proven by
  `apply-edit-batch-applies-all` and `apply-edit-batch-is-atomic` (the second case also
  asserts, through a `followUp`, that the first path does not exist).
- **Session TTL negotiation.** The handshake accepts `sessionTtlSeconds` (1..86400,
  clamped), issues the session with the granted lifetime and echoes it as `ttlSeconds`;
  advertised as `capabilities.sessions.ttlSeconds`. The new `sessionCases` family issues
  a one-second session, waits it out and asserts `-32011` with
  `data.reason="session_expired"` (`expired-session-is-rejected`).
- **Runners.** All three reference runners (`@oumv/conformance`, Go, Python) grew
  `sessionCases`, `cleanup` paths and a `followUp` call for capability cases, plus
  `expectError.data` matching. A case a runtime does not claim stays out of its report.
- **Defect fixed while regenerating the golden examples.** The Go handshake rejected a
  client that asked for the runtime's own version (`minor > 3` while serving 1.4.0); the
  frozen example showed the rejection and nobody noticed. Go now accepts every minor up
  to the one it serves.
- **Certification.** Go (gin/chi/net-http), Node (Express/Fastify) and Python (FastAPI)
  at Level 3, 37/37; Java and PHP sidecars at Level 2, 32/33 (L4 traces, by design);
  React and Vue in a real browser at Level 3, 34/34; SSE/WS transport certificates at
  Level 3, 38/38, including the new batch and expired-session cases.

## v1.3.0 — 2026-11-27 (wire 1.4.0, fixtures v9)

No `protocolVersion` bump: the wire request/response shapes do not change. What changes
is what a transport claim has to prove.

- **Fixtures v8: `pushCases`.** Two cases assert the optional bindings (§2.3/§2.4):
  a successful `applyEdit` is pushed as SSE `event: state` / WS
  `notifications/oumv.state` with the resource path and operation, and reconnecting
  SSE with `Last-Event-ID` replays the missed event. Push cases run only for the
  transport a certificate is produced for.
- **`oumv-certify --sse <events-url>`** certifies the SSE binding (requests stay on
  `--url`); `--ws` now also runs the WS push case. The report records
  `environment.transport`.
- **Reference runtimes emit `state`.** Go, Node and Python publish a mutation on a
  monotonic event log after the bytes are on disk; SSE ids become monotonic integers
  (was: a timestamp in Go/Python, a ring position in Node) and `Last-Event-ID` replays
  both `trace` and `state`. WS notifications are bound to the handshake session and
  the socket close ends it. The Vite plugin's SSE/WS bindings share the same id space.
- **Certificates:** Node Express and Fastify now have `sse`/`ws` transport reports
  (`certification/transports/*.json` in `tokensafe-backend`), each Level 3, 34/34.
  Go and Python behaviour is covered by their native transport tests; their own
  transport certificates follow the same CLI.

## v1.2.1 — 2026-11-27 (adapters and scoped-edit diagnostics)

No `protocolVersion` bump: the wire request/response shapes do not change. The
additions are two adapters, one frontend adapter brought to 1.3.0, and extra fields
inside `error.data` for an error that already existed.

- **Vue 3 + Vite adapter** (`frontend/vue`, `agent-dom`): the `tokensafeUi()` plugin
  now serves `/__oumv/rpc` for a Vue app instead of returning early, with a browser
  bridge that reads the Vue app instance (no instrumentation), a canonical 1.3.0
  controller (`data` envelope, `mode=patch`, `getSource` window/`ifVersion`, sessions,
  guard order, `understand` impact/causality), and a real-browser certificate:
  `agent-dom/certification/vue-vite-browser.json` — Level 3, 33/33, fixtures v7.
  The in-memory `createVueAdapter` answers the same canonical shapes.
- **`backend/java-spring`** (`tokensafe-backend/java`): JDK-only sidecar (single source
  file, no Maven/Gradle/Spring jars) that scans `@RestController` mappings, serves HTTP
  and stdio, applies OCC-checked edits (`replace|create|delete|rename|symbol|patch`)
  and verifies by running a configured compile/test command. Level 2, 32/33 — no live
  app, so L4 traces fail and Level 3 is not claimed.
- **`backend/php-laravel`** (`tokensafe-backend/php`): dependency-free PHP sidecar for
  Laravel `Route::` declarations and Symfony `#[Route]` attributes, with
  `token_get_all()` handler ranges, `php -l` pre-flight and the same OCC/guard set.
  Level 2, 32/33 for the same reason.
- **`-32011 target_not_unique` is now actionable** (`error.data`, additive): the error
  carries `occurrences: [{line, text}]` and `suggestedHunks` (ready-to-use scoped hunks)
  beside `count`/`lines`. Clients can retry with one parameter instead of re-reading the
  file. Verified in Go, the Vue controller, the Node/Python runners' fixtures and the
  TokenSafe `apply_edits` tool, which also auto-scopes a repeated target to the window
  the session last read when exactly one occurrence is inside it — never when two are.

## v1.2.0 — 2026-11-27 (wire 1.3.0, fixtures v7)

Minor, additive release: every v1.1 adapter stays valid for the capabilities it
declares, and an adapter without the new mode answers `-32006` rather than falling
back to `replace`.

- **`applyEdit mode=patch`** (§4.3): `hunks: [{target, replacement, startLine?, endLine?,
  replaceAll?}]`, applied in order to the evolving text under OCC. `target` is a literal
  snippet; it must occur exactly once unless scoped by lines or `replaceAll`. Zero matches
  is `-32009 target_not_found`, several are `-32011 target_not_unique` with `count` and
  `lines`, the first failing hunk aborts with **no bytes written**, and the result carries
  `hunksApplied`. This is the mode that stops re-emitting a file to change one line: the
  measured 3-arm matrix showed the whole-resource mutation unit costing 2.3× the output
  tokens of a hunk-based editor.
- **`getSource` windows and dedup** (§4.3): `startLine`/`endLine` return a 1-based
  inclusive window (end clamped to EOF) while `version` stays the sha256 of the whole file,
  so OCC never depends on the window; `ifVersion` answers `{unchanged: true}` with no
  `source` when the file still matches, instead of resending bytes the agent already has.
  An unknown `symbol` is `-32009`, never the whole file under a symbol label.
- **Runtimes aligned with §4/§5** (behaviour fixes, no shape change): Python `observe`
  L0/L1/L4 data now match the spec; Python stops emitting the deprecated `version` and the
  non-spec `mode` in `applyEdit`, and reports `-32602` for a missing `target`; Go returns
  `-32009` for an unknown `symbol` and `-32008` for verify without a runtime; `handshake`
  validates `protocolVersion` in all three runtimes; an unknown `understand` query is
  `-32006` everywhere (an unresolvable target stays an empty `observed:false` result, §5.2);
  unknown `observe` levels are `-32006` everywhere.
- **Fixtures v7**: patch (applied, not-found, not-unique), getSource window and `ifVersion`,
  unknown symbol, delete/rename validation, unknown mode, observe unknown level, verify
  missing target and unavailable sandbox, handshake version rejection. All reports re-run;
  `fixtureVersion` is **7** and `protocolVersion` **1.3.0** in every schema and runtime.

## v1.1.0 — 2026-11-26 (wire 1.2.0, fixtures v6)

Minor, additive release: every v1.0 adapter stays valid for the capabilities it declares.

- **`applyEdit` modes `symbol`, `delete`, `rename`** (§4.3): `symbol` replaces one function,
  method or class without re-emitting the file (OCC + syntax pre-flight on the result);
  `delete`/`rename` are jail-checked and OCC-guarded, `renameTo` names the destination, and
  the result carries `deleted`/`newPath`; `replacement` is forbidden for both.
- **`verify.steps`** (§4.4): ordered requests against **one application instance**, one
  `steps[]` entry each — the duplicate-idempotency repro single-request verify could not
  express. A runtime that cannot share state answers `-32006 reason=multi_step_unsupported`.
- **Observe pagination** (§4.1): `limit`/`cursor` for L1/L4, `hasMore`/`nextCursor` when a
  page is truncated; an absent limit still returns the whole collection.
- **§12 security & rate-limit policy** (auth headers, fail-closed production, jail incl.
  `renameTo`, 429/`Retry-After`) and the informative **§13 cross-stack graph**
  (`oumv/graph`, optional, no certification claim in v1.1).
- **Fixtures v6 (25 cases)**: multi-step verify, symbol edit, delete, rename, L1 pagination;
  new declarative assertion `expectValues` (JSON-path equality). All reports re-run at
  **Level 3, 25/25**: go-gin/go-chi/go-stdhttp/python-fastapi/node-express/node-fastify,
  React in headless Chrome, and Node/Python over stdio (offline React 21/25 Level 1, the
  four browser-only cases named).
- Implemented in Go, Python, Node and the React controller; `protocolVersion` is **1.2.0**.

## v1.0.1 — 2026-11-26 (reference tooling patch)

No wire changes: `protocolVersion` stays **1.1.0** and the v1.0.0 fixtures/reports stay
valid. This release ships the adapter-level fixes found by the first measured agent matrix.

- **Go adapter: `observe L3` accepts endpoint targets** per the §4 grammar (`"METHOD /path"`,
  `"/path"`). Adapters that hold the handler function register its reflection-derived
  `file:line` (`RegisterRouteSource`), and the runtime returns the innermost enclosing
  function with the sha256 OCC version. One call now replaces search + read for a route.
- **React controller: symbol slices for class methods** (`toggleTask` and
  `Store.toggleTask`), so `getSource` no longer falls back to the whole file; the
  deprecated §4.6 `payload` alias is no longer emitted by `observe` (it duplicated `data`
  and doubled L1). `create` mode and the OCC guards are unchanged.
- **Measured agent matrix** published by the product repositories (Go and React/Vite,
  3 tasks × 3 runs × 2 arms, real oracle, provider `usage`); this repo only links to the
  reports in [`docs/BENCHMARKS.md`](docs/BENCHMARKS.md).

- **`applyEdit` gains `mode: "create"`** (§4.3): new files are written through the
  protocol instead of shell redirects, with the guard order jail → version-forbidden →
  syntax → must-not-exist, `created: true` in the result, and `delete`/`rename` reserved
  behind `-32006`. Implemented in Go, Python, Node and the React controller.
- **Fixtures v5 (20 cases)** add `create-new-file` and `create-existing-file-rejected`;
  all six backend adapters and the React adapter re-certified (20/20; React Level 3 in a
  browser, Level 1 offline with the three browser-only failures named).
- `tokenEstimate` semantics defined (payload tokens under the adapter's tokenizer, omit
  rather than guess); `rolledBack`/`rollbackStatus` documented as normally omitted until
  a runtime implements rollback.

- **Node/Express/Fastify adapter** (`tokensafe-backend/node`, `tokensafe-backend-node`):
  one framework-neutral runtime (sessions, OCC guards in normative order, Babel syntax
  guard, route introspection, trace ring, loopback verify, discovery registry) with
  Express and Fastify bindings over HTTP (batch included), SSE and WebSocket.
  Certified **Level 3, 20/20** (fixtures v5) in `tokensafe-backend/certification/node-express.json`
  and `node-fastify.json`; `adapters/*.json` and the capability gate cover both.

- **Golden wire examples.** `examples/wire/{backend,frontend}/<method>.json` capture
  real request/response pairs from the net/http adapter (`TestWireExamples`) and the
  React controller (`capture-wire-examples.mjs`). The conformance suite validates
  every captured params object against `$defs/Request` and every result against
  `$defs/Response`, so the examples cannot drift from the schemas.
- **Capability negotiation (§3.1).** Go, Python and React narrow the advertised
  observe `levels`/`formats` to the client's `requestedCapabilities`; an empty
  intersection is reported as `[]` instead of being widened back.
- **Canonical result types.** `@oumv/schema` (zod) now mirrors §4: observe is
  `{level, format, data}`, getSource is `path`-keyed, applyEdit returns
  `status/path/newVersion`, verify requires timings/scope. The legacy in-process
  `runConformanceSuite` was removed — the fixture runner is the single definition
  of conformance.
- **React adapter conformance.** Profile metadata moved inside `data` (the envelope is
  `{level, format, data}` only — the deprecated `payload` alias is never emitted), L1
  exposes spec `elements`, L2/L3 `data` is canonical, `getSource` no longer emits the
  `filePath` alias. Two committed reports now exist: `react-vite.json` (offline,
  Level 1 — `verify` answers `-32008` without a tab) and
  `react-vite-browser.json` (**Level 3, 20/20** in headless Chrome via
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
