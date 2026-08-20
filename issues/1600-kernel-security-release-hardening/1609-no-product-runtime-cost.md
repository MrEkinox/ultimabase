# 1609: Measure the no-Hooks and no-Access Runtime cost

- Status: planned
- Milestone: 16
- Packages: `@ultimabase/core`, `@ultimabase/testing`, performance fixtures
- Depends on: 1603
- ADR: ADR-0189, ADR-0190

## Goal

Replace the qualitative zero-product-cost claim with a reproducible measurement
of startup materialization and per-request Runtime work when Hooks and Access are
absent.

## Acceptance criteria

- [ ] A stable benchmark or instrumentation fixture measures application startup and representative read and mutation execution with neither product installed.
- [ ] The fixture compares no-product, official Hooks, official Access, and both-product configurations without relying on wall-clock noise alone.
- [ ] No-product applications materialize no Hooks or Access plans, handlers, snapshots, placeholder stages, or product-specific per-request state.
- [ ] The documented claim uses measurable wording such as no product-specific stage or materialization rather than promising literal zero CPU cost.
- [ ] A justified regression budget is recorded and can run reliably in the repository's supported CI environment.
- [ ] The benchmark does not couple Core to either concrete plugin.

## Tests

- [ ] Structural tests continue proving absent capabilities add no product behavior.
- [ ] The performance fixture detects an intentionally inserted neutral product stage or per-request allocation.
- [ ] Benchmark instructions and interpretation are documented.

## Out of scope

- General TypeScript editor performance owned by issue 810.
- A complete framework-wide performance optimization campaign.
- Brittle single-run nanosecond assertions.
