# 3006: Enforce one active UltimaBase runtime per process

- Status: planned
- Milestone: 30
- Packages: `@ultimabase/core`, `@ultimabase/testing`
- Depends on: 3005
- ADR: decision from issue 3002

## Goal

Implement the accepted single-active-application lifecycle while preserving
concurrent request isolation and clean sequential replacement.

## Acceptance criteria

- [ ] Starting or activating a second UltimaBase application in the same
      process fails deterministically before infrastructure effects.
- [ ] Complete disposal releases the active application so a later application
      may initialize and start with different schemas and plugins.
- [ ] Concurrent requests within one application retain independent contexts,
      subjects, cancellation, transactions, callbacks, and Master provenance.
- [ ] Static schema methods, explicit application options, application handles,
      and model handles follow the resolution rule accepted by issue 3002.
- [ ] Failed startup, stop, repeated disposal, test cleanup, and application
      replacement cannot leave a stale active binding or plugin resource.
- [ ] Parallel Vitest workers continue to run independent applications without
      a shared mutable application, pool, registry, or schema namespace.
- [ ] Same-process concurrent-application APIs, branches, tests, and claims are
      removed rather than retained as an undocumented mode.

## Tests

- [ ] Lifecycle, active context, static execution, Master provenance, request
      concurrency, cleanup, worker isolation, JavaScript, TypeScript, and packed
      package regressions pass.
- [ ] Relevant typecheck, unit, PostgreSQL, lint, build, and constraints pass.

## Audit gate

- [ ] Audit process-global state, AsyncLocalStorage boundaries, cleanup paths,
      and removed multi-application claims. Fix every leak or ambiguity and
      repeat the full audit until green.
- [ ] Record behavior, performance, line, file, test, and Documentation impact
      evidence before completion.

## Out of scope

- HTTP routing changes owned by issue 3007 and command-graph consolidation.
