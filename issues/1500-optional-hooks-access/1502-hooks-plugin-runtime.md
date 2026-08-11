# 1502: Move hook execution into hooks-plugin

- Status: planned
- Milestone: 15
- Packages: `@ultimabase/hooks-plugin`, `@ultimabase/core`, `@ultimabase/postgres-plugin`, `@ultimabase/testing`
- Depends on: 1501
- ADR: ADR-0189, ADR-0194

## Goal

Reimplement the accepted native hook lifecycle as public plugin middleware
without weakening transactions, ordering, safety, or exact result contracts.

## Acceptance criteria

- [ ] Hooks plugin compiles its declarations and contributions into public Runtime capabilities with no private Core import or assembly branch.
- [ ] Resolve-input, validation, prepared-target, before, after, output, before-commit, after-commit, rollback, error, and event semantics retain their accepted order.
- [ ] Hook-started writes retain the automatic transaction, rollback-only behavior, request lifetime, cancellation, and recursion diagnostics.
- [ ] Logical operation semantics survive persistence rewrites; soft delete invokes delete hooks rather than update hooks.
- [ ] Plugin-provided hooks, schema hooks, and affected field hooks retain dependency-first deterministic composition.
- [ ] No-Hooks applications allocate no dispatcher, placeholder callback, hook snapshot, or per-request hook state.

## Tests

- [ ] Existing focused hook suites migrate to the package and pass through public kernel contracts.
- [ ] PostgreSQL E2E covers hook-started Runtime writes, rollback, after commit, itemized batches, output processing, persistence rewrites, and application isolation without introducing nested relational input.

## Out of scope

- Designing new hook phases or changing accepted callback semantics.
- Removing every old Core export before alternative-engine proof; issue 1508 owns final removal.
