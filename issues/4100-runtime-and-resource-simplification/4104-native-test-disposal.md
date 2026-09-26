# 4104: Adopt native asynchronous test disposal

- Status: planned
- Milestone: 41
- Packages: `@ultimabase/core`, `@ultimabase/testing`
- Depends on: 4103

## Goal

Use the native explicit-resource-management contract for ordinary application
and PostgreSQL test resources instead of repeated manual cleanup scaffolding.

## Acceptance criteria

- [ ] Testing-owned asynchronous resources implement `Symbol.asyncDispose`
      through their existing `dispose()` behavior.
- [ ] Straightforward lexical test lifetimes use `await using` and reduce test
      boilerplate.
- [ ] Lifecycle failure, competing disposal, ordering, and cleanup-error tests
      remain explicit.
- [ ] Application isolation and PostgreSQL worker cleanup order remain unchanged.
- [ ] Tests decrease in lines and public testing documentation is updated.
