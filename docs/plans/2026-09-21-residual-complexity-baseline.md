# Milestone 31 — baseline and retained-contract ledger

- Recorded: 2026-09-21
- Status: completed — baseline validated; no production change
- Source revision: `1f04e5e3fb68e1d2c7dadebedb848e880f72d63b`
- Production sources: identical to milestone 30 final `265b54c9`
- Owner: [issue 3101](../../issues/3100-residual-complexity-simplification/3101-baseline-and-consumer-inventory.md)
- [Plan](2026-09-21-residual-complexity-simplification.md),
  [candidate evidence](2026-09-21-residual-complexity-inventory.md),
  [previous final audit](2026-09-21-milestone-30-final-audit.md)

## Environment and reproducibility

The starting tree was clean. Fetch confirmed one local planning commit above
origin/main and no missing remote implementation. The suspended Soft Delete
stash remains untouched. Environment: macOS 15.7.9/build 24G830, x86_64, Node
24.20.0, Yarn 4.9.2, Docker Desktop server 29.7.2 with 8,321,871,872 bytes for
containers. Existing integration setup uses `postgres:17-alpine` and isolated
worker schemas, never a shared development/application database.

Canonical package builds precede public declaration measurements. Archive/type
fixtures may regenerate declarations, so all 23 built entries and export sets
were retained before those tests. Raw logs/snapshots and coverage are local at
`/tmp/ultimabase-m31-3101`. These are reproducible validation artifacts, not
Runtime input or a new public API. Recreate missing artifacts from the exact
source revision with existing commands.

```sh
yarn typecheck
yarn build
yarn measure:simplification
yarn measure:runtime-baseline
env NODE_OPTIONS=--max-old-space-size=6144 yarn lint
yarn constraints
yarn test:coverage
yarn test:e2e:built
```

Coverage includes source unit/type/performance and instrumented integration
projects; built E2E includes packed-package scenarios. Do not rerun identical
archive scenarios as an additional full suite. Runtime samples were captured
separately from active validation jobs; timing remains descriptive, not a
regression budget.

## Source and public surface

Use the unchanged milestone 30 definitions: physical UTF-8 lines excluding the
last empty line; production is non-generated/non-test TypeScript under package
src; tests/support and tooling are separate. The existing classifier includes
some named src test-support files in production; retain its convention for
comparable deltas. Documentation is not a production simplification gain.

| Scope               | Files |   Lines |
| ------------------- | ----: | ------: |
| Production packages |   702 | 127,093 |
| Core                |   339 |  68,780 |
| Tests/support       |   707 | 130,820 |
| Tooling             |    13 |   2,119 |

The 23 built roots expose 1,726 names and 858,903 declaration bytes, matching
the milestone 30 final measurement. SHA-256 of the sorted package/name list:
`fd134bec738aef26381ccf48bcf407c4645f843edb598d2222c3cc6d3c98771a`.
The raw snapshot also records each declaration hash and complete export set.

| Package                              | Production files | Production lines | Exports | Declaration bytes |
| ------------------------------------ | ---------------: | ---------------: | ------: | ----------------: |
| `@ultimabase/access-plugin`          |               29 |            5,185 |      79 |            36,909 |
| `@ultimabase/acl-permissions-plugin` |               18 |            3,581 |      42 |            19,465 |
| `@ultimabase/apollo-sandbox-plugin`  |                4 |              291 |       5 |             2,730 |
| `@ultimabase/core`                   |              339 |           68,780 |    1079 |           573,316 |
| `@ultimabase/create-app`             |                9 |            1,718 |      15 |             5,544 |
| `@ultimabase/graphiql-plugin`        |                4 |              278 |       5 |             2,626 |
| `@ultimabase/graphql-http`           |                2 |               82 |       3 |               783 |
| `@ultimabase/graphql-plugin`         |               52 |            8,659 |      33 |            11,903 |
| `@ultimabase/graphql-yoga-plugin`    |                8 |              815 |       4 |             2,693 |
| `@ultimabase/hooks-plugin`           |               33 |            5,528 |     102 |            47,914 |
| `@ultimabase/http-plugin`            |               14 |            2,499 |      64 |            19,260 |
| `@ultimabase/password-auth-plugin`   |               21 |            3,234 |      32 |            15,967 |
| `@ultimabase/pg-vector-plugin`       |                1 |              246 |      11 |             4,193 |
| `@ultimabase/plugin-kit`             |                8 |            1,317 |      44 |            22,041 |
| `@ultimabase/postgres-plugin`        |               65 |           10,794 |      39 |            15,475 |
| `@ultimabase/rest-plugin`            |               27 |            4,875 |      45 |            20,685 |
| `@ultimabase/roles-plugin`           |               12 |            2,313 |      40 |            18,614 |
| `@ultimabase/server-hono-plugin`     |                5 |              492 |       6 |             3,566 |
| `@ultimabase/shared`                 |                2 |               85 |       9 |             2,070 |
| `@ultimabase/soft-delete-plugin`     |                8 |              738 |       5 |             3,403 |
| `@ultimabase/testing`                |               10 |            1,383 |      27 |            15,147 |
| `@ultimabase/typegen`                |               25 |            3,443 |      28 |            10,209 |
| `@ultimabase/validation-plugin`      |                6 |              757 |       9 |             4,390 |

