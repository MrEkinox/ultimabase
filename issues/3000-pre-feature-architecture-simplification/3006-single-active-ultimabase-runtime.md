# 3006: Enforce one active UltimaBase runtime per process

- Status: completed
- Milestone: 30
- Packages: `@ultimabase/core`, `@ultimabase/testing`
- Depends on: 3005
- ADR: [0258](../../docs/adr/0258-single-active-application-lifecycle.md)

## Goal

Implement the accepted single-active-application lifecycle while preserving
concurrent request isolation and clean sequential replacement.

## Acceptance criteria

- [x] Starting or activating a second UltimaBase application in the same
      process fails deterministically before infrastructure effects.
- [x] Complete disposal releases the active application so a later application
      may initialize and start with different schemas and plugins.
- [x] Concurrent requests within one application retain independent contexts,
      subjects, cancellation, transactions, callbacks, and Master provenance.
- [x] Static schema methods, explicit application options, application handles,
      and model handles follow the resolution rule accepted by issue 3002.
- [x] Failed startup, stop, repeated disposal, test cleanup, and application
      replacement cannot leave a stale active binding or plugin resource.
- [x] Parallel Vitest workers continue to run independent applications without
      a shared mutable application, pool, registry, or schema namespace.
- [x] Same-process concurrent-application APIs, branches, tests, and claims are
      removed rather than retained as an undocumented mode.

## Tests

- [x] Lifecycle, active context, static execution, Master provenance, request
      concurrency, cleanup, worker isolation, JavaScript, TypeScript, and packed
      package regressions pass.
- [x] Relevant typecheck, unit, PostgreSQL, lint, build, and constraints pass.

## Audit gate

- [x] Audit process-global state, AsyncLocalStorage boundaries, cleanup paths,
      and removed multi-application claims. Fix every leak or ambiguity and
      repeat the full audit until green.
- [x] Record behavior, performance, line, file, test, and Documentation impact
      evidence before completion.

## Out of scope

- HTTP routing changes owned by issue 3007 and command-graph consolidation.

## Approved test-suite lifecycle

The user approved the existing `start()` / `dispose()` API through Jest or
Vitest `beforeAll` / `afterAll`. Return or await both lifecycle promises.
One application serves the suite; separate worker realms may run in parallel.
Tests requiring another application dispose the first before initialization.
The earlier `withUltimaBase` proposal is withdrawn: no additional public
helper, runner integration, database reset, or activation bypass is needed.

Issue 3005 is audited and committed as `21bb2e8f`; issue 3006 proceeds under
ADR-0258. The existing architecture stop gate remains in force.

## Delivery and audit

The implementation follows ADR-0258. Core claims one private lifecycle slot
before capability materialization or plugin setup, including through
`createApplication()` and low-level engine construction. Pure construction,
compilation and Typegen remain independent. Stop closes new execution and
retains ownership; disposal drains admitted callbacks, direct terminals,
operations and transactions before reverse resource cleanup. Failed cleanup
remains a permanent failure rather than releasing an unproven resource owner.

Old engines, contexts, handles and explicit Master grants cannot execute with
replacement authority, including when a MasterAuthority object is reused.
Static mutation visibility is cleared for the exact disposed owner, while
captured dispatchers still check their selected graph. No global execution
fallback, lifecycle reset, test exemption or public testing helper is added.
Jest and Vitest use their existing beforeAll/start and afterAll/dispose hooks.

The audit/fix loop covered complete lifecycle overlap, failure cleanup, every
Runtime entry boundary, authority provenance, static visibility, concurrent
request scopes, plugin ownership, documentation and fixture equivalence. It
corrected self-waiting teardown, duplicate cleanup-error reporting, unbound
explicit Master grants, remaining simultaneous fixtures and missing fixture
cleanup. Security tests retain foreign-token/context rejection, callback and
codec guards, ACL/reference isolation, transactions, rollback and persisted
session continuity through sequential replacement. Real JavaScript workers
also initialize concurrently while their parent owns an active application.

