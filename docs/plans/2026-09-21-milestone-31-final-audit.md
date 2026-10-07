# Milestone 31 — final simplification and parity audit

- Recorded: 2026-09-21
- Status: completed — hard stop after issue 3112 and its local commit
- Baseline: `1f04e5e3fb68e1d2c7dadebedb848e880f72d63b`; production identical to `265b54c9`
- Final implementation: `a190ed96`; final website: `cdcc33fb`
- Final measurement revision: `cdcc33fb1292317e5e1a2c6a93e4f51aaf6fca99`
- [Baseline](2026-09-21-residual-complexity-baseline.md), [inventory](2026-09-21-residual-complexity-inventory.md),
  [execution log](completed/residual-complexity-simplification-execution-log.md),
  [issue 3112](../../issues/3100-residual-complexity-simplification/3112-final-parity-and-simplification-audit.md),
  [removal history](../../HISTORIQUE_SUPPRESSIONS.md).

## Result and boundary

Issues 3101–3112 are complete, including the separately approved private Core
resolver follow-up. Each issue has its own audited local commit. The compiler
and the three public removal decisions were presented and accepted before
implementation. There is no unresolved audit finding or further authorized
issue. No push, deployment, publication, next milestone, paused ACL feature or
suspended Soft Delete work follows this delivery. The original stash is untouched.

The pass removes dead private helpers and unread Hooks/Access declaration
registries, reuses Core's field-path types, and replaces the private serialized
compiler round-trip with direct compilation and retained validation. The exact
Runtime-stage, Typegen-marker and migration-only removals follow accepted
ADRs 0264–0266. No replacement API, new plugin power, compatibility wrapper,
second command graph, concrete Core dependency or coverage exception is added.

This is a bounded audit of the agreed candidates and their consumers. It does
not certify that every remaining line or future abstraction is indispensable.
Unknown external users cannot be excluded by repository searches; the public
removals are explicit pre-release decisions, including the two known engineering
exceptions accepted for Typegen fixtures and FakeAdapterMigrationHistory.

## Comparable measurements

Measurements use the unchanged 3101 script, physical lines, test classification
and canonical bundled package declarations. Some source test-support filenames
are counted as production by that existing convention; it is unchanged here.
Raw artifacts live locally in `/tmp/ultimabase-m31-3101`, issue-specific sibling
directories, and `/tmp/ultimabase-m31-3112`. They are temporary evidence, not
Runtime input; the revisions and commands below allow their reproduction.

| Measurement                     | Baseline |   Final |           Delta |
| ------------------------------- | -------: | ------: | --------------: |
| Production lines                |  127,093 | 123,468 | -3,625 (-2.85%) |
| Production files                |      702 |     680 |             -22 |
| Core lines                      |   68,780 |  65,584 | -3,196 (-4.65%) |
| Core files                      |      339 |     321 |             -18 |
| Test/support lines              |  130,820 | 130,601 |            -219 |
| Test/support files              |      707 |     701 |              -6 |
| Tooling lines                   |    2,119 |   2,119 |               0 |
| Public export names             |    1,726 |   1,705 |             -21 |
| Bundled entry declaration bytes |  858,903 | 848,793 |         -10,110 |

| Changed package | Baseline production | Final production |  Delta | Baseline/final exports |
| --------------- | ------------------: | ---------------: | -----: | ---------------------: |
| Core            |              68,780 |           65,584 | -3,196 |          1,079 / 1,063 |
| Access          |               5,185 |            5,085 |   -100 |                79 / 79 |
| Hooks           |               5,528 |            5,364 |   -164 |              102 / 102 |
| PostgreSQL      |              10,794 |           10,683 |   -111 |                39 / 35 |
| Testing         |               1,383 |            1,346 |    -37 |                27 / 26 |
| Typegen         |               3,443 |            3,426 |    -17 |                28 / 28 |

The other 17 package production totals are unchanged. Documentation is measured
separately: through 3111, +2,426 / -397 = +2,029 lines. The final closure adds
only engineering records; its exact added/deleted/net counts are reported after
its commit. Generated files and tooling have zero delta. Test reductions retire
exclusive removed-format/protocol scenarios; live compiler and security
invariants are migrated and verified below. These categories use no-rename
physical diffs for comparable totals; per-commit Git counts may recognize moves.

