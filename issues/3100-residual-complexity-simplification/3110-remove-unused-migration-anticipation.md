# 3110: Remove unused migration anticipation if approved

- Status: completed
- Milestone: 31
- Packages: @ultimabase/core, @ultimabase/postgres-plugin, @ultimabase/testing; only consumers enumerated in 3107
- Depends on: 3109
- Execution contract: [milestone 31 plan](../../docs/plans/2026-09-21-residual-complexity-simplification.md)
- Evidence: [candidate inventory](../../docs/plans/2026-09-21-residual-complexity-inventory.md)
- Accepted decision: [ADR-0266](../../docs/adr/0266-defer-migration-only-protocols.md), accepted 2026-09-21

## Goal

Remove the exact unused migration scaffolding approved by RC-06 while preserving current PostgreSQL and owner-private persistence.

## Acceptance criteria

- [x] Require an accepted RC-06 decision naming each removed symbol/privilege/token/metadata field and resolving its engineering-tool consumers. New findings outside that inventory invoke the stop gate.
- [x] Remove only approved migration-exclusive planning, upgrade/history/preparation pathways and their exclusive fixtures/docs; no placeholder migration package or replacement API.
- [x] Preserve PostgreSQL override/fail/ignore synchronization and `renamedFrom`, actual desired-schema preparation, every physical contribution snapshot field, plugin-field codecs, private credential/session storage and transaction-bound raw access.
- [x] Preserve all provenance needed by current storage/ownership/integrity checks and exact privilege-before-effect boundaries. Removing migration metadata must never imply automatic destructive schema cleanup.
- [x] Retain/rehome required test invariants only through existing internal support under the accepted decision. Report any intentionally removed used testing API explicitly.
- [x] Update affected public PostgreSQL/plugin-authoring/testing docs and examples in this issue. Reconcile future migration issue assumptions as decided without starting that backlog.
- [x] Record exact removals, behavior deltas, storage/SQL comparison evidence and preserved contracts in the ledger and root history.

## Tests

- [x] Run PostgreSQL synchronization/physical-schema, private-storage, Password Auth, adapter lease/provenance and built/packed conformance with real PostgreSQL.
- [x] Run implementation gates, full coverage as justified by changed shared adapter contracts and affected website checks.

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

Removing existing synchronization modes, losing private data/provenance, applying migrations, changing storage formats or creating a migrations product.

## Handoff

Documentation impact: both. Core/PostgreSQL/testing READMEs, root architecture
and agent guidance, and the PostgreSQL, plugin-authoring index and Runtime /
infrastructure website pages now describe the exact ADR-0266 removal. Reviewed
Manual Installation, Before Exposing Your Application, Test an Application and
Roadmap: their existing explicit synchronization policies, isolated-worker
lifecycle and future external-migration guidance remain accurate. Future issues
513/514/515 and milestone 5 retain their dependencies and now identify the
removed prerequisite; none of that future product is implemented.

Starting revision: `21094201`. Remove only ADR-0266's Core migration support,
intent/planner/types, privilege and exclusive equality helper; PostgreSQL's
migration support/contribution/preparation tokens, upgrade helper and metadata
field; testing's public `FakeAdapterMigrationHistory`. Its used upgrade/orphan
classification and immutable-history API are the expressly accepted engineering
exception. There is no replacement planner, marker, public API or dependency.

Current persistence is retained. Core's physical definition/snapshot interfaces
and trusted ownership materialization are byte-identical. All nine documented
snapshot fields remain. Of 65 PostgreSQL production files, 59 are byte-identical,
two change JSDoc only, three change the approved exports/provider/startup path,
and only the retired preparation-marker file is deleted. SQL rendering,
desired-state compilation, synchronization planning, codecs, private storage,
raw leases and transaction implementation are unchanged. Existing SQL/desired-
state assertions and real PostgreSQL rename/non-destruction/private-storage
scenarios verify these paths; the metadata-only proof does not claim to test DDL.

The Core ownership/privilege test now uses physical metadata. The public E2E
proof retains two explicit instances, every attributed snapshot field,
immutability and changed/removed provider configurations. The removed planner's
upgrade/orphan/equality self-tests and marker-only preparation test are retired;
generic conformance still accepts the plugin-owned `migration` verifier label.
Negative source/built/packed checks reject removed names and metadata; a focused
manifest regression rejects `migration:contribute` before declaration effects.

### Audit loop

| Pass | Finding / correction                                                                                                                           | Verification                                                                                                                               |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | Remove exact inventoried paths; rehome physical attribution assertions; correct a negative type-test import to the package's real source entry | 38 focused tests pass after canonical build; no new consumer or approved-scope exception                                                   |
| 2    | Incremental TypeScript output mixed cleaned bundles with missing nested declarations                                                           | Forced full TypeScript build passes, then canonical package build restores the published shape; no source workaround or weakened type rule |
| 3    | Declaration audit found three stale preparation/rename JSDoc descriptions                                                                      | Explain the existing explicit policy and direct synchronization; exports remain exactly the approved delta                                 |

Final validation and complete audit:

- Forced `yarn tsc --build tsconfig.json tooling/tsconfig/test.json --force`,
  canonical `yarn build`, root lint and `yarn constraints` pass. The incremental
  cache issue is resolved without source workarounds. Final JSDoc corrections
  are rebuilt and checked with test `tsc --noEmit` before commit.
- `yarn test --maxWorkers=2`: **2,533 tests / 525 files**, no type errors.
- `yarn test:e2e:built --maxWorkers=2`: **384 tests / 98 files**, including
  packed API/editor checks, physical metadata, direct rename preservation,
  private-storage orphans and rollback, Password Auth, codecs and raw leases.
- `yarn test:coverage`: **2,777 tests / 600 files**; statements 90.55%, branches
  83.97%, functions 95.89%, lines 91.15%. Thresholds/exclusions are unchanged.
  Against 3109, 675 identical instrumented maps and 466 retained locations in
  five changed maps have no coverage regression. The four missing files are
  exactly the removed implementations. Manual review accounts for the retired
  tokens, upgrade factory, migration metadata and marker skip; the rewritten
  physical-family guard still exercises rejection and acceptance, and the
  retained preparation callback still runs. The lower aggregate percentage
  reflects removed covered scaffolding, not a retained scenario loss.
- `yarn website:validate`: 66 content checks pass; website build passes. Public
  installation and testing guidance retains the unpublished-package boundary.
- Final backlog/active-documentation checks, changed-file formatting, relative
  links and `git diff --check` complete the recorded documentation gate.

All 23 roots expose **1,705 names**, exactly 14 fewer than 3109 (Core 9,
PostgreSQL 4, testing 1), with no addition. Only those three declaration files
change; the other 20 are byte-identical. The changed shapes are precisely the
approved families/privilege, migration members and provider/requirement tuples,
plus corrected JSDoc. `renamedFrom` and all physical snapshot fields remain.

Production changes by **+15 / -460 = -445 lines**: Core -297, PostgreSQL -111,
testing -37. Tests/support change by **+149 / -471 = -322**. Production is now
123,468 lines (Core 65,584); tests/support 130,601 and unchanged tooling 2,119.
No performance or CI claim is made. Logs, declarations, source-hash evidence
and location-level coverage comparisons are at `/tmp/ultimabase-m31-3110`.

Reviewed scope: `21094201` plus the entire issue diff, deletions and handoff.
No unresolved finding or work beyond ADR-0266/3110 remains. The dedicated local
commit and its complete line counts are reported after commit. Only then may
3111 start; no push.