HTTP mount-table implementation and mock-provider composition tests remain
explicitly assigned to issue 3007; no supported second live UltimaBase bypass
remains. Two oversized test files were split without removing assertions;
their exceptions were removed and the remaining affected baselines decreased.

Documentation impact: both. Core and Testing READMEs, application/runtime and
transport engineering documentation, the schema-mutation example, and the
website application, testing, Master authority, plugin-authoring and Hono
pages describe the delivered lifecycle. HTTP/Hono READMEs no longer promise
concurrent initialized applications. Other touched packages change fixtures
only; their product contracts remain accurate. No historical ADR was rewritten.

Scope: all plugin/test migrations above implement ADR-0258's preservation
requirements; they do not start the plugin simplification wave. No public API
beyond the accepted lifecycle change was introduced. Preserve the unrelated
editor setting and suspended Soft Delete stash. No push is authorized.

Validation and measurements (local, not a hosted CI run):

- `yarn typecheck`: passed after the final changes.
- `yarn test --maxWorkers=2`: 529 files, 2,510 tests, no type errors, 162.66 s.
- Final `yarn build`: passed in 36.192 s, including declaration and package checks.
- `yarn test:e2e:built --maxWorkers=2`: 97 files, 379 tests passed in 128.30 s.
  Includes package archives, JavaScript without Typegen, TypeScript/editor
  contracts, PostgreSQL, real workers, HTTP/REST/GraphQL, browser cookies,
  Password Auth, Soft Delete, ACL/Roles and alternative plugin engines.
- `yarn website:validate`: 17 files, 66 tests passed in 17.79 s.
- `yarn constraints`, changed-file formatting and `git diff --check`: passed.
- Full Core/package/workspace lint scopes plus affected-file reruns passed.
  Line-budget warnings remain; no exception, threshold or exclusion increased.

An unrestricted parallel E2E run passed 378/379 tests; the remaining generated
REST declaration subprocess hit the existing five-second timeout under load.
Its targeted rerun and the complete two-worker run both pass. Two workers is
the same configuration used by the preceding issue and the milestone baseline.
No timeout, coverage threshold, exclusion or CI configuration was changed.
Complete coverage was not rerun for this issue.

Measurements compare `yarn measure:simplification` with `21bb2e8f`:

| Measure                       |  Before |   After |  Delta |
| ----------------------------- | ------: | ------: | -----: |
| Production TypeScript files   |     695 |     697 |     +2 |
| Production TypeScript lines   | 127,693 | 128,037 |   +344 |
| Core TypeScript files         |     331 |     333 |     +2 |
| Core TypeScript lines         |  68,298 |  68,624 |   +326 |
| Test/support TypeScript files |     693 |     702 |     +9 |
| Test/support TypeScript lines | 128,406 | 129,476 | +1,070 |
| Public exports                |   1,727 |   1,727 |      0 |
| Built entry declaration bytes | 859,337 | 859,418 |    +81 |

This lifecycle enforcement issue adds safety and fixture code; it does not
claim a line reduction. Issue 3007 removes the shared HTTP ownership machinery.
The exact total added/deleted/net commit counts include documentation and tests
and are reported to the user after the dedicated commit.

`yarn measure:runtime-baseline` completed 20 sequential application lifetimes.
Medians: startup 1.651 ms, read 0.418 ms, mutation 0.524 ms; V8 heap before
construction 8,955,120 bytes, after startup 9,976,184 bytes, after requests
10,171,504 bytes. Issue 3001 recorded 1.706 / 0.422 / 0.502 ms respectively;
these small local samples do not establish a performance gain or regression.
The no-product/official Hooks/official Access/both structural counter tests
retain the same zero-work guarantee for absent optional engines.

Final audit: green, no unresolved finding. The next issue is 3007 after this
dedicated local commit. Issue 3014 remains the mandatory hard stop.
