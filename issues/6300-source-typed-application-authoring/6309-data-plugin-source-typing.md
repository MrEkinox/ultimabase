# 6309: Migrate Soft Delete, vector, and PostgreSQL source typing

- Status: completed
- Milestone: 63
- Packages: `@ultimabase/soft-delete-plugin`, `@ultimabase/pg-vector-plugin`, `@ultimabase/postgres-plugin`
- Depends on: 6308
- ADR: ADR-0279
- Execution contract: [milestone 63 DX and audit contract](../../docs/plans/2026-09-28-source-typed-application-authoring-target.md)

## Goal

Migrate the data and persistence vertical to source typing while preserving
schema-local configuration, physical persistence behavior, transactions, and
all current specialized fields and commands.

## Acceptance criteria

- [x] Soft Delete retains application defaults, direct schema exceptions such as `softDelete: false`, exact query visibility, mutations, restoration, hard-delete behavior, Access/Hooks interaction, and transaction semantics.
- [x] pg-vector retains its exact current logical field configuration, immutable vector value, dimensions, structural validation, portable storage and GraphQL codecs, supported generic filters/index behavior, diagnostics, and stored-field builder context.
- [x] Installing `pgVectorPlugin()` adds `field.vector()` only to that configured factory; absence and unrelated configured factories reject the method in source and at static compilation.
- [x] The migration does not claim or add physical PostgreSQL vector columns, vector ordering, or vector-specific indexes; those remain future functionality.
- [x] PostgreSQL retains adapter configuration, schema synchronization, metadata, `renamedFrom`, transaction-bound raw access, constraints, atomic deltas, relation behavior, lifecycle, and disposal.
- [x] Available plugin field builders, schema options, mutations, and model commands infer from source without new generated plugin declarations; these packages do not define application operations.
- [x] Logical operations remain separate from physical plans, and protected constraints cannot be widened by persistence rewrites.
- [x] Direct options configure only an installed unambiguous plugin instance; absence, ambiguity, conflicts, and invalid values retain focused source and Runtime diagnostics.
- [x] No new Typegen descriptor or compatibility branch is introduced. Still-consumed PostgreSQL option references and old-form consumers remain explicitly assigned to 6313/6314 for removal, rather than being deleted before their last consumer.
- [x] Package READMEs, schema examples, database examples, and public documentation are reviewed or updated; the Todo old-form example is explicitly assigned to 6314.
- [x] Documentation impact is recorded.

## Tests

- [x] Existing unit, type, editor, PostgreSQL E2E, transaction, constraint, lifecycle, and persistence-plan suites migrate without dropped assertions.
- [x] Source and packed applications cover plugin presence, absence, local exceptions, logical vector fields without physical persistence, and supported database operations without generated plugin-surface declarations.
- [x] Locked TypeScript performance and memory budgets.
- [x] `yarn validate:full` before the issue is completed.

## Audit and commit gate

- [x] Record the starting revision and inventory every schema option, field, operation, plan, adapter, transaction, metadata, and lifecycle contract across the three packages.
- [x] Audit the complete diff for hidden rows, incorrect hard deletion, transaction escape, widened constraints, logical/physical conflation, vector precision loss, adapter lifecycle leaks, private Core access, per-plugin bridges, stale Typegen, and documentation drift.
- [x] Record each finding and correction in the handoff; rerun affected database and plugin verticals plus the complete cross-plugin audit until no finding remains.
- [x] Any failed, skipped, interrupted, flaky, or unavailable required check keeps the issue `in-progress`; unavailable PostgreSQL evidence is not a passing result.
- [x] Complete every acceptance/test checkbox, locked performance gate, and exactly one Documentation impact classification before setting `completed`.
- [x] Create one dedicated local commit only after `yarn validate:full` and the audit are green; inspect its complete diff and line categories, amend/re-audit if needed, and do not push.

## Out of scope

- A migration framework or database-specific behavior in Core.
- Physical PostgreSQL vector persistence, ordering, specialized indexes, algorithms, or other new database features.
- Changing logical operation semantics to simplify an adapter.

## Starting inventory and bounded migration

- Starting revision: `bea238f8`; the working tree was clean. Issue 6308's
  complete baseline was 557 ordinary files/2,631 tests and 635 coverage
  files/2,888 tests, with 90.85/84.36/96.03/91.42 coverage.
- Soft Delete owns one direct schema option, three modes, explicit and
  inherited tombstone patches, schema/model mutations, protected visibility,
  a delete-to-update physical plan, Master-only restore/purge, transport
  bindings, and Access/Hooks/transaction interactions. Issue 6307 already
  projected explicit options and mutations; this issue projects omitted-option
  defaults from the literal `defaultMode` and reuses one absence selector for
  the corresponding Runtime branches. `softDelete: false` remains an override.
- pg-vector already projected its stored-only builder from its authorized
  field family. Its immutable dimension-checked logical value, portable codec,
  generic query support, and GraphQL codec are unchanged. Source and packed
  tests now prove presence and absence on an unrelated factory. No physical
  PostgreSQL vector column, ordering, or specialized index is added.