## Existing runtime measurements

Twenty sequential no-product applications use the deterministic adapter,
explicit GC, one read, one mutation and awaited disposal. Times are milliseconds;
heap values are bytes.

| Median            |      Value |
| ----------------- | ---------: |
| startupMs         |   1.693456 |
| readMs            |   0.404961 |
| mutationMs        |   0.495590 |
| heapBefore        |  8,970,136 |
| heapAfterStartup  |  9,994,184 |
| heapAfterRequests | 10,191,416 |

The existing performance suite also checks no-product, Hooks-only, Access-only
and combined scenarios, and rejects a deliberately inserted neutral stage.
The retained invariant is zero absent-product bundles/stages/calls and one
expected database read, mutation, transaction and commit. No public probe is
restored and no elapsed-time gain is promised.

## Representations and change fan-out

- Compiler declarations cross input encoding, canonical IR compilation, output
  validation and decoding. Command compilation consumes schema/selection facts
  before atomic publication. The IR has 21 production files/3,648 lines,
  including mandatory validation; this is not a removable-line estimate.
- The artifact session owns two Maps plus a separate nominal-reference WeakSet.
  SchemaCompilerArtifactSession appears in 9 production files, SchemaCompilerInput
  in 5, SchemaCompilerOutput in 6 and PreparedSchemaCompilation in 10. Counts
  include imports/declarations and measure maintenance fan-out, not removable files.
- Access/Hooks keep two unused declaration WeakMaps. Hooks repeats field-path
  type recursion already exported by Core. Core's declaration-targets.ts is
  isolated, including a four-line helper missed by the initial size-limited scan.
- runtimePipelineStage occurs only in its implementation and reexport among
  production files, while assembly retains identity lookup, owner wrapping and
  normalization/commit handler composition. ACL's other interceptors are used.
- Typegen setup directly generates output; the unread emitter marker separately
  enforces uniqueness/inspection semantics that require an explicit decision.
- The migration planner is called by FakeAdapterMigrationHistory and exercised
  by the open-kernel proof. Generic adapterMigrationCapability is covered by
  P-016 beside named PostgreSQL C-023/C-026. Attribution shared with actual
  physical-schema contributions remains used; do not delete it wholesale.

## Inherited contract IDs and new decision delta

Each row inherits its detailed consumers, public surfaces and regression proof
from the final [milestone 30 matrix](2026-09-20-architecture-contract-matrix.md).
All 74 B/P/C IDs are kept, including three retired tokens whose absence remains
required. R-001–R-010 and D-001–D-005 stay delivered history, not new proposals.
No public capability removal is approved by inventory issue 3101.

