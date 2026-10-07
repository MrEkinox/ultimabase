# 3108: Remove unused Runtime stage contributions if approved

- Status: completed
- Milestone: 31
- Packages: @ultimabase/core; affected public conformance/docs
- Depends on: 3107
- Execution contract: [milestone 31 plan](../../docs/plans/2026-09-21-residual-complexity-simplification.md)
- Evidence: [candidate inventory](../../docs/plans/2026-09-21-residual-complexity-inventory.md)
- Accepted decision: [ADR-0264](../../docs/adr/0264-remove-unused-runtime-stage-contributions.md), accepted 2026-09-21

## Goal

Remove only the approved unused normalization/commit stage contribution API.

## Acceptance criteria

- [x] Require the accepted RC-04 decision. Delete the exact factory/types, private implementation registry, collection/assembly branches and exports identified by 3107.
- [x] Keep normal Runtime normalization and transaction commit, Hook beforeCommit/afterCommit, callback ownership and rollback behavior.
- [x] Keep used runtimeInterceptorCapability/provideRuntimeInterceptor and preparedOperation contributions, including ACL enforcement. No neutral product stage or renamed substitute is introduced.
- [x] Remove exclusive API self-tests while retaining invariant coverage and adding focused rejection/public-export regressions for the approved removal.
- [x] Update the public plugin-authoring website, relevant README/architecture contracts and examples in the same change. Record the exact public delta and removal history.

## Tests

- [x] Run Runtime order, transactions, callback ownership, ACL, optional-product cost and source/built/packed public contract tests.
- [x] Run the implementation gates, full coverage for the cross-cutting execution change and affected PostgreSQL/transport conformance.

## Audit and commit gate

- [x] Audit the complete diff against retained behavior, security, ownership,
      public types/exports, obsolete paths, tests, documentation and scope.
- [x] Correct every finding, rerun affected checks and repeat the complete audit
      until no finding remains. Architecture questions or blocked verification
      stop the issue for user direction; they are not bypassed by more retries.
- [x] Record audit iterations, validation evidence and exactly one Documentation
      impact classification in the handoff; update inventory/removal history.
- [x] Create the dedicated local commit only after the green audit, report exact
      added/deleted/net line counts and verify scope before the next issue.
      No push is authorized.

## Out of scope

Removing all interceptors, changing commit semantics or eliminating retained internal performance measurements.

## Handoff

Documentation impact: both. Core README/runtime contracts, architecture and
both affected Runtime/plugin-authoring website pages describe the exact
ADR-0264 removal and the retained logical interceptors and Hook callbacks.

Starting revision: `adbefbad`. The factory, its private WeakMap and validators,
four authoring types, stage collection/composition and union alternative are
removed. Core retains ordinary normalization/commit assembly, logical
interceptors and their owner/privilege/order checks. An absent nominal
implementation cannot silently discard an interceptor. No replacement API,
dependency change, coverage exclusion or threshold change is introduced.

Production delta: +15 / -238 = **-223 lines**. Tests/support: +91 / -142 =
**-51 lines**. The two deleted factory-only files contain four obsolete tests;
two former-stage rejection cases and negative source/packed type assertions
protect the accepted removal. The assembly fixture now checks retained
before/after interceptors in dependency order and still checks enforcement,
validation, persistence, commit and post-commit delivery.

All 23 package roots have 1,721 exports, exactly five fewer than 3106: the
factory and its four types. Only Core's built declaration changes, by deleting
those declarations and the accepted union branch; other declarations are
byte-identical. Current production is 123,955 lines / Core 65,906;
tests/support 130,928; tooling remains 2,119. Declaration output is 855,097
bytes, down 1,573 from 3106. No runtime or CI speedup is inferred.

### Audit loop

| Pass | Finding / correction                                                                                                                 | Verification                                                                                                                                                                                                                             |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Removal left four stale barrel type exports                                                                                          | Deleted the complete former export block; focused tests, root typecheck and canonical build pass                                                                                                                                         |
| 2    | Composition still silently skipped former stage definitions; an assertion alternative conflicts with lint rules                      | Keep explicit fail-closed nominal validation; focused lint and rebuilt typecheck pass                                                                                                                                                    |
| 3    | Website validation overlapped a package rebuild; two full E2E attempts exceeded existing five-second editor/generated-type deadlines | Website validation/build pass after the canonical build; isolated REST check passes; all 384 built/packed/PostgreSQL tests pass with two workers and unchanged assertions/deadlines                                                      |
| 4    | Complete coverage, declaration, removal and documentation review                                                                     | 681 unchanged instrumented maps and 456 mapped locations in three changed files lose no retained coverage; manual review resolves changed validation, removed stage composition and coincident branch locations; zero remaining findings |

Final validation (local logs: `/tmp/ultimabase-m31-3108`):

- `yarn typecheck`, `yarn build`, root `yarn lint`, focused final ESLint and
  `yarn constraints` pass. Existing file-size warnings remain; no lint error.
- `yarn test`: 2,549 tests / 529 files; no type errors. The final full
  `yarn test:coverage` also includes all source/type/performance projects:
  **2,793 tests / 604 files**. Statements 90.58%, branches 84.02%, functions
  95.91%, lines 91.18%; unchanged thresholds pass.
- `yarn test:e2e:built --maxWorkers=2`: **384 tests / 98 files**. Earlier
  default-concurrency runs timed out in editor/generated-type checks, with
  no assertion mismatch; isolated REST and the complete bounded run pass.
  No test timeout, assertion or suite selection was relaxed.
- Coverage versus 3106 loses no retained scenario/location. The only missing
  production file is the approved stage factory. Unmapped assembly locations
  belong to its removed collection/composition; the validator keeps both
  nominal outcomes covered. The former stage-skipping branch is replaced by
  an invariant error unreachable through validated capability composition.
  Remaining coincident before/after branch locations retain both arms.
- `yarn website:validate`: 66 checks; `yarn website:build`: pass. Both final
  checks ran after the canonical package build.
- Backlog and active-documentation tests: 14 pass. Changed-file Prettier,
  relative links and `git diff --check` form the final commit gate.

Reviewed scope: `adbefbad` plus the entire issue diff, including final handoff
records. No work exceeds 3108/ADR-0264; no unresolved finding. The dedicated
local commit is reported outside its own contents. No push. Next: 3109 only
once this commit is created and inspected.