- PostgreSQL owns adapter configuration, direct synchronization and
  `renamedFrom`, attributed physical metadata, protected constraints,
  transaction-bound raw leases, atomic deltas, relationship execution,
  connection ownership, and disposal. Its option registrar previously returned
  `undefined`, and its public plugin annotation erased the source projection.
  The registrar now returns its existing option receipt; the annotation reads
  that source and does not change the adapter or lifecycle.

## Audit loop

| Iteration | Finding or evidence                                                                                                                                             | Correction or decision                                                                                                                                                                                                                                          | Validation result                                                                           | Remaining findings                             |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| 1         | The PostgreSQL source canary failed for both schema and stored-field options; a package test-only ambient Typegen augmentation had hidden this absence.         | Return the existing `defineOptions` receipt and carry its type on `PostgresPlugin`. Keep the test-only augmentation solely for unmigrated standalone `Schema.define` fixtures until issue 6314; add isolated source/packed editor fixtures that do not load it. | `yarn typecheck`, source/packed option and absence tests passed.                            | Complete gate pending.                         |
| 2         | Soft Delete's explicit option was source typed, but omitted-option defaults lost the tombstone and commands.                                                    | Capture the literal factory mode in the plugin source type; use the same exact absence selector in Runtime and conditional source projections. Widened modes expose only guaranteed commands.                                                                   | Source type tests, source/packed editor tests, and PostgreSQL Soft Delete verticals passed. | Complete gate pending.                         |
| 3         | Vector and PostgreSQL public examples still put plugin fields/options on standalone schemas, and vector docs required Typegen regeneration for a local builder. | Show the configured factory before schema declaration, explain the logical-only vector boundary, and update direct option/command examples.                                                                                                                     | Focused editor tests and the 1/10/50-schema locked benchmark passed.                        | Complete documentation and diff audit pending. |

The Todo backend still installs PostgreSQL through the old constructor after
declaring schemas on a different configured factory. Its generated PostgreSQL
option augmentation remains a bounded old-form consumer. Issue 6314 explicitly
owns removal of constructor installation and migration of all repository
consumers; 6313 owns global Typegen descriptor/reference pruning. Neither
change is silently absorbed here. The retained PostgreSQL `typegen` option
references and generated option output remain live until those issues, not a
second new source registry. No adapter, Runtime plan, transaction, privilege,
metadata, or storage behavior was changed in this issue.

The raw performance checkpoint and baseline/prior comparisons are recorded in
[`evidence/6309-data-plugin-benchmark.md`](evidence/6309-data-plugin-benchmark.md).

## Completion audit

| Iteration | Finding or evidence                                                                                                                                               | Correction or decision                                                                                                                                         | Validation result                                                                                                                                                                                     | Remaining findings                         |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| 4         | A preliminary full run stopped at formatting of this issue record; a later run reached lint and found six errors in new type tests and one unnecessary assertion. | Formatted the record, replaced unsafe negative calls with exact key-presence type assertions, removed the unnecessary assertion, and fixed unused test values. | Targeted typecheck and lint passed. A subsequent `yarn validate:full` passed 557/2,632 ordinary and 635/2,893 coverage tests with unchanged 90.85/84.36/96.03/91.42 coverage and 17/66 website tests. | Post-validation diff audit still required. |
| 5         | That diff audit found that the PostgreSQL declaration contribution had moved to module evaluation, changing its object-creation lifecycle unnecessarily.          | Kept the source receipt but restored contribution creation inside each plugin factory call. No adapter, connection, or static callback execution path changed. | The final `yarn validate:full` passed on corrected code.                                                                                                                                              | None.                                      |

One orchestration run lost its output, and one duplicate validation process was
interrupted after its ordinary tests; neither is counted as a passing gate.
The later complete run passed before the iteration-5 correction and is likewise
not claimed as the final gate. The final `yarn validate:full` passed on the
corrected code: 557 ordinary files/2,632 tests, 635 coverage files/2,893 tests,
and 17 website files/66 tests. Coverage remained 90.85% statements
(23,875/26,278), 84.36% branches (14,760/17,496), 96.03% functions
(5,020/5,227), and 91.42% lines (23,149/25,320), identical to the issue-6308
baseline. Format, typecheck, lint with zero errors, build, issue metadata,
constraints, public docs, and the locked benchmark all passed. Focused
source/packed editor tests and six real PostgreSQL suites with 21 tests passed
before the final correction; the complete suite was repeated afterward.

The staged-diff review found one documentation-only mismatch after that full
gate: the Core vector example still initialized an application with no
database adapter. It now demonstrates pure `compile()` as the package README
does; the PostgreSQL and Soft Delete wording was also aligned with the actual
configured/sole-owner paths. The affected `yarn format:check`, `yarn
check:issues`, and `yarn website:validate` checks passed again (17 website
files/66 tests). No production or test source changed after the final full
gate. The final line categories before commit are +70/-44 production,
+206/-8 tests, and +85/-85 package/example/public documentation; no generated
artifact changed. Issue/plan/benchmark evidence is additional audit text.

Documentation impact: `both`. Package READMEs, the Core vector schema example,
and the public PostgreSQL, vector, and Soft Delete pages now explain the
configured source-typed surfaces and the vector persistence limit. The Todo
backend's old installation/example path remains accurate only as bounded
migration state; issue 6314 owns its removal. No Runtime behavior was expanded
or removed beyond the accepted source-typing criteria.
