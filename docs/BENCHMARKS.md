# Benchmarks: where the numbers live

The protocol repository ships **conformance** evidence, not performance marketing.
The two are deliberately separate artifacts.

## Conformance (in this repo)

| What | Where |
| :--- | :--- |
| Language-neutral fixture suite | `fixtures/conformance-cases.json` (v10, 33 cases + 2 push + capability and session cases) |
| Certification reports, 6 backend adapters | `tokensafe-backend/certification/*.json` |
| Certification report, React/Vite (browser, Level 3) | `agent-dom/certification/react-vite-browser.json` |
| Reproduction in CI | `tokensafe-backend/.github/workflows/ci.yml` → "Certification is reproducible" |

A level claim is only valid together with its report; every report is regenerated on CI
and diffed against the committed one.

## Performance / token benchmarks (not in this repo)

OUMV's cost/benefit depends on the agent, the model and the harness, so those results
belong to the product repositories and are versioned there:

| Benchmark | Repository | Status |
| :--- | :--- | :--- |
| Tool-level token savings on 15 real repositories (measured BPE, zero-loss gates) | `tokensafe/docs/BENCHMARK_REAL.json` | measured 2026-11-14, **TokenSafe tools**, not OUMV |
| Three-arm backend comparison (oracle 12/12) | `tokensafe-backend/go/benchmark/THREE_ARM_REPORT.md` | `oumv` arm measured in real JSON-RPC bytes; `baseline`/`tokensafe` arms **SIMULATED** |
| Agent benchmark harness (DeepSeek tool loop, hard USD cap, real oracle) | `tokensafe/src/bench/` + `tokensafe bench-oumv` | harness ready; measured results live in the product repos below |
| Agent matrix, Go backend (3 tasks × 5 runs × 3 arms incl. TokenSafe MCP, measured, 200-file target) | `tokensafe-backend/go/benchmark/OUMV_AGENT_MATRIX_V5.md` | measured 2026-11-27 (45 sessions, $0.11): all arms 15/15; TokenSafe −69.0% input / −75.2% output / −73.3% cost, OUMV −63.8% input / −68.8% output / −68.2% cost vs baseline. Both arms resolve `POST /api/products` to its handler in one call (`smart_read_file(endpoint=…)` / `observe L3`) and edit with a hunk (`apply_edits` / `applyEdit mode=patch`) |
| Agent matrix, Go backend — previous run (69-file target) | `tokensafe-backend/go/benchmark/OUMV_AGENT_MATRIX_V4.md` | measured 2026-11-27 (45 sessions, $0.14): TokenSafe −9.8% input / −53.1% output / −28.7% cost, OUMV −36.9% input / +8.5% output / −10.8% cost vs baseline; the OUMV arm still rewrote whole files because `mode=patch` was not yet in the harness |
| Agent matrix, React/Vite (3 tasks × 3 runs × 2 arms, measured) | `agent-dom/benchmarks/REACT_AGENT_MATRIX.md` | measured 2026-11-26; the TokenSafe arm is smoke-tested, not part of the published React matrix |

Why the protocol repo does not host an "OUMV is N× faster" table:

1. **It would mix standards with sales.** A third party adopting OUMV needs the wire
   contract and a reproducible certification path; the agent/market comparison changes
   with every model release.
2. **The first number we published would be the one we defend.** The n=1 pilot showed
   OUMV slower on a 3.7 KB target; the causes were harness bugs (a verify binary built
   from the pristine app, no guarded-edit tool in the arm, no repro in the task), now
   fixed and documented in the reports' method sections.
3. **A benchmark is only OUMV evidence if the arms are measured the same way.** The
   three-arm backend report is honest about two of its arms being simulated — that is a
   methodology artifact, not a protocol claim.

The measured agent matrix (2 arms × 3 tasks × 3 runs per profile, real oracle, provider
`usage`) now runs with `tokensafe bench-oumv`; its reports, per-run tables and limits are
versioned in the product repositories linked above. The protocol repo only points at them.