### Structural reduction and maintenance spread

| Indicator                                  | Baseline                                                               | Final                                                                |
| ------------------------------------------ | ---------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Private schema compiler directory          | 21 files / 3,648 lines                                                 | 7 files / 1,368 lines                                                |
| Serialized compilation path                | input encoding, artifact IR, output decoding                           | direct prepared candidates and immutable selection facts             |
| Artifact identity transport                | two lookup Maps, reference WeakSet, encoder reverse/value maps and IDs | removed; compilation-local membership checks retain trust boundaries |
| Unread Hooks/Access declaration registries | two WeakMaps and readers                                               | removed                                                              |
| Hook field-path type recursion             | duplicated implementation                                              | existing Core types                                                  |
| Private artifact-session name fan-out      | 9 production files                                                     | 0                                                                    |
| Private compiler input/output name fan-out | 5 / 6 production files                                                 | 0 / 0                                                                |
| PreparedSchemaCompilation name fan-out     | 10 production files                                                    | 11                                                                   |
| Named protocol IDs still declared          | 36 of 39 historical IDs                                                | 33 of 39                                                             |
| Canonical command graphs / command kinds   | 1 / 2                                                                  | 1 / 2                                                                |

The compiler directory shrinks 62.5%; this is a local size measurement, not a
percentage of global complexity. Its 2,280-line baseline reduction is already
included in the production total. The 3106 commit alone removes 2,256 production
lines across its scope; nine compiler lines had already disappeared in 3102.

The remaining compiler shares existing SchemaRepresentation and
PreparedSchemaCompilation values; its small result and membership helpers occur
in five and six production files respectively. Two WeakSets and an opaque-value
Set are scoped to compilation to preserve nominal membership and snapshots.
They are not public registries or alternate runtime truth. Used identity,
provenance, transaction, validation and monotonic policy boundaries remain
intentional complexity. This audit does not assign a synthetic complexity score.

## Exact public changes and declaration parity

The accepted decisions are [ADR-0263](../adr/0263-direct-private-schema-compilation.md),
[ADR-0264](../adr/0264-remove-unused-runtime-stage-contributions.md),
[ADR-0265](../adr/0265-remove-typegen-emitter-marker.md) and
[ADR-0266](../adr/0266-defer-migration-only-protocols.md).
Only these 21 package-root names disappear; none is added:

- Core Runtime: `runtimePipelineStage`, `RuntimePipelineStageDefinition`,
  `RuntimePipelineStageHandler`, `RuntimePipelineStageName`, `RuntimePipelineStageOptions`.
- Core Typegen: `typegenEmitterCapability`, `TypegenEmitterCapability`.
- Core migrations: `adapterMigrationCapability`, `AdapterMigrationSupport`,
  `adapterUpgradeIntent`, `planAdapterMigrations`, `AdapterMigrationPlan`,
  `AdapterUpgradeIntentPayload`, `AdapterUpgradeTarget`, `OrphanedAdapterContribution`,
  `PlannedAdapterUpgrade`.
- PostgreSQL: `postgresMigrationContributionCapability`, `postgresUpgrade`,
  `postgresSchemaPreparationCapability`, `PostgresSchemaPreparationCapability`.
- Testing: `FakeAdapterMigrationHistory`.

Observable deltas also include the approved loss of opaque artifact-marker
selector equality (portable equality and opaque presence remain), removal of
normalization/commit plugin stage definitions, no emitter-specific uniqueness or
conditional fixture convention, and removal of `migration:contribute`, migration
metadata/intents/classification and marker-controlled PostgreSQL preparation.
The ordinary plugin identity/privilege rules remain. `schemaPolicy` retains its
existing default and explicit override/fail/ignore behavior, including renames.
Future migration issues 513–515 require a fresh integration decision.

