# 3009: Migrate application operations to the canonical graph

- Status: completed
- Milestone: 30
- Packages: `@ultimabase/core`, `@ultimabase/password-auth-plugin`, `@ultimabase/plugin-kit`
- Depends on: 3008
- ADR: ADR-0261 refines the compilation/binding phases of ADR-0259

## Goal

Run current plugin application operations, led by Password Auth, through the
canonical command graph without changing their public TypeScript or Runtime
behavior.

## Acceptance criteria

- [x] Operation declaration, payload snapshot, handler ownership, public errors,
      result materialization, cancellation, request context, and transaction
      behavior read one canonical compiled command.
- [x] Password Auth signup, login, refresh, logout, session resolution, readable
      User results, and class convenience methods retain their current contracts.
- [x] Username/password-only login and schema-derived signup inputs remain
      distinct through direct TypeScript, REST, and GraphQL.
- [x] Owner-private credentials and sessions remain inaccessible to Query,
      Typegen, generated CRUD, Access, Hooks, and foreign plugins.
- [x] Legacy operation declarations may remain only as a temporary adapter into
      the canonical graph and may not retain a second Runtime registry.

## Tests

- [x] Password Auth source and packed editor tests, JavaScript, private storage,
      session, REST, GraphQL, PostgreSQL, authorization, safe-error, rollback,
      and cancellation suites pass.
- [x] Core operation ownership, lifecycle, typecheck, lint, build, and
      constraints pass.

## Audit gate

- [x] Audit Password Auth and generic application operations for duplicate
      registration, changed inputs, user disclosure, leaked credentials, and
      alternate execution. Correct and repeat the full audit until green.
- [x] Record behavior, line, file, test, duration, and Documentation impact
      evidence before completion.

## Out of scope

- Schema mutations, Typegen projection cleanup, and REST or GraphQL planner
  deletion.

## Implementation and audit notes

Application operation handles retain their public token, owner, immutable shape,
and constructor signature. Their Core-compiled declaration view resolves once to
its exact canonical command and graph. The existing derived-view cache is
reoriented; no operation registration store is added. Runtime no longer calls
`getOperation()` or interprets a legacy declaration wrapper during execution.
The facade still resolves public tokens/names when creating a handle.

Direct preparation and transport decoding now share one envelope builder. Input
and result snapshots resolve the original private source contract through that
command's graph; callbacks remain absent from inert records. Handler/codec
ownership is still decided once during application materialization. The request
bridge checks exact graph identity and the existing envelope facts before
cancellation, required/forbidden transaction policy, owner-attributed invocation,
result validation, declared public errors, and final cancellation checks.

The audit reviewed duplicate state, callback/owner identity, stale and foreign
commands, lifecycle/context admission before codecs, transaction rollback, and
private storage disclosure. The migration does not change Password Auth or
Plugin Kit production code, add a privilege, duplicate credential/session data,
or alter schema mutation execution. Typegen and static transport planners remain
bounded consumers for 3011/3012. There is no scope expansion.

New regressions cover equal direct/wire validation, no Runtime fallback to the
legacy declaration lookup, copied commands and forged envelope facts rejected
before transactions, private snapshots, and cross-graph identity. An initial
test tried to spy on the intentionally frozen application instance; the fixture
now uses the class prototype and restores it in `finally`, including exposure
failure. No production behavior was changed to accommodate the test.

Documentation impact: internal engineering documentation.

Reviewed Core, Password Auth and Plugin Kit READMEs, the website ownership map,
and the website Application, Password Authentication and Operations/GraphQL
pages. Public signatures, declared errors, initialization/resource semantics,
transaction policies, signup/login fields, result shapes and transport exposure
remain unchanged, so their public instructions require no migration or edit.
Root architecture, active plan and removal history record the internal move.

## Validation evidence

Final audit: no unresolved finding. All retained contracts remain covered; no
additional architecture decision or public migration is required.

- `yarn typecheck`: passed.
- `yarn build`: passed in 39.362 seconds, including package `attw`/`publint`.
- `yarn test --maxWorkers=2`: 533 files / 2,532 tests passed, zero type
  errors, 191.10 seconds; includes source editor, JavaScript, private storage,
  session, REST/GraphQL and performance invariants.
- `yarn test:e2e:built --maxWorkers=2`: 97 files / 379 tests passed,
  155.12 seconds; includes packed editors/exports and PostgreSQL auth,
  authorization, safe errors and rollback.
- Final changed regression files: 2 files / 17 tests passed after the fixture
  cleanup adjustment; focused lint also passes.
- Full lint, dependency constraints, issue metadata and diff checks pass.
  Warning-only file-size notices remain, including the operation test file
  at 639 lines; no hard limit or baseline increased.
- No website content changed, so website build/tests were not rerun. Reviewed
  public contracts remain accurate. Complete coverage was not rerun; thresholds,
  exclusions, timeouts and CI configuration are unchanged.

The measurement script reports 702 production TypeScript files / 127,949 lines,
including Core's 337 files / 68,776 lines: **+1 file and +52 production lines**
from 3008. TypeScript tests/support add **131 lines**, with the same 707 files.
The public contract remains **1,726 exports and 858,344 declaration bytes**.
This bounded step removes duplicated preparation and legacy Runtime reads;
it does not claim a net source reduction before the remaining consumer and
adapter migrations. Exact full-commit added/deleted/net counts are reported
at commit, including engineering documentation and tests. Broad suite timings
were collected concurrently and do not establish a CI or performance speedup.

The quiet 20-lifetime no-product sample reports median startup/read/mutation
**1.643 / 0.408 / 0.508 ms**, with heap medians of 8,971,000 / 9,995,336 /
10,192,064 bytes. It exercises no plugin command and establishes no speedup.
Measurement revisions identify the preceding HEAD plus this issue's working tree.
