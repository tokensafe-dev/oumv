# Writing an OUMV adapter

An **adapter** binds the protocol to one framework: it exposes the transport
endpoints of [SPEC §2](../spec/SPEC.md#2-transports--wire-framing) and answers the
four pillars with real evidence from the running application. Everything an agent
sees goes through this surface, so the adapter — not the agent — owns the honesty
rules: no invented traces, no level claims without a report.

Nothing here requires TypeScript: the wire contract is JSON-RPC 2.0 and the
conformance fixtures are language-neutral.

---

## 1. What an adapter must provide

| Surface | Requirement |
| :--- | :--- |
| Handshake | `oumv/handshake` → `protocolVersion`, `profile`, `runtimeInfo{name,version}`, `capabilities`, `sessionId` (§3.1) |
| Pillars | `oumv/observe` (L0–L4 available per profile), `oumv/understand` (impact, causality), `oumv/getSource` + `oumv/applyEdit` (mandatory OCC), `oumv/verify` |
| Sessions | `sessionId` validated when supplied; unknown/expired → `-32011` with `data.reason="session_expired"`; `oumv/disconnect` closes it |
| Guards | normative order `-32003 → -32009 → -32002 → -32011 → -32001 → -32007` (§4.3) |
| Transports | HTTP POST is mandatory (§2.2); SSE (§2.3), WebSocket (§2.4) and stdio (§2.5) are optional but must be advertised where implemented |
| Discovery | `~/.tokensafe/runtimes/<sha256(realpath(workspace))[:16]>.json`, mode `0600`, shape of `schemas/descriptor.schema.json` (§9.2) |

Reports are the only accepted proof of a level claim: `schemas/conformance-report.json`.

---

## 2. Minimal skeleton

### Go (net/http, gin, chi)

```go
import (
    "github.com/tokensafe-dev/tokensafe-backend/go/pkg/oumv"
    "github.com/tokensafe-dev/tokensafe-backend/go/pkg/adapters/stdhttp"
)

rt := oumv.NewRuntime(oumv.Config{
    Name:    "my-service",
    Runtime: oumv.DefaultDevelopmentRuntimeConfig(), // auth token, workspace root, limits
})

// POST/OPTIONS /__oumv/rpc, GET /__oumv/rpc→WS upgrade, GET /__oumv/events→SSE
stdhttp.AutoMount(mux, rt, "/__oumv")

rt.WriteDescriptor("http://127.0.0.1:8080/__oumv/rpc") // 0600, outside the repo
```

`gin.AutoMount` and `chi.AutoMount` take the same arguments; the route-registration
constraints (no `Any` + `GET` on the same path) are handled inside each adapter.

### Python (FastAPI / Starlette)

```python
from fastapi import FastAPI
from tokensafe_python.adapters.fastapi import mount_tokensafe

app = FastAPI()
mount_tokensafe(app, auto_discover=True)      # HTTP + SSE + WebSocket + descriptor
# TOKENSAFE_OUMV_AUTH_TOKEN=<token>            # required outside loopback
```

Autoload (`sitecustomize`) mounts the same adapter without touching the app when
`tokensafe inject` installed the Python hook.

### Node.js (Express / Fastify)

```ts
import express from 'express';
import { OumvRuntime, mountTokensafe, tracingMiddleware } from 'tokensafe-backend-node';

const app = express();
const runtime = new OumvRuntime({ workspaceDir: process.cwd() }); // before routes: tracing wraps them
app.use(tracingMiddleware(runtime));
// ...your routes...
const oumv = mountTokensafe(app, { runtime, publicUrl: 'http://127.0.0.1:3000/__oumv/rpc' });
const server = app.listen(3000);
const ws = oumv.attachWebSocket(server); // optional: §2.4 binding
```

Fastify is the same runtime behind its `onRoute` hook:

```ts
import Fastify from 'fastify';
import { OumvRuntime, registerTokensafe } from 'tokensafe-backend-node';

const app = Fastify();
const oumv = await registerTokensafe(app, { runtime: new OumvRuntime({ workspaceDir: process.cwd() }) });
app.get('/api/orders', async () => ({ orders: [] })); // captured for L1 by onRoute
await app.listen({ port: 3000 });
const ws = oumv.attachWebSocket();
```

`oumv/verify` dispatches over loopback HTTP against the live handler, and `applyEdit`
writes a backup under `.tokensafe/backups/` before an OCC-checked write.

### Bun / Elysia

```ts
import { Elysia } from 'elysia';
import { oumv } from 'tokensafe-backend-node/elysia';

const app = new Elysia()
  .get('/api/orders', () => ({ orders: [] }))
  .use(oumv({ authToken: process.env.OUMV_TOKEN })); // mounts /__oumv/rpc, /events and the WS upgrade
app.listen(3000);
```

The plugin is a Web `Request`/`Response` binding on `Bun.serve`: the route table is
read from the composed app in `onStart` (Elysia has no `onRoute` hook), the
descriptor carries the bound port, and `oumv/verify` dispatches through `app.handle`
with no loopback server. `readOnly: true` registers no mutating method (§8.5).
`elysia` is an optional peer dependency of `tokensafe-backend-node`, so Node installs
are unaffected. Certified 51/51 over HTTP (with the transport-auth cases), 52/52 SSE
and 49/49 WS on fixtures v14; the `bun:sqlite` sandbox in the certificate proves both
rollback and read-only query.

### ASP.NET Core (minimal APIs, MVC controllers, EF Core)

```csharp
var builder = WebApplication.CreateBuilder(args);
builder.Services.AddControllers();
builder.Services.AddTokensafe();            // enables the EF Core rollback sandbox

var app = builder.Build();
app.UseWebSockets();
app.UseTokensafe();                         // JSON-RPC /__oumv/rpc, SSE /__oumv/events
app.MapGet("/api/v1/orders", (AppDbContext db) => Results.Json(db.Orders.ToList()));
app.MapControllers();
app.Run();
```

`AddTokensafe()` is optional without EF Core; `UseTokensafe()` alone mounts every
transport. Both minimal APIs and controllers are reached through the app's
`EndpointDataSource`, so L1/L2 and `verify` see one route table: verify dispatches the
endpoint's real `RequestDelegate` on a synthetic `HttpContext` (model binding, filters,
DI), with no network hop. Edits are OCC-checked and Roslyn-parsed before the first write.