All 23 current bundled declarations match the audited 3110 snapshots exactly.
Against 3101, 18 are byte-identical. The five changes are the reviewed Core
retirements/JSDoc, Hooks' equivalent field-path aliases, PostgreSQL/testing
retirements, and Typegen's narrower provider tuple. Generated committed examples
and fingerprints, dependency manifests/lockfile, CI configuration, coverage
configuration/thresholds/exclusions, measurement tools and line-budget baseline
are unchanged. Negative source, built and packed proofs reject retired exports
and privileges. No concrete plugin implementation moves into Core or Access.

## Complete inherited contract reconciliation

All 74 B/P/C IDs remain in the ledger. R-001–R-010 and D-001–D-005 remain the
accepted milestone 30 history; this work neither restores nor expands them.
The following families are covered by the final source/type, performance and
built/packed/PostgreSQL gates, with live public examples checked again in 3111.
"Retain" means the final milestone 30 contract, including its approved limits.

| ID    | Owner                     | Final disposition                                                                                              | Regression evidence                                                              |
| ----- | ------------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| B-001 | Core schema/query         | Retain                                                                                                         | unit/type, packed/JS, PostgreSQL E2E                                             |
| B-002 | Core Runtime              | Retain                                                                                                         | pipeline, Hooks, Access, ACL and validation suites                               |
| B-003 | Core Runtime              | Retain                                                                                                         | transaction, nested-write and rollback E2E                                       |
| B-004 | Core authority            | Retain                                                                                                         | Master type/runtime tests and transport E2E                                      |
| B-005 | Core/application          | Retain                                                                                                         | packed REST, GraphQL, relation-filter and Soft Delete JS E2E                     |
| B-006 | Core + Typegen            | Retain                                                                                                         | type tests, language-service tests, Typegen fixtures                             |
| B-007 | Core + transports         | Retain                                                                                                         | direct/REST/GraphQL parity E2E                                                   |
| B-008 | Core plugin graph         | Retain within one active graph; D-001 limits hosting                                                           | graph, lifecycle and conformance suites                                          |
| B-009 | Core application          | D-001 delivered: one initialized owner per JavaScript realm; concurrent requests and isolated workers retained | concurrency, isolation and foreign-application E2E                               |
| B-010 | Core kernel               | Retain                                                                                                         | `yarn constraints`, import/public API tests                                      |
| B-011 | Official engines          | Retain                                                                                                         | conformance and performance suites                                               |
| B-012 | Official plugins          | Retain except approved D-001                                                                                   | package public API, packed and E2E suites                                        |
| P-001 | Core declaration host     | Retain                                                                                                         | schema declaration, pg-vector, Password Auth tests                               |
| P-002 | Core declaration host     | Retain                                                                                                         | option type/runtime tests and Typegen fixtures                                   |
| P-003 | Core declaration host     | Additive patches/selectors retained; only opaque artifact-marker equality removed by ADR-0263                  | direct compiler, selector, patch and mutation tests; literal workflow example    |
| P-004 | Core schema               | Retain                                                                                                         | field-kind, codec, PostgreSQL and GraphQL tests                                  |
| P-005 | Core application surfaces | Retained mutations; R-010 removed in 3005                                                                      | type, packed and PostgreSQL E2E                                                  |
| P-006 | Core operations           | Retained application operations; R-010 removed in 3005                                                         | operation unit/type and transport E2E                                            |
| P-007 | Core schema mutations     | Retained; canonical graph delivered                                                                            | schema-mutation conformance and transport E2E                                    |
| P-008 | Core private storage      | Retain                                                                                                         | private-storage and Password Auth E2E                                            |
| P-009 | Core lifecycle            | Retain                                                                                                         | lifecycle and failure-cleanup tests                                              |
| P-010 | Core plugin graph         | Retain within one active application                                                                           | graph and conformance suites                                                     |
| P-011 | Core capability host      | Retain                                                                                                         | capability host, ownership, instance and lifecycle tests                         |
| P-012 | Core Runtime              | Used behavior/interceptors retained; unused normalization/commit stage authoring removed by ADR-0264           | behavior/assembly, ACL, Hooks and negative source/packed API tests               |
| P-013 | Core Runtime              | Retain                                                                                                         | enforcement monotonicity and product E2E                                         |
| P-014 | Core Runtime              | Retained consumed protocols/privilege; R-009 removed in 3004                                                   | observer/diagnostic tests                                                        |
| P-015 | Core persistence          | Retain                                                                                                         | persistence rewrite and Soft Delete E2E                                          |
| P-016 | Core adapter bridge       | Physical bridge/provenance/raw leases retained; migration scaffolding and testing history removed by ADR-0266  | physical contribution snapshots, ownership, private-storage and PostgreSQL tests |
| P-017 | Core transport            | Retained; derived from canonical graph                                                                         | transport planning and E2E                                                       |
| P-018 | Core/plugin-kit events    | Retain                                                                                                         | event ordering/type and PostgreSQL E2E                                           |
| P-019 | Core Typegen              | Graph-derived references/generation retained; emitter marker and its fixture convention removed by ADR-0265    | Typegen setup/order, generated fingerprints, references, editor and packed tests |
| P-020 | Core authority            | Retain                                                                                                         | audit failure/inheritance E2E                                                    |
| P-021 | Core policy               | Retain                                                                                                         | subject, ACL and cross-application tests                                         |
| P-022 | Core diagnostics          | Retain                                                                                                         | privilege policy, diagnostics and conformance tests                              |
| P-023 | Core application          | Retained; Typegen descriptive inspection narrowed only by D-005                                                | setup/lifecycle and package integration tests                                    |

