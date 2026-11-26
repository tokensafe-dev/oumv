# Contributing to OUMV

## Sign-off (DCO)

This project uses the **Developer Certificate of Origin 1.1** ([DCO](DCO)). Sign every
commit:

```bash
git commit -s -m "feat(go): ..."
```

The sign-off adds `Signed-off-by: Your Name <you@example.com>`. PRs without it are asked
to amend — there is no separate CLA to sign.

## Licence of contributions

- Code (`packages/`, `schemas/`, `scripts/`): **Apache-2.0**.
- `spec/SPEC.md` and `fixtures/`: **CC-BY-4.0**.

By contributing you agree that your contribution is licensed under the same terms.

## Before opening a PR

```bash
pnpm install && pnpm build && pnpm test
```

- A wire or schema change updates the spec, `schemas/*.json`, `fixtures/conformance-cases.json`
  and **all three runners** (TS, Go, Python) plus the vendored copies under
  `tokensafe-backend`; bump `fixtureVersion` when cases change.
- Re-certify the adapters (`oumv-certify` / `oumv-lint-adapter`) and commit the regenerated
  reports. A behaviour change without a fixture is not reviewable.
- A capability or transport claim must be backed by a fixture case and a committed report —
  `scripts/check_adapter_capabilities.mjs` fails real over-claims.