`verify.sandbox: {mode:"rollback"}` opens one transaction per DI-discovered `DbContext`,
dispatches with `X-TokenSafe-Dry-Run: true`, rolls every transaction back, and reports
`rollbackStatus: "verified"` only when it observed the rollback. `dbDiff.queries` is
omitted: the adapter does not wrap the EF command pipeline.

### Java (Spring Boot, JDK-only sidecar)

No build integration and no Spring jars: one source file scans the project and serves
the wire on its own port.

```bash
java tokensafe-backend/java/src/dev/tokensafe/oumv/OumvSpring.java \
  --root . --port 8787 --token "$OUMV_TOKEN"     # POST /__oumv/rpc
java tokensafe-backend/java/src/dev/tokensafe/oumv/OumvSpring.java \
  --root . --stdio                               # §2.5 binding
```

Route discovery reads `@RestController`/`@RequestMapping` and the method-level mapping
annotations, including `{id:regex}` templates; edits are OCC-checked with guard order
`-32003 → -32009 → -32002 → -32011 → -32001`; `verify` runs a configured compile/test
command (`--verify-cmd`, default `javac {file}`) and says in `scope.notExecuted` that no
runtime dispatch happened. Level 2, 32/33: L4 traces need a live app. Frozen at wire 1.5.0
(the handshake negotiates 1.5.0; see the support matrix below).

### PHP (Laravel / Symfony, dependency-free sidecar)

```bash
php tokensafe-backend/php/bin/oumv-php --root . --stdio
php -S 127.0.0.1:8787 tokensafe-backend/php/bin/oumv-php --root .   # POST /__oumv/rpc
```

Laravel `Route::` calls (groups, `controller` groups, `apiResource`/`resource`) and
Symfony `#[Route]` attributes resolve to `Class#method` with `token_get_all()` line
ranges; syntax pre-flight is `php -l` on a temp copy, so a broken edit is `-32002` and
never touches disk. Level 2, 32/33 for the same reason. Frozen at wire 1.5.0
(the handshake negotiates 1.5.0; see the support matrix below).

### TypeScript (frontend, Vite)

```ts
// vite.config.ts — zero-footprint: no app import, no extra file
import { tokensafeReact } from '@tokensafe-ui/vite';

export default defineConfig({ plugins: [tokensafeReact()] });
```

The plugin serves `POST /__oumv/rpc` (batch included), `GET /__oumv/events` (SSE)
and a WebSocket upgrade on `/__oumv/rpc`, and writes the discovery descriptor.
Browser-only capabilities (`observe.traces`, `verify.behavior`) degrade explicitly:
`scope.notExecuted` and `evidence.confidence` say what was not observed.

---

## 3. Certify it

```bash
# 1. build / start your app so the runtime is reachable
# 2. run the language-neutral fixtures (the CLIs ship inside tokensafe-oumv)
npx -p tokensafe-oumv oumv-certify \
  --adapter backend/gin --framework gin --profile backend \
  --url http://127.0.0.1:8080/__oumv/rpc --token "$OUMV_TOKEN" \
  --markers @markers.json --report certification/go-gin.json
```