| ID    | Existing owner or protocol                            | Milestone 31 baseline disposition                                                 |
| ----- | ----------------------------------------------------- | --------------------------------------------------------------------------------- |
| B-001 | Core schema/query                                     | Retain final milestone 30 contract; no new delta approved                         |
| B-002 | Core Runtime                                          | Retain final milestone 30 contract; no new delta approved                         |
| B-003 | Core Runtime                                          | Retain final milestone 30 contract; no new delta approved                         |
| B-004 | Core authority                                        | Retain final milestone 30 contract; no new delta approved                         |
| B-005 | Core/application                                      | Retain final milestone 30 contract; no new delta approved                         |
| B-006 | Core + Typegen                                        | Retain final milestone 30 contract; no new delta approved                         |
| B-007 | Core + transports                                     | Retain final milestone 30 contract; no new delta approved                         |
| B-008 | Core plugin graph                                     | Retain final milestone 30 contract; no new delta approved                         |
| B-009 | Core application                                      | Retain ADR-0258: one active application, concurrent requests and isolated workers |
| B-010 | Core kernel                                           | Retain final milestone 30 contract; no new delta approved                         |
| B-011 | Official engines                                      | Retain final milestone 30 contract; no new delta approved                         |
| B-012 | Official plugins                                      | Retain final milestone 30 contract; no new delta approved                         |
| P-001 | Core declaration host                                 | Retain final milestone 30 contract; no new delta approved                         |
| P-002 | Core declaration host                                 | Retain final milestone 30 contract; no new delta approved                         |
| P-003 | Core declaration host                                 | Retain additive patches/selectors; destructive patches remain removed             |
| P-004 | Core schema                                           | Retain final milestone 30 contract; no new delta approved                         |
| P-005 | Core application surfaces                             | Retain schema/model mutations; arbitrary schema/model operations remain removed   |
| P-006 | Core operations                                       | Retain application operations; arbitrary schema/model operations remain removed   |
| P-007 | Core schema mutations                                 | Retain final milestone 30 contract; no new delta approved                         |
| P-008 | Core private storage                                  | Retain final milestone 30 contract; no new delta approved                         |
| P-009 | Core lifecycle                                        | Retain final milestone 30 contract; no new delta approved                         |
| P-010 | Core plugin graph                                     | Retain final milestone 30 contract; no new delta approved                         |
| P-011 | Core capability host                                  | Retain final milestone 30 contract; no new delta approved                         |
| P-012 | Core Runtime                                          | Retain final milestone 30 contract; no new delta approved                         |
| P-013 | Core Runtime                                          | Retain final milestone 30 contract; no new delta approved                         |
| P-014 | Core Runtime                                          | Retain final milestone 30 contract; no new delta approved                         |
| P-015 | Core persistence                                      | Retain final milestone 30 contract; no new delta approved                         |
| P-016 | Core adapter bridge                                   | Retain adapter bridge/provenance; RC-06 is pending                                |
| P-017 | Core transport                                        | Retain final milestone 30 contract; no new delta approved                         |
| P-018 | Core/plugin-kit events                                | Retain final milestone 30 contract; no new delta approved                         |
| P-019 | Core Typegen                                          | Retain final milestone 30 contract; no new delta approved                         |
| P-020 | Core authority                                        | Retain final milestone 30 contract; no new delta approved                         |
| P-021 | Core policy                                           | Retain final milestone 30 contract; no new delta approved                         |
| P-022 | Core diagnostics                                      | Retain final milestone 30 contract; no new delta approved                         |
| P-023 | Core application                                      | Retain final milestone 30 contract; no new delta approved                         |
| C-001 | `ultimabase.access.contributions`                     | Retain final milestone 30 contract; no new delta approved                         |
| C-002 | `ultimabase.access.diagnostics-observer`              | Retain final milestone 30 contract; no new delta approved                         |
| C-003 | `ultimabase.acl-change-events`                        | Retain final milestone 30 contract; no new delta approved                         |
| C-004 | `ultimabase.application-operation-transport-planning` | Retain final milestone 30 contract; no new delta approved                         |
| C-005 | `ultimabase.application-request-execution`            | Retain final milestone 30 contract; no new delta approved                         |
| C-006 | `ultimabase.application-schema-mutation-surface`      | Retain final milestone 30 contract; no new delta approved                         |
| C-007 | `ultimabase.database-adapter`                         | Retain final milestone 30 contract; no new delta approved                         |
| C-008 | `ultimabase.graphql.application`                      | Retain final milestone 30 contract; no new delta approved                         |
| C-009 | `ultimabase.graphql.http-endpoint`                    | Retain final milestone 30 contract; no new delta approved                         |
| C-010 | `ultimabase.graphql.schemas`                          | Retain final milestone 30 contract; no new delta approved                         |
| C-011 | `ultimabase.hook-diagnostics-observer`                | Retain final milestone 30 contract; no new delta approved                         |
| C-012 | `ultimabase.hooks.contributions`                      | Retain final milestone 30 contract; no new delta approved                         |
| C-013 | `ultimabase.hooks.event-consumers`                    | Retain final milestone 30 contract; no new delta approved                         |
| C-014 | `ultimabase.http.application`                         | Retain final milestone 30 contract; no new delta approved                         |
| C-015 | `ultimabase.http.browser-policy`                      | Retain final milestone 30 contract; no new delta approved                         |
| C-016 | `ultimabase.http.context-resolvers`                   | Retain final milestone 30 contract; no new delta approved                         |
| C-017 | `ultimabase.http.endpoints`                           | Retain final milestone 30 contract; no new delta approved                         |
| C-018 | `ultimabase.operation-transport-bindings`             | Retain final milestone 30 contract; no new delta approved                         |
| C-019 | `ultimabase.persistence-plan-rewriters`               | Retain final milestone 30 contract; no new delta approved                         |
| C-020 | `ultimabase.plugin-operation-handlers`                | Retain final milestone 30 contract; no new delta approved                         |
| C-021 | `ultimabase.plugin-schema-mutation-handlers`          | Retain final milestone 30 contract; no new delta approved                         |
| C-022 | `ultimabase.postgres-connection`                      | Retain final milestone 30 contract; no new delta approved                         |
| C-023 | `ultimabase.postgres-migration-contribution`          | Retain pending exact RC-06 decision and engineering-consumer audit                |
| C-024 | `ultimabase.postgres-physical-schema-contribution`    | Retain final milestone 30 contract; no new delta approved                         |
| C-025 | `ultimabase.postgres-raw-adapter`                     | Retain final milestone 30 contract; no new delta approved                         |
| C-026 | `ultimabase.postgres-schema-preparation`              | Retain pending exact RC-06 decision and engineering-consumer audit                |
| C-027 | `ultimabase.request-subject.principal-resolver`       | Retain final milestone 30 contract; no new delta approved                         |
| C-028 | `ultimabase.request-subject.reference-cleanup`        | Retain final milestone 30 contract; no new delta approved                         |
| C-029 | `ultimabase.request-subject.role-resolver`            | Retain final milestone 30 contract; no new delta approved                         |
| C-030 | `ultimabase.rest.route-graph`                         | Retain final milestone 30 contract; no new delta approved                         |
| C-031 | `ultimabase.role-events`                              | Retain final milestone 30 contract; no new delta approved                         |
| C-032 | `ultimabase.runtime-behaviors`                        | Retain final milestone 30 contract; no new delta approved                         |
| C-033 | `ultimabase.runtime-constraints`                      | Retain final milestone 30 contract; no new delta approved                         |
| C-034 | `ultimabase.runtime-executor`                         | Replacement token remains removed; retain direct canonical Core execution         |
| C-035 | `ultimabase.runtime-interceptors`                     | Retain used interceptors; only unused stage branch RC-04 awaits decision          |
| C-036 | `ultimabase.runtime-observers`                        | Generic observer token remains removed; retain product events/diagnostics         |
| C-037 | `ultimabase.schema-compiler`                          | Replacement token remains removed; retain canonical compilation; RC-03 pending    |
| C-038 | `ultimabase.schema-mutation-transport-bindings`       | Retain final milestone 30 contract; no new delta approved                         |
| C-039 | `ultimabase.typegen-emitter`                          | Retain emitter marker and uniqueness pending RC-05 decision                       |