### Named protocol reconciliation

The 33 retained declarations exist in production. The six retired protocol
names have no production declaration: three already retired in milestone 30,
and C-023/C-026/C-039 retired by the exact milestone 31 approvals. Public
cardinality, owner validation and lifecycle remain covered for retained tokens.

| ID    | Protocol                                              | Current declaration or exact retirement                                                                       |
| ----- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| C-001 | `ultimabase.access.contributions`                     | `packages/access-plugin/src/contributions.ts`                                                                 |
| C-002 | `ultimabase.access.diagnostics-observer`              | `packages/access-plugin/src/runtime/diagnostics.ts`                                                           |
| C-003 | `ultimabase.acl-change-events`                        | `packages/acl-permissions-plugin/src/acl-events.ts`                                                           |
| C-004 | `ultimabase.application-operation-transport-planning` | `packages/core/src/runtime/application/application-operation-transport-planning.ts`                           |
| C-005 | `ultimabase.application-request-execution`            | `packages/core/src/runtime/application/application-request-execution.ts`                                      |
| C-006 | `ultimabase.application-schema-mutation-surface`      | `packages/core/src/runtime/application/application-schema-mutation-surface.ts`                                |
| C-007 | `ultimabase.database-adapter`                         | `packages/core/src/runtime/database/contracts.ts`                                                             |
| C-008 | `ultimabase.graphql.application`                      | `packages/graphql-plugin/src/application.ts`                                                                  |
| C-009 | `ultimabase.graphql.http-endpoint`                    | `packages/graphql-http/src/index.ts`                                                                          |
| C-010 | `ultimabase.graphql.schemas`                          | `packages/graphql-plugin/src/schema-contributions.ts`                                                         |
| C-011 | `ultimabase.hook-diagnostics-observer`                | `packages/hooks-plugin/src/runtime/diagnostics.ts`                                                            |
| C-012 | `ultimabase.hooks.contributions`                      | `packages/hooks-plugin/src/contributions.ts`                                                                  |
| C-013 | `ultimabase.hooks.event-consumers`                    | `packages/hooks-plugin/src/runtime/events.ts`                                                                 |
| C-014 | `ultimabase.http.application`                         | `packages/http-plugin/src/application-capability.ts`                                                          |
| C-015 | `ultimabase.http.browser-policy`                      | `packages/http-plugin/src/browser-policy-capability.ts`                                                       |
| C-016 | `ultimabase.http.context-resolvers`                   | `packages/http-plugin/src/context.ts`                                                                         |
| C-017 | `ultimabase.http.endpoints`                           | `packages/http-plugin/src/endpoints.ts`                                                                       |
| C-018 | `ultimabase.operation-transport-bindings`             | `packages/core/src/runtime/plugin-operations/capabilities.ts`                                                 |
| C-019 | `ultimabase.persistence-plan-rewriters`               | `packages/core/src/runtime/persistence/capabilities.ts`                                                       |
| C-020 | `ultimabase.plugin-operation-handlers`                | `packages/core/src/runtime/plugin-operations/capabilities.ts`                                                 |
| C-021 | `ultimabase.plugin-schema-mutation-handlers`          | `packages/core/src/runtime/schema-mutations/capabilities.ts`                                                  |
| C-022 | `ultimabase.postgres-connection`                      | `packages/postgres-plugin/src/connection/contracts.ts`                                                        |
| C-023 | `ultimabase.postgres-migration-contribution`          | ADR-0266 / 3110: migration contribution token removed; physical contributions retained                        |
| C-024 | `ultimabase.postgres-physical-schema-contribution`    | `packages/postgres-plugin/src/adapter-capabilities.ts`                                                        |
| C-025 | `ultimabase.postgres-raw-adapter`                     | `packages/postgres-plugin/src/adapter-capabilities.ts`                                                        |
| C-026 | `ultimabase.postgres-schema-preparation`              | ADR-0266 / 3110: preparation marker removed; explicit schemaPolicy and direct renames retained                |
| C-027 | `ultimabase.request-subject.principal-resolver`       | `packages/core/src/access/subject/contracts.ts`                                                               |
| C-028 | `ultimabase.request-subject.reference-cleanup`        | `packages/core/src/access/subject/reference-cleanup.ts`                                                       |
| C-029 | `ultimabase.request-subject.role-resolver`            | `packages/core/src/access/subject/contracts.ts`                                                               |
| C-030 | `ultimabase.rest.route-graph`                         | `packages/rest-plugin/src/routes.ts`                                                                          |
| C-031 | `ultimabase.role-events`                              | `packages/roles-plugin/src/role-events.ts`                                                                    |
| C-032 | `ultimabase.runtime-behaviors`                        | `packages/core/src/runtime/capabilities.ts`                                                                   |
| C-033 | `ultimabase.runtime-constraints`                      | `packages/core/src/runtime/capabilities.ts`                                                                   |
| C-034 | `ultimabase.runtime-executor`                         | R-004: direct canonical Runtime retained                                                                      |
| C-035 | `ultimabase.runtime-interceptors`                     | `packages/core/src/runtime/capabilities.ts`; logical interceptors retained, stage factory removed by ADR-0264 |
| C-036 | `ultimabase.runtime-observers`                        | R-009: product observers/events retained                                                                      |
| C-037 | `ultimabase.schema-compiler`                          | R-003: direct canonical compiler retained; direct private compilation simplified by ADR-0263                  |
| C-038 | `ultimabase.schema-mutation-transport-bindings`       | `packages/core/src/runtime/schema-mutations/transport-capabilities.ts`                                        |
| C-039 | `ultimabase.typegen-emitter`                          | ADR-0265 / 3109: emitter marker removed; graph-based generation retained                                      |

