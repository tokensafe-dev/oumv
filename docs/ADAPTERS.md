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
| Guards | normative order `-32003 → -32009 → -32002 → -32011 → -32001 → -32007` (§4.6) |
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
* Transport flags are mutually exclusive: `--url`, `--ws`, `--stdio "<cmd>"`.
  stdio runs the fixture suite against any headless adapter (spec §2.5).
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
against the committed `certification/app` — 18/18, level 3.

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
| `frontend/react` | frontend | HTTP, batch, SSE, WS | **3 with a browser tab**, 1 offline | `agent-dom/certification/react-vite-browser.json` (L3), `react-vite.json` (L1 offline) |

The stdio claim is backed by the same fixtures run over §2.5:
`tokensafe-backend/certification/transports/node-stdio.json` and
`python-stdio.json` (both Level 3, 20/20), regenerated in CI next to the HTTP
reports. A transport claim without a report is not made.

Django/Flask, Next and Angular adapters follow.

---

## 6. Versioning

* The wire contract is versioned by `protocolVersion` (`1.1.0` today). Adapters
  answer with the version they implement; agents negotiate from the handshake.
* Fixtures carry `fixtureVersion`; a report records both, so a level always maps
  to a concrete suite.
* Deprecated field names are accepted for one minor release and never emitted
  (§11); removing them requires a major bump.
* Adapter packages are semver-independent (`@tokensafe-ui/vite`, `tokensafe-backend`,
  `tokensafe-backend-python`) but must re-certify on every release that touches the
  wire contract.