RC-01/RC-02 require private cleanup with public parity. RC-03 maps to canonical
compilation, P-001–P-007 and B-001/B-006; RC-04 to C-035/B-002/B-003/B-011;
RC-05 to C-039/B-005/B-006/P-019; RC-06 to P-008/P-016/C-023/C-026. All other
IDs remain unchanged. The candidate ledger will record each later accepted
ADR, exact observable delta and delivered regression evidence. Pending decisions
retain the baseline.

## Validation and audit

Typecheck, canonical build including attw/publint, lint and constraints pass.
Full coverage passes 2,779 tests in 607 files with no type error, covering all
702 production files. The baseline percentages match milestone 30 exactly:

| Metric     | Covered / total | Percentage |
| ---------- | --------------: | ---------: |
| Statements | 24,593 / 27,345 |     89.93% |
| Branches   | 15,260 / 18,328 |     83.26% |
| Functions  |   5,151 / 5,398 |     95.42% |
| Lines      | 23,879 / 26,373 |     90.54% |

The retained local coverage JSON has SHA-256
`846ea01ad003d221281cfed729fc434f4ec1f7a6995db8142c087971b24ba122`.
Its dead declaration-target module and Access/Hooks registry wrappers have no
executed function body, consistent with the static reachability audit. Tests
alone do not establish deadness; they corroborate the module/export evidence.

Built/packed/PostgreSQL integration passes all 383 tests in 97 files. Issue
metadata and active-contract checks pass all 14 tests; website content passes
66 tests and its production build succeeds. Formatting, changed Markdown links
and git diff --check pass. No source, test, tooling, ADR, coverage setting or
milestone 30 evidence changed.

The audit corrected an initial reachability mistake: the four-line
runPluginDeclarationFactory helper and its module are also unused. The 3102
criteria and inventory now record this evidence without changing public scope.
The final complete audit confirms all 74 unique B/P/C identifiers are carried
forward, all six candidate decisions retain their gates, all 23 public roots
are captured and there is no unresolved finding. No capability is removed by
this baseline issue.