## Retained coverage and compiler invariants

| Aggregate metric |                 Baseline |                    Final |
| ---------------- | -----------------------: | -----------------------: |
| Statements       | 24,593 / 27,345 (89.93%) | 23,955 / 26,454 (90.55%) |
| Branches         | 15,260 / 18,328 (83.26%) | 14,942 / 17,794 (83.97%) |
| Functions        |   5,151 / 5,398 (95.42%) |   5,025 / 5,240 (95.89%) |
| Lines            | 23,879 / 26,373 (90.54%) | 23,250 / 25,505 (91.15%) |

A higher percentage is not the parity proof. The final comparison checks 652
identical instrumented maps and 2,069 mapped statement/function/branch locations
in 21 changed files: no previously covered comparable location loses coverage.
The moved provenance validator has identical maps and no loss. Twenty-nine old
paths disappear and seven direct-compiler paths appear; these cannot be judged
by matching file names or aggregate percentages.

| Changed or retired region                                          | Retained evidence / reason for removal                                                                                                                                                                                     |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Private Core helpers and Hooks/Access readers                      | No consumer through source/package roots; removed bodies had zero coverage; initialization/import locations retire with them. Existing authoring, policy, editor and type scenarios stay.                                  |
| Compiler artifact/session, encoding/decoding and format validators | Private version/ID/envelope-only assertions retire with the format. Live identity, membership, provenance, options, snapshots, order and completeness scenarios move to the direct boundary.                               |
| Compiler consumer readers                                          | Command compilation reads the same final field/selection facts directly; canonical command, model-surface and transport proofs stay.                                                                                       |
| Runtime stage registry/assembly                                    | Only factory-exclusive normalization/commit contribution scenarios retire. Used logical interceptors, ownership, guards, transactions and post-commit events remain covered.                                               |
| Typegen marker/provider                                            | Only marker availability/uniqueness convention retires. Current generation, references, setup timing, generic conditional privileges and fingerprints remain covered.                                                      |
| Migration planner/markers/history                                  | Exclusive intent/classification/helper assertions retire under the explicit engineering exception. All nine physical snapshot fields, ownership, raw leases, private storage, policies and direct renames remain verified. |