* `--markers` supplies the workspace-relative targets the fixtures edit:
  `fixtureFile`, `editTarget`, `l2Target`, `l3Target`, `verifyTarget`.
  `editVersion` is optional — the CLI derives it with `oumv/getSource`, so the
  OCC token comes from the runtime under test, not from the test.
* Transport flags: `--url`, `--ws`, `--stdio "<cmd>"` (one of them), plus
  `--sse <events-url>` next to `--url` to certify the SSE binding. stdio runs the
  fixture suite against any headless adapter (spec §2.5); `--sse`/`--ws` also run the
  fixture v8 push cases for that binding.
* Exit code is `0` only when every case passed and `attainedLevel >= --min-level`.

Validate an adapter manifest (identity, profiles, capability constraints) against
`schemas/adapter.json`:

```bash
npx -p tokensafe-oumv oumv-lint-adapter adapters/react-vite.json
```

Golden request/response pairs live in `examples/wire/<profile>/<method>.json`; the
schema suite validates them, so the documented wire and the tested wire cannot drift.
Regenerate them with `TestWireExamples` (Go) and
`agent-dom/packages/vite/scripts/capture-wire-examples.mjs` (React).

Committed reports are re-generated in CI and diffed (`scripts/check_certification.py`
in `tokensafe-backend`) — a level that stops reproducing fails the build.

For the React adapter there are two runs. The **browser** run is the real certificate:
it starts the app's Vite dev server, opens it in headless Chrome (`playwright-core`
with the system Chrome channel), waits for the bridge, and runs `oumv-certify --url`
against the committed `certification/app` — 34/34, level 3 (the v10 expired-session case included).

```bash
cd agent-dom/certification/app && npm install && cd ../..
node agent-dom/packages/vite/scripts/certify-react-browser.mjs \
  --root agent-dom/certification/app \
  --certify agent-oumv/packages/conformance/dist/cli/certify.js \
  --report agent-dom/certification/react-vite-browser.json
```

The headless **stdio** run stays as the honest offline shape:

```bash
oumv-certify --adapter frontend/react --framework react --profile frontend \
  --stdio "node agent-dom/packages/vite/scripts/oumv-stdio.mjs --root /tmp/app" \
  --markers @markers.json --report agent-dom/certification/react-vite.json --min-level 1
```

Without an open browser tab `oumv/verify` answers `-32008` and `observe` L4 has no
traces, so the committed report certifies **level 1** and names both failures. Levels
2–3 need a browser-driving harness (Playwright) that does not exist yet — the honest
claim today is level 1 offline, not a footnote.

---

## 4. Capability honesty

A capability listed in `adapters/*.json` or in the handshake must be covered by a
fixture case at that level. CI enforces `advertised ⊆ fixture-verified`:
advertising `observe.traces` (L4) without passing `observe-l4-returns-recorded-traces`
is a build failure, not a documentation nit.

Two rules that keep reports trustworthy:

1. **Skipped ≠ passed.** A capability the runtime does not implement is absent
   from the handshake, and the case fails. `levels` never inherits from a shorter
   suite.
2. **Evidence over prose.** Runtime data carries `evidence.provenance`
   (`runtime | static | contract | inferred | external`); a causality answer with
   no observed trace says `observed: false` and explains why, instead of inventing
   a chain.

---

## 5. Support matrix

| Adapter | Profile | Transports | Level | Report |
| :--- | :--- | :--- | :--- | :--- |
| `backend/gin` | backend | HTTP, SSE, WS, stdio | 3 | `tokensafe-backend/certification/go-gin.json` |
| `backend/chi` | backend | HTTP, SSE, WS, stdio | 3 | `tokensafe-backend/certification/go-chi.json` |
| `backend/stdhttp` | backend | HTTP, SSE, WS, stdio | 3 | `tokensafe-backend/certification/go-stdhttp.json` |
| `backend/fastapi` | backend | HTTP, SSE, WS, stdio | 3 | `tokensafe-backend/certification/python-fastapi.json` |
| `backend/express` | backend | HTTP, batch, SSE, WS, stdio | 3 | `tokensafe-backend/certification/node-express.json` |
| `backend/fastify` | backend | HTTP, batch, SSE, WS, stdio | 3 | `tokensafe-backend/certification/node-fastify.json` |
| `backend/next` | backend | HTTP, SSE | 3 | `tokensafe-backend/certification/next-app-router.json` |
| `backend/elysia` | backend | HTTP, batch, SSE, WS | 3 | `tokensafe-backend/certification/bun-elysia.json` |
| `backend/aspnetcore` | backend | HTTP, SSE, WS | 3 | `tokensafe-backend/certification/dotnet-aspnetcore.json` |
| `backend/java-spring` | backend | HTTP, stdio | **2, frozen at wire 1.5.0** | `tokensafe-backend/certification/java-spring.json` |
| `backend/php-laravel` | backend | HTTP, stdio | **2, frozen at wire 1.5.0** | `tokensafe-backend/certification/php-laravel.json` |
| `frontend/react` | frontend | HTTP, batch, SSE, WS | **3 with a browser tab** | `agent-dom/certification/react-vite-browser.json` (42/42) |
| `frontend/vue` | frontend | HTTP, batch, SSE, WS | **3 with a browser tab** | `agent-dom/certification/vue-vite-browser.json` (42/42) |

