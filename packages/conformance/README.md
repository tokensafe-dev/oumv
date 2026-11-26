# @oumv/conformance (workspace)

> Published entry point: both CLIs ship inside **`tokensafe-oumv`** (they are bundled
> into its `dist/cli/`), because `@oumv/*` is an internal workspace scope without an
> npm scope of its own. `npx -p tokensafe-oumv oumv-certify …` runs exactly this code.

Language-neutral OUMV conformance runner plus the two CLIs that make a level claim
reproducible (spec §10).

## `oumv-certify`

```bash
npx @oumv/conformance oumv-certify \
  --adapter backend/gin --framework gin --profile backend \
  --url http://127.0.0.1:8080/__oumv/rpc --token "$OUMV_TOKEN" \
  --markers @markers.json --report certification/go-gin.json --min-level 3
```

* One transport per run: `--url` (HTTP/batch), `--ws` (WebSocket), `--stdio "<cmd>"`
  (newline-delimited JSON-RPC).
* `--markers` maps the fixture placeholders to the runtime's workspace
  (`fixtureFile`, `editTarget`, `l2Target`, `l3Target`, `verifyTarget`); the OCC
  version is fetched with `oumv/getSource`, never guessed by the test.
* The report conforms to `schemas/conformance-report.json`; exit code is 0 only when
  every case passed and `attainedLevel >= --min-level`.

## `oumv-lint-adapter`

```bash
npx @oumv/conformance oumv-lint-adapter adapters/react-vite.json
```

Validates an adapter manifest against `schemas/adapter.json` (identity, profiles,
capability constraints, conformance levels).

## Library

`runFixtureSuite(transport, spec, markers, options)` runs
`fixtures/conformance-cases.json` over any `RpcTransport`; `memoryTransport`,
`httpTransport`, `wsTransport` and `stdioTransport` are included, dependency-free.