The compiler audit maps every live invariant in ADR-0263 to its current owner:
capture and normalization once; original schema/field/output/constraint identity;
portable snapshots and opaque identity; complete deterministic per-batch
selections including empty results; all five additive patch families and their
provenance; original Core/virtual fields; callback silence; full graph validation;
existing command validation; all-before-finalize registry publication; runtime
option compilation after capabilities and before setup. Corruption rejects
before infrastructure effects. No nominal checks disappear just because the
compiler is private.

The loop found and corrected inherited-property field lookup, persisted/virtual
ordering, opaque-getter replay risk and a lost path-without-equals selector
branch before 3106 was committed. Nine public name regressions and the migrated
selector assertion protect those corrections. The final comparison reconciles
the new physical-family guard's covered rejection/acceptance arms and the retained
PostgreSQL prepare callback; the unmatched former skip branch belongs solely
to the retired marker. Details remain in the 3106/3108/3109/3110 handoffs.

## Validation evidence and reuse boundary

The final package source/tests/tooling/configuration are byte-identical to the
fully validated 3110 commit. Issue 3111 changes only documentation; 3112 changes
only engineering records. Accordingly the complete package suite is reused
from that exact implementation, not represented as rerun in 3112. Fresh 3112
checks cover the changed records, declaration hashes, all contract IDs, coverage
reconciliation and comparable measurements. Metadata/active-contract tests pass
14 checks, website content passes 66, and all 111 changed-document relative
links resolve. Changed-file formatting and `git diff --check` pass. No unavailable required check is
reported as passing.

| Check                                | Completed evidence                                                                                                                                                          |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Root typecheck                       | 3110: full `yarn tsc --build tsconfig.json tooling/tsconfig/test.json --force`; final test-project no-emit check passes                                                     |
| Canonical `yarn build`               | 3110: all packages, declaration build, publint and attw pass; final declaration hashes verified in 3112                                                                     |
| `yarn test --maxWorkers=2`           | 3110: 2,533 tests / 525 files pass                                                                                                                                          |
| `yarn test:coverage`                 | 3110: 2,777 tests / 600 files pass; unchanged thresholds, final baseline comparison in 3112                                                                                 |
| `yarn test:e2e:built --maxWorkers=2` | 3110: 384 tests / 98 files pass, including packed exports, PostgreSQL and editor contracts                                                                                  |
| Root lint and constraints            | 3110: pass with zero lint errors, 51 existing warnings; no dependency or rule change                                                                                        |
| Website content/type/lint/build      | 3111: 66 content checks and all other gates pass; content/build repeated after final Roadmap correction                                                                     |
| Website browser suite                | 3111: 59 tests / 8 files pass; corrected guide viewport/theme checks and final Roadmap checks also pass                                                                     |
| Literal public examples              | 3111: 57 MDX pages, 142 TS/JS fences, 193 named imports audited; Core/policies/auth/Soft Delete/Typegen/workflow examples compile; PostgreSQL REST/GraphQL journeys execute |
| Fresh closure checks                 | 3112: issue/active-contract metadata, content validation, relative links, formatting and diff checks; exact current declaration hashes and complete B/P/C ledger            |
| Fresh measurements                   | 3112: `yarn measure:simplification` and `yarn measure:runtime-baseline`, separately from active tests                                                                       |