The two source-level adapters (`java-spring`, `php-laravel`) scan route declarations, apply
OCC-checked edits and run a real verify command, but they do not boot the framework, so they
record no live request traces: `observe-l4-returns-recorded-traces` fails and Level 3 is not
claimed. Their reports name that single gap. Both are **frozen at wire 1.5.0** on purpose —
they negotiate `protocolVersion: 1.5.0` in the handshake, so the §4.1 result-versioning cases
(`minWireVersion: 1.6.0`) never run against them and their reports stay honest at 32/33.
The wire 1.6.0 surface (§3 correlation/cancel/idempotency, §4.1 versioning, §14 extensions,
SSE/WS) is deliberately not implemented there until there is demand; new protocol work stops
multiplying support for these two sidecars rather than growing it.

The optional bindings are certified by reports, not by the matrix. Node Express and
Fastify, Elysia, Go net/http, Python FastAPI and ASP.NET Core each have SSE and WS
certificates (`tokensafe-backend/certification/transports/*-sse.json`, `*-ws.json`) at
Level 3: the fixture suite plus the push case, the sandbox/query capability cases and
(for HTTP/SSE) the three transport-auth refusals. `stdio` is certified by
`node-stdio.json` and `python-stdio.json`. A transport claim without a report is not
made.

The `sse`/`ws` certificates are produced by passing the push channel to the
runner — `oumv-certify --url <rpc> --sse <events>` for SSE, `oumv-certify --ws <rpc>`
for WebSocket. Go and Python generate them from a live server:
`go/certify-transports.sh` (cmd/certserver) and `python/certify-transports.sh`
(uvicorn + cert_app), both wired into the backend certification job.

Django/Flask and Angular adapters follow.

---

## 6. Open conformance gaps

These are known holes in the contract's evidence, not in any one adapter. They are
listed so a third party can see what a certificate does **not** prove today.

| Gap | What is missing | Why it is not a runtime bug |
| :--- | :--- | :--- |
| *(none recorded at level ≤ 3)* | Every capability an adapter manifest advertises is backed by a named case; `scripts/check_adapter_capabilities.mjs` fails the build otherwise. | — |

Closed in revision v1.11: the read-only deployment shape. `read-only-*` capability
cases assert `-32601` for `applyEdit`/`previewEdit`/`verify`/`build`, the
`capabilities.readOnly` flag and that observe still works, and every manifest carries
`modes: ["read-write", "read-only"]` with a `deployment.read_only` claim.

Closed in revision v1.10: transport auth rejection (`authCases` — missing, invalid and
wrong-scheme credentials answer `401` + `-32007` before dispatch).

Closed in wire 1.5.0: multi-file atomic `applyEdit` (`mutate.multiFile`,
`apply-edit-batch-applies-all` / `apply-edit-batch-is-atomic`) and session expiry
(`sessionTtlSeconds` + `sessions.ttlSeconds`, `expired-session-is-rejected`).

---

## 7. Versioning

* The wire contract is versioned by `protocolVersion` (`1.6.0` today). Adapters
  answer with the version they implement; agents negotiate from the handshake.
  [`compatibility.json`](../compatibility.json) maps every standard release to its
  wire version and fixture set (spec §11).
* Wire 1.6.0 adds the optional surface — `oumv/previewEdit` (`mutate.preview`),
  `oumv/cancel` + `sessions.idempotency` (§3), `oumv/index` (`index.symbols`),
  `oumv/query` (`observeQuery.readOnly`), `oumv/build` (`verify.build`) and the
  `diagnostic` push event (`events.diagnostic`). All are capability-gated: a runtime
  that does not advertise stays absent from the report for those cases and answers
  `-32601` when called directly.
* Fixtures carry `fixtureVersion`; a report records both, so a level always maps
  to a concrete suite.
* Deprecated field names are accepted for one minor release and never emitted
  (§11); removing them requires a major bump.
* Adapter packages are semver-independent (`@tokensafe-ui/vite`, `tokensafe-backend`,
  `tokensafe-backend-python`) but must re-certify on every release that touches the
  wire contract.
