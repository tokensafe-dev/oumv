# Benchmarks: where the numbers live

The protocol repository ships **conformance** evidence, not performance marketing.
The two are deliberately separate artifacts.

## Conformance (in this repo)

| What | Where |
| :--- | :--- |
| Language-neutral fixture suite | `fixtures/conformance-cases.json` (v4, 18 cases) |
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
| Agent benchmark harness (DeepSeek tool loop, hard USD cap, real oracle) | `tokensafe/src/bench/` + `tokensafe bench-oumv` | harness ready; **no published results** (the n=1 pilot was deleted) |

Why the protocol repo does not host an "OUMV is N× faster" table:

1. **It would mix standards with sales.** A third party adopting OUMV needs the wire
   contract and a reproducible certification path; the agent/market comparison changes
   with every model release.
2. **The first number we published would be the one we defend.** The n=1 pilot showed
   OUMV slower on a 3.7 KB target; publishing it (or hiding it) would both misrepresent
   the protocol.
3. **A benchmark is only OUMV evidence if the arms are measured the same way.** The
   three-arm backend report is honest about two of its arms being simulated — that is a
   methodology artifact, not a protocol claim.

When the measured agent matrix (3 arms × 3 tasks × 3 repeats, large target, React arm
over the Vite bridge, replay in CI) runs, its report and provenance belong in
`tokensafe`, and this page will link to it with the exact commit and harness version.