The forced typecheck repairs a stale incremental output/cache combination; it
uses the same root projects and strict compiler settings as `yarn typecheck`.
Canonical build restores comparable bundled declarations afterward. Built suites
use two workers after default-concurrency editor timeouts; no assertion or test
timeout was weakened. Browser/Docker checks use the local prerequisites and
disposable PostgreSQL environment. Temporary runners and generated artifacts
were cleaned; no development database or suspended stash was modified.

### Runtime and memory observations

Same local macOS 15.7.9, Node 24.20.0, Yarn 4.9.2, unchanged deterministic
no-product adapter, 20 sequential samples, explicit GC and awaited disposal.
Medians below are local observations without a statistical confidence interval.

| Measurement               |   Baseline |      Final | Observed delta |
| ------------------------- | ---------: | ---------: | -------------: |
| Startup ms                |   1.693456 |   1.020619 |         -39.7% |
| Read ms                   |   0.404961 |   0.399638 |          -1.3% |
| Mutation ms               |   0.495590 |   0.505048 |          +1.9% |
| Heap before bytes         |  8,970,136 |  9,679,120 |       +708,984 |
| Heap after startup bytes  |  9,994,184 | 10,196,088 |       +201,904 |
| Heap after requests bytes | 10,191,416 | 10,400,136 |       +208,720 |

The observation supports a shorter startup in this small scenario. Reads and
mutations are effectively close at this resolution; it is not a general
throughput benchmark. Absolute heap is higher, so there is no claimed overall
memory gain. Existing no-product/Hooks/Access/combined performance tests retain
zero absent-product work and expected database/transaction counts.

Coverage wall time is 431.79s at baseline and 420.64s finally, a local -2.6%
observation affected by suite size and machine conditions. It is not CI timing.
No push was authorized or performed and no milestone 31 CI improvement is claimed.

## Commit and audit history

| Issue          | Dedicated commit                                             | Added | Deleted |    Net | Production net |
| -------------- | ------------------------------------------------------------ | ----: | ------: | -----: | -------------: |
| 3101           | `4df180bc`                                                   |   391 |      69 |   +322 |              0 |
| 3102           | `040e7df1`                                                   |   114 |     372 |   -258 |           -334 |
| 3103           | `4759aef3`                                                   |   177 |     164 |    +13 |           -100 |
| 3104           | `ddeea4de`                                                   |   288 |     259 |    +29 |           -164 |
| 3105           | `5bc6c90b`                                                   |   289 |      39 |   +250 |              0 |
| 3102 follow-up | `75ed6561`                                                   |    39 |      65 |    -26 |            -61 |
| 3106           | `a539cfc8`                                                   | 2,335 |   4,349 | -2,014 |         -2,256 |
| 3107           | `adbefbad`                                                   |   534 |      73 |   +461 |              0 |
| 3108           | `86a629a7`                                                   |   267 |     418 |   -151 |           -223 |
| 3109           | `21094201`                                                   |   226 |     145 |    +81 |            -42 |
| 3110           | `a190ed96`                                                   |   455 |   1,079 |   -624 |           -445 |
| 3111           | `cdcc33fb`                                                   |   144 |      42 |   +102 |              0 |
| 3112           | this final closure commit; hash/counts reported after commit |     — |       — |      — |              0 |

All earlier issues have completed checklists, a recorded audit loop and exactly
one documentation-impact classification. No removal issue was silently skipped
or superseded. The 3111 review corrected stale PostgreSQL preparation and Typegen
wording missed by earlier documentation passes, and reconciled the public
Roadmap; literal examples and browser verification then passed again.

The final 3112 audit checks the full baseline-to-final scope, approved deltas,
all 74 IDs, export/declaration sets, generated artifacts, dependency direction,
coverage locations and migrated scenarios. Its second pass reviews the completed
report, archived plan, issue/milestone status, links and explicit stop boundary.
No finding remains. The public site remains accurate after this engineering-only
closure. Resume point: **none**.
