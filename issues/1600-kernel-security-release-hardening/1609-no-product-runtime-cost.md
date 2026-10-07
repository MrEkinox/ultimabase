# 1609: Measure the no-Hooks and no-Access Runtime cost

- Status: completed
- Milestone: 16
- Packages: `@ultimabase/core`, `@ultimabase/testing`, performance fixtures
- Depends on: 1603
- ADR: ADR-0189, ADR-0190

## Goal

Replace the qualitative zero-product-cost claim with a reproducible measurement
of startup materialization and per-request Runtime work when Hooks and Access are
absent.

## Acceptance criteria

- [x] A stable benchmark or instrumentation fixture measures application startup and representative read and mutation execution with neither product installed.
- [x] The fixture compares no-product, official Hooks, official Access, and both-product configurations without relying on wall-clock noise alone.
- [x] No-product applications materialize no Hooks or Access plans, handlers, snapshots, placeholder stages, or product-specific per-request state.
- [x] The documented claim uses measurable wording such as no product-specific stage or materialization rather than promising literal zero CPU cost.
- [x] A justified regression budget is recorded and can run reliably in the repository's supported CI environment.
- [x] The benchmark does not couple Core to either concrete plugin.

## Tests

- [x] Structural tests continue proving absent capabilities add no product behavior.
- [x] The performance fixture detects an intentionally inserted neutral product stage or per-request allocation.
- [x] Benchmark instructions and interpretation are documented.

## Completion evidence

- `RuntimeCostProbe` in `@ultimabase/testing` uses the public
  `replaceRuntime()` boundary, delegates to `RuntimePipeline`, and records only
  product-neutral optional behavior and enforcement bundles, materialized stage
  counts, and request invocations. Core imports no testing or concrete product
  package.
- The serial `performance` Vitest project runs one identical read and
  transactional create for no product, official Hooks, official Access, both,
  and an intentionally neutral behavior provider. Every scenario observes one
  adapter read, one prepared and executed mutation, one transaction, and one
  commit.
- The no-product budget permits one instrumented Runtime assembly and exactly zero
  optional bundles, stages, or calls. It rejects the neutral provider with one
  materialized stage and two request invocations, proving that the guard can
  detect placeholder work without a timing threshold.
- Core and testing documentation now define absence as no optional
  product-specific materialization or request stage. They explicitly retain
  mandatory Core work and make no literal zero-CPU promise.
- `yarn test:performance` passes 2 deterministic tests. `yarn test` passes 346
  files and 1,871 tests, and `yarn test:coverage` passes 390 files and 2,008
  tests at 88.75% statements, 81.47% branches, 93.79% functions, and 88.88%
  lines.
- `yarn typecheck`, `yarn lint`, `yarn format:check`, `yarn constraints`,
  `yarn build`, and the 85 built package-archive tests pass. Lint reports only
  the existing centralized file-size warnings.

## Out of scope

- General TypeScript editor performance owned by issue 810.
- A complete framework-wide performance optimization campaign.
- Brittle single-run nanosecond assertions.
