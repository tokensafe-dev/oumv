# OUMV Competitive Technical Benchmark

This directory contains the comparative technical benchmark evaluating **CAST Imaging**, **Breeze.AI (Accion Labs)**, and the **OUMV Protocol (Universal Agent-Runtime Protocol)** on a realistic full-stack application.

## Testbed Architecture
- **Application:** E-Commerce Checkout ([`ecommerce-app/`](./ecommerce-app))
  - **Frontend:** React 19, TypeScript, Vite, Zustand Store (`CheckoutModal.tsx`, `cartStore.ts`)
  - **Backend:** Go 1.23, Chi Router, pgx (`checkout.go`, `order.go`)
  - **Database:** PostgreSQL 16 (`orders`, `order_items`, `customers`)

## Evaluated Scenarios
1. **Find Checkout Dependencies**: Direct, state, and network contracts.
2. **Trace UI Action to SQL Query**: End-to-end causality path from button click down to SQL insert.
3. **Determine Blast Radius of API Contract Change**: Refactoring `CheckoutRequest.phone` into structured contact object.
4. **Execute Controlled Mutation**: Safe mutation handling, concurrency control (OCC), AST guards.
5. **Verify Mutation**: Proving functional correctness and contract preservation without heavy browser overhead.

## Running the Benchmark
```bash
# Execute full comparative benchmark suite
bun benchmarks/harness/runner.ts
```

## Detailed Results & Analysis
See the full benchmark report in [BENCHMARK_REPORT.md](./BENCHMARK_REPORT.md).
