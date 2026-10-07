# Core and kernel simplification checkpoint — issue 3014

- Recorded: 2026-09-21
- Status: complete — authorized run stopped after issue 3014
- Baseline: `5806d87a879df0db8265579737c83111eb6030f9`
- Audited implementation: `0828a1f4` (issues 3001–3013), plus the cold-build
  correction in issue 3014 described below.
- [Baseline](2026-09-20-architecture-simplification-baseline.md),
  [preservation ledger](2026-09-20-architecture-contract-matrix.md),
  [removal history](../../HISTORIQUE_SUPPRESSIONS.md).

## Authorized stopping point

Issue 3014 closes the currently authorized run. It does not close milestone 30.
No plugin-local issue is inspected or started, and nothing is pushed. The 16
package baselines below are preparation required by this checkpoint, not
implementation authority or approved removals. The suspended Soft Delete stash
and unrelated editor settings remain untouched.

## Audit and correction loop

The complete baseline diff is reviewed against every stable matrix ID.
Issues 3004/3005 remove approved powers; 3006/3007 enforce one active owner;
3008–3012 converge command compilation, binding and projections; 3013 removes
the final private fallback and verifies every retained coverage location.
Source, public exports, package READMEs, website pages, generated examples and
negative export tests remain part of the same audit.

A detached checkout was created at `0828a1f4`. Its own node_modules were
installed from the existing immutable Yarn cache; no dist or TypeScript build
cache was copied. The initial installation mistakenly skipped dependency build
scripts, leaving Argon2 and generated website types unavailable. A normal
`yarn install --immutable --immutable-cache` completed those builds; the affected
validation gates were then rerun. Those installation failures are recorded
separately from the product/configuration defect below. Initial cold `yarn typecheck`
found two TS2307 errors: create-app integration tests could not resolve their
package because root tsconfig.json omitted its project reference. A regression
test first reproduces that omission, then passes with the reference added.
Only tsconfig.json and that test-discovery regression are applied to the fresh
checkout before repeating the full gates. No package API, Runtime or CI routing
changes. The CI engineering README documents the restored cold-check contract.

## Retained behavior and plugin powers

Every baseline B/P ID is reconciled below. The original ledger supplies the
public/source map; these current owners and regression families are exercised
through source and built packages by the complete gates. Relevant ownership
remains in Core schema/query, RuntimePipeline/enforcement/transactions,
MasterAuthority, FrameworkApplication/CommandGraph, optional product engines
and their adapter/transport implementations. No product vocabulary enters Core.

| ID    | Contract owner            | Current disposition                                                                                            | Regression evidence                                          |
| ----- | ------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| B-001 | Core schema/query         | Retain                                                                                                         | unit/type, packed/JS, PostgreSQL E2E                         |
| B-002 | Core Runtime              | Retain                                                                                                         | pipeline, Hooks, Access, ACL and validation suites           |
| B-003 | Core Runtime              | Retain                                                                                                         | transaction, nested-write and rollback E2E                   |
| B-004 | Core authority            | Retain                                                                                                         | Master type/runtime tests and transport E2E                  |
| B-005 | Core/application          | Retain                                                                                                         | packed REST, GraphQL, relation-filter and Soft Delete JS E2E |
| B-006 | Core + Typegen            | Retain                                                                                                         | type tests, language-service tests, Typegen fixtures         |
| B-007 | Core + transports         | Retain                                                                                                         | direct/REST/GraphQL parity E2E                               |
| B-008 | Core plugin graph         | Retain within one active graph; D-001 limits hosting                                                           | graph, lifecycle and conformance suites                      |
| B-009 | Core application          | D-001 delivered: one initialized owner per JavaScript realm; concurrent requests and isolated workers retained | concurrency, isolation and foreign-application E2E           |
| B-010 | Core kernel               | Retain                                                                                                         | `yarn constraints`, import/public API tests                  |
| B-011 | Official engines          | Retain                                                                                                         | conformance and performance suites                           |
| B-012 | Official plugins          | Retain except approved D-001                                                                                   | package public API, packed and E2E suites                    |
| P-001 | Core declaration host     | Retain                                                                                                         | schema declaration, pg-vector, Password Auth tests           |
| P-002 | Core declaration host     | Retain                                                                                                         | option type/runtime tests and Typegen fixtures               |
| P-003 | Core declaration host     | Retained additive behavior; R-008 removed in 3005                                                              | schema patch, Soft Delete and plugin-kit tests               |
| P-004 | Core schema               | Retain                                                                                                         | field-kind, codec, PostgreSQL and GraphQL tests              |
| P-005 | Core application surfaces | Retained mutations; R-010 removed in 3005                                                                      | type, packed and PostgreSQL E2E                              |
| P-006 | Core operations           | Retained application operations; R-010 removed in 3005                                                         | operation unit/type and transport E2E                        |
| P-007 | Core schema mutations     | Retained; canonical graph delivered                                                                            | schema-mutation conformance and transport E2E                |
| P-008 | Core private storage      | Retain                                                                                                         | private-storage and Password Auth E2E                        |
| P-009 | Core lifecycle            | Retain                                                                                                         | lifecycle and failure-cleanup tests                          |
| P-010 | Core plugin graph         | Retain within one active application                                                                           | graph and conformance suites                                 |
| P-011 | Core capability host      | Retain                                                                                                         | capability host, ownership, instance and lifecycle tests     |
| P-012 | Core Runtime              | Retain                                                                                                         | behavior composition and product suites                      |
| P-013 | Core Runtime              | Retain                                                                                                         | enforcement monotonicity and product E2E                     |
| P-014 | Core Runtime              | Retained consumed protocols/privilege; R-009 removed in 3004                                                   | observer/diagnostic tests                                    |
| P-015 | Core persistence          | Retain                                                                                                         | persistence rewrite and Soft Delete E2E                      |
| P-016 | Core adapter bridge       | Retain                                                                                                         | adapter bridge, migration and PostgreSQL tests               |
| P-017 | Core transport            | Retained; derived from canonical graph                                                                         | transport planning and E2E                                   |
| P-018 | Core/plugin-kit events    | Retain                                                                                                         | event ordering/type and PostgreSQL E2E                       |
| P-019 | Core Typegen              | Retain                                                                                                         | Typegen reference, generator and plugin type tests           |
| P-020 | Core authority            | Retain                                                                                                         | audit failure/inheritance E2E                                |
| P-021 | Core policy               | Retain                                                                                                         | subject, ACL and cross-application tests                     |
| P-022 | Core diagnostics          | Retain                                                                                                         | privilege policy, diagnostics and conformance tests          |
| P-023 | Core application          | Retained; Typegen descriptive inspection narrowed only by D-005                                                | setup/lifecycle and package integration tests                |

## Named protocol reconciliation

All 39 baseline IDs are accounted for: 36 still have production declarations.
The removed three are exactly executor, generic observer and compiler
substitution. Direct Core execution/compilation and product observation remain.
Command-facing public projections consume one private graph; they do not
register or own parallel declarations.

| ID    | Protocol                                              | Current production declaration / disposition                                        | Regression evidence               |
| ----- | ----------------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------- |
| C-001 | `ultimabase.access.contributions`                     | `packages/access-plugin/src/contributions.ts`                                       | Access conformance                |
| C-002 | `ultimabase.access.diagnostics-observer`              | `packages/access-plugin/src/runtime/diagnostics.ts`                                 | Access diagnostics                |
| C-003 | `ultimabase.acl-change-events`                        | `packages/acl-permissions-plugin/src/acl-events.ts`                                 | ACL events E2E                    |
| C-004 | `ultimabase.application-operation-transport-planning` | `packages/core/src/runtime/application/application-operation-transport-planning.ts` | operation transport planning      |
| C-005 | `ultimabase.application-request-execution`            | `packages/core/src/runtime/application/application-request-execution.ts`            | application request boundary      |
| C-006 | `ultimabase.application-schema-mutation-surface`      | `packages/core/src/runtime/application/application-schema-mutation-surface.ts`      | mutation surface tests            |
| C-007 | `ultimabase.database-adapter`                         | `packages/core/src/runtime/database/contracts.ts`                                   | adapter and PostgreSQL suites     |
| C-008 | `ultimabase.graphql.application`                      | `packages/graphql-plugin/src/application.ts`                                        | networkless/Yoga suites           |
| C-009 | `ultimabase.graphql.http-endpoint`                    | `packages/graphql-http/src/index.ts`                                                | explorer and endpoint tests       |
| C-010 | `ultimabase.graphql.schemas`                          | `packages/graphql-plugin/src/schema-contributions.ts`                               | schema composition                |
| C-011 | `ultimabase.hook-diagnostics-observer`                | `packages/hooks-plugin/src/runtime/diagnostics.ts`                                  | Hooks diagnostics                 |
| C-012 | `ultimabase.hooks.contributions`                      | `packages/hooks-plugin/src/contributions.ts`                                        | Hooks conformance                 |
| C-013 | `ultimabase.hooks.event-consumers`                    | `packages/hooks-plugin/src/runtime/events.ts`                                       | Hooks event tests                 |
| C-014 | `ultimabase.http.application`                         | `packages/http-plugin/src/application-capability.ts`                                | HTTP/Hono lifecycle               |
| C-015 | `ultimabase.http.browser-policy`                      | `packages/http-plugin/src/browser-policy-capability.ts`                             | browser policy tests              |
| C-016 | `ultimabase.http.context-resolvers`                   | `packages/http-plugin/src/context.ts`                                               | HTTP context/auth E2E             |
| C-017 | `ultimabase.http.endpoints`                           | `packages/http-plugin/src/endpoints.ts`                                             | endpoint composition              |
| C-018 | `ultimabase.operation-transport-bindings`             | `packages/core/src/runtime/plugin-operations/capabilities.ts`                       | REST/GraphQL operation E2E        |
| C-019 | `ultimabase.persistence-plan-rewriters`               | `packages/core/src/runtime/persistence/capabilities.ts`                             | rewrite and Soft Delete E2E       |
| C-020 | `ultimabase.plugin-operation-handlers`                | `packages/core/src/runtime/plugin-operations/capabilities.ts`                       | operation runtime tests           |
| C-021 | `ultimabase.plugin-schema-mutation-handlers`          | `packages/core/src/runtime/schema-mutations/capabilities.ts`                        | mutation runtime tests            |
| C-022 | `ultimabase.postgres-connection`                      | `packages/postgres-plugin/src/connection/contracts.ts`                              | connection lifecycle              |
| C-023 | `ultimabase.postgres-migration-contribution`          | `packages/postgres-plugin/src/adapter-capabilities.ts`                              | migration bridge tests            |
| C-024 | `ultimabase.postgres-physical-schema-contribution`    | `packages/postgres-plugin/src/adapter-capabilities.ts`                              | pg-vector/physical schema tests   |
| C-025 | `ultimabase.postgres-raw-adapter`                     | `packages/postgres-plugin/src/adapter-capabilities.ts`                              | raw adapter tests                 |
| C-026 | `ultimabase.postgres-schema-preparation`              | `packages/postgres-plugin/src/schema-preparation-capability.ts`                     | preparation/synchronization tests |
| C-027 | `ultimabase.request-subject.principal-resolver`       | `packages/core/src/access/subject/contracts.ts`                                     | subject and Auth E2E              |
| C-028 | `ultimabase.request-subject.reference-cleanup`        | `packages/core/src/access/subject/reference-cleanup.ts`                             | reference cleanup E2E             |
| C-029 | `ultimabase.request-subject.role-resolver`            | `packages/core/src/access/subject/contracts.ts`                                     | Roles/ACL E2E                     |
| C-030 | `ultimabase.rest.route-graph`                         | `packages/rest-plugin/src/routes.ts`                                                | route graph tests                 |
| C-031 | `ultimabase.role-events`                              | `packages/roles-plugin/src/role-events.ts`                                          | role event tests                  |
| C-032 | `ultimabase.runtime-behaviors`                        | `packages/core/src/runtime/capabilities.ts`                                         | behavior pipeline suites          |
| C-033 | `ultimabase.runtime-constraints`                      | `packages/core/src/runtime/capabilities.ts`                                         | monotonic enforcement suites      |
| C-034 | `ultimabase.runtime-executor`                         | R-004: removed token; direct Core executor remains                                  | Runtime capability suites         |
| C-035 | `ultimabase.runtime-interceptors`                     | `packages/core/src/runtime/capabilities.ts`                                         | interceptor suites                |
| C-036 | `ultimabase.runtime-observers`                        | R-009: removed generic token; C-002/C-011/C-013 retain product observation          | observer suites                   |
| C-037 | `ultimabase.schema-compiler`                          | R-003: removed token; canonical Core compilation remains                            | compiler IR suites                |
| C-038 | `ultimabase.schema-mutation-transport-bindings`       | `packages/core/src/runtime/schema-mutations/transport-capabilities.ts`              | mutation transport suites         |
| C-039 | `ultimabase.typegen-emitter`                          | `packages/core/src/plugins/capability-token.ts`                                     | Typegen plugin/lifecycle tests    |

## Approved differences

No additional product removal is authorized by this audit. The exact exceptions
remain explicit rather than being retroactively classified as unused.

| ID    | Audited difference and retained boundary                                                                                                                                                                                             |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D-001 | ADR-0258: one initialized owner per realm, no shared multi-application Hono hosting. Concurrent requests and isolated workers remain. ADR-0260 explicitly approves the minimal safe HTTP dispatch replacement.                       |
| D-002 | ADR-0259 authorizes exactly R-001–R-010 below, including internalizing actual performance measurements instead of dropping them.                                                                                                     |
| D-003 | ADR-0259/0261: one private canonical graph; pure compilation precedes exact handler/codec materialization and setup. Invalid bindings fail before setup. No public graph registrar is introduced.                                    |
| D-004 | Manual Typegen augmentation and extra plugin outputs are removed by R-006/R-007. Derived declarations and consumed nominal references remain.                                                                                        |
| D-005 | Separately approved ADR-0262: inspection drops executable snapshots/nominal operation tokens and schema constructors. Direct authoring/execution, descriptive layout, owners, alias order, generated output and fingerprints remain. |

| ID    | Removed mechanism                                    | Retained need                                                               |
| ----- | ---------------------------------------------------- | --------------------------------------------------------------------------- |
| R-001 | Generic capability decoration                        | Explicit provider composition and ordered middleware                        |
| R-002 | Generic capability replacement                       | Deterministic providers and conflict rejection                              |
| R-003 | Schema compiler replacement                          | Canonical compilation, additive contributions, provenance and integrity     |
| R-004 | Runtime replacement and public RuntimeCostProbe APIs | Canonical execution and equivalent internal counters                        |
| R-005 | Query extension registrar                            | Immutable Query, filters and ordinary reusable functions                    |
| R-006 | Manual Typegen main-output contributions             | Graph-derived declarations and consumed references                          |
| R-007 | Plugin-emitted Typegen side files                    | Deterministic declarations/fingerprint and explicit build writer utilities  |
| R-008 | Destructive schema patches                           | Additive fields/indexes/constraints/options and duplicate rejection         |
| R-009 | Generic Core Runtime observers                       | runtime:observe and product-owned Hooks/Access events/diagnostics           |
| R-010 | Arbitrary schema/model operation commands            | Application operations, AppUser auth methods and real Soft Delete mutations |

## Size and architectural shape

Counts use `yarn measure:simplification` with the baseline definitions.
Physical lines and exported symbols are indicators, not a complexity score.

| Measure                         | Baseline | Checkpoint |                   Delta |
| ------------------------------- | -------: | ---------: | ----------------------: |
| Production TypeScript lines     |  134,104 |    127,883 |         -6,221 (-4.64%) |
| Core TypeScript lines           |   73,748 |     68,780 |         -4,968 (-6.74%) |
| Production files                |      706 |        704 |                      -2 |
| Test/support TypeScript lines   |  131,314 |    130,662 |           -652 (-0.50%) |
| Test/support TypeScript files   |      689 |        708 |                     +19 |
| Tooling TypeScript lines        |    2,121 |      2,120 |                      -1 |
| Core files                      |      341 |        339 |                      -2 |
| Core share of production        |   54.99% |     53.78% | -1.21 percentage points |
| Public export names             |    1,832 |      1,726 |       -106 net (-5.79%) |
| Entry declaration bytes         |  902,767 |    858,980 |        -43,787 (-4.85%) |
| Ordinary defineCapability calls |       38 |         35 |                      -3 |
| Named baseline protocols        |       39 |         36 |   -3 approved protocols |

Both used command kinds, all four binding protocols and the separate policy,
persistence and transport trust boundaries remain. Compilation, attributed
implementation binding, envelope preparation and inert projections share the
same facts. Derived public views retain real consumers and do not register
another set of declarations. Four old Runtime handler/transport stores and
repeated planner/GraphQL correspondence validation are removed. Product codecs
and semantics remain owned by the plugins.

The initial directional targets of roughly 60,000 Core lines and 110,000
production lines are not reached at this checkpoint. Those targets never
authorize removing used behavior. The later plugin wave may find further safe
reductions; its outcome is not assumed or implemented here.

### Reproducible source fan-out

Exact word searches over tracked, non-test, non-generated production TypeScript
were recomputed at both revisions. These narrow counts differ from the initial
broader product-name/documentation survey and must not be substituted for it.

| Symbol search                                        | Baseline files | Checkpoint files |
| ---------------------------------------------------- | -------------: | ---------------: |
| passwordAuthOperations                               |              8 |                8 |
| softDeleteMutation / restoreMutation / purgeMutation |              3 |                3 |
| vectorField                                          |              2 |                2 |
| PluginOperationDefinition                            |             21 |               20 |
| PluginSchemaMutationDefinition                       |             15 |               15 |

Direct product fan-out is largely unchanged. The proven reduction concerns
unused kernel powers and repeated ownership/projection machinery. No percentage
reduction in overall cognitive complexity is claimed.

## Baseline for the 16 later plugin audits

These existing packages were inspected through README contracts, source layout
and measurement output. The areas below are questions for a later bounded
audit. A package may need no safe change. No plugin issue is inspected or
started; no new feature, API, removal or shared abstraction is authorized here.

| Issue | Package                              | Production files / lines | Exports / declaration bytes | Later audit area                                                                                                              |
| ----- | ------------------------------------ | -----------------------: | --------------------------: | ----------------------------------------------------------------------------------------------------------------------------- |
| 3015  | `@ultimabase/access-plugin`          |               29 / 5,227 |                 79 / 36,909 | Policy target compilation and repeated field walks; preserve deny-only narrowing and diagnostics.                             |
| 3016  | `@ultimabase/hooks-plugin`           |               33 / 5,620 |                102 / 47,914 | Input traversal and callback context assembly; preserve order, attribution, rollback and post-commit delivery.                |
| 3017  | `@ultimabase/validation-plugin`      |                  7 / 787 |                   9 / 4,390 | Operation/embedded-field traversal; preserve one final Standard Schema pass and Core structural validation.                   |
| 3018  | `@ultimabase/roles-plugin`           |               12 / 2,397 |                 40 / 18,614 | Membership, hierarchy and deletion query preparation; preserve audited authority and cleanup.                                 |
| 3019  | `@ultimabase/acl-permissions-plugin` |               19 / 3,725 |                 42 / 19,465 | Large plugin orchestration and repeated item/subject preparation; preserve independent monotonic enforcement.                 |
| 3020  | `@ultimabase/password-auth-plugin`   |               21 / 3,329 |                 32 / 15,967 | Operation/method/REST/GraphQL metadata assembly; preserve credential privacy, sessions and schema-derived sign-up input.      |
| 3021  | `@ultimabase/soft-delete-plugin`     |                  8 / 788 |                   5 / 3,473 | Explicit/replacement/administration configuration; preserve current visibility and Master-only restore/purge.                 |
| 3022  | `@ultimabase/postgres-plugin`        |              65 / 10,891 |                 39 / 15,475 | Schema/field metadata reads across compilation and persistence; preserve atomicity, locks, constraints and driver boundaries. |
| 3023  | `@ultimabase/pg-vector-plugin`       |                  1 / 246 |                  11 / 4,200 | Already one small module; establish a concrete reduction before changing it.                                                  |
| 3024  | `@ultimabase/http-plugin`            |               14 / 2,517 |                 64 / 19,260 | Request/route composition after single-owner migration; preserve original headers, credentials, CORS and safe errors.         |
| 3025  | `@ultimabase/server-hono-plugin`     |                  5 / 495 |                   6 / 3,566 | Already simplified owner/listener forwarding; verify cleanup before proposing further reduction.                              |
| 3026  | `@ultimabase/rest-plugin`            |               27 / 4,955 |                 45 / 20,685 | Field/error codec reuse across native and plugin routes; preserve v1 wire behavior and narrow Runtime entry.                  |
| 3027  | `@ultimabase/graphql-plugin`         |               52 / 8,710 |                 33 / 11,903 | Field/filter metadata traversal and execution adapters; preserve schema shape, limits, cursors and network independence.      |
| 3028  | `@ultimabase/graphql-yoga-plugin`    |                  8 / 815 |                   4 / 2,693 | Body/media/error adaptation; preserve limits, cancellation and HTTP ownership.                                                |
| 3029  | `@ultimabase/graphiql-plugin`        |                  4 / 280 |                   5 / 2,626 | Small endpoint/options/page assembly; retain GraphiQL-specific browser protections.                                           |
| 3030  | `@ultimabase/apollo-sandbox-plugin`  |                  4 / 293 |                   5 / 2,730 | Small endpoint/options/page assembly; preserve Sandbox CSP, URLs and credential restrictions.                                 |

## Verification results

Validation runs from the fresh checkout with normal dependency installation.
No thresholds, exclusions, configured retries or test timeouts are changed.
Overlapping heavy gates exceeded a 5-second limit in two built checks and a
20-second limit in the Typegen and PostgreSQL autocomplete coverage checks.
The complete coverage rerun passes with the gates run successively. The built
REST generated-declaration check still exceeded 5 seconds with automatic worker
selection. Built E2E and ordinary tests are therefore measured with
`--maxWorkers=2`, matching the transversal CI runner; no suite is removed.
Both complete bounded-worker runs pass.

- Corrected full `yarn typecheck --force`: passes in 65.44 seconds. This forces
  all projects to compile; it is not comparable with a warm incremental run.
- `yarn build`: passes in 38.588 seconds, including attw and publint.
- `yarn lint`, `yarn constraints` and `yarn format:check`: pass. Existing
  line-budget warnings remain; no baseline increases.
- `yarn website:validate`: 17 files / 66 content and snippet tests pass.
- Full coverage: 608 files / 2,777 tests pass in 418.88 seconds, with no
  TypeScript errors.
- Built/packed and PostgreSQL E2E with two workers: 97 files / 381 tests pass
  in 118.97 seconds.
- Website build and website typecheck: pass. Browser/accessibility tests:
  8 files / 56 tests pass in 67.48 seconds.
- `yarn test --maxWorkers=2`: 534 files / 2,536 tests pass in 152.77 seconds,
  with no TypeScript errors.

The 14 public pages changed during issues 3001–3013 are included in the site
checks: application lifecycle, Master authority, Typegen, test setup,
troubleshooting, the four plugin-authoring pages, HTTP, Hono, GraphQL, the
package index and roadmap. Issue 3014 changes only root compiler references,
a repository regression and engineering records. Package APIs, installation,
generated project behavior and public examples retain their existing contract;
no new package README or public website edit is required for this checkpoint.

### Coverage location comparison

The final clean-checkout report is compared with the successful post-cleanup
3013 report. All 704 production files have identical coverage maps after
normalizing the checkout prefix. The comparison checks covered/uncovered status
at every statement, named function, branch arm and statement-derived line.
No file, map or covered location disappears; no threshold or exclusion changes.

| Metric      | Locations compared | Covered in both | Percentage |
| ----------- | -----------------: | --------------: | ---------: |
| Statements  |             27,580 |          24,761 |     89.77% |
| Functions   |              5,449 |           5,192 |     95.28% |
| Branch arms |             18,493 |          15,356 |     83.03% |
| Lines       |             26,598 |          24,042 |     90.39% |

Issue 3013 separately compares every retained location before and after its
cleanup. These are precise comparisons around that cleanup and this checkpoint;
no original full-milestone coverage percentage was captured in issue 3001, so
no global coverage improvement over the original baseline is claimed.
The reproducible maps, comparison script and result are retained locally under
`/tmp/ultimabase-3013-coverage-after`, `/tmp/ultimabase-3014-coverage`,
`/tmp/ultimabase-3014-compare-coverage.py` and
`/tmp/ultimabase-3014-coverage-comparison.json`.

### Runtime and timing limits

`yarn measure:runtime-baseline` uses the original deterministic adapter and
20 sequential lifetimes, with garbage collection before each sample. It ran
after the validation jobs, on the same shared host as the original observations.

| Measurement              | Original baseline | Checkpoint median |
| ------------------------ | ----------------: | ----------------: |
| Startup                  |          1.706 ms |       1.634346 ms |
| One in-memory read       |          0.422 ms |       0.414128 ms |
| One in-memory mutation   |          0.502 ms |       0.509400 ms |
| Heap before construction |   9,088,640 bytes |   8,954,896 bytes |
| Heap after startup       |  10,133,984 bytes |   9,980,544 bytes |
| Heap after requests      |  10,320,648 bytes |  10,177,216 bytes |

The deterministic performance checks retain one Runtime assembly, zero optional
behavior/enforcement bundles, stages and calls without product plugins, one
read, one prepared/executed mutation and one transaction/commit. Hooks-only,
Access-only and combined scenarios still verify their actual work; a deliberately
inserted neutral stage is still rejected by the internal probe.

Elapsed times and heap samples do not establish a throughput improvement. The
original 90.16-second ordinary test run used automatic workers; the checkpoint
uses two and takes 152.77 seconds. The 26.47-second original typecheck was not a
forced rebuild; the checkpoint forces all projects and takes 65.44 seconds.
Package builds remain close (37.29 versus 38.588 seconds). The complete coverage
run here takes 418.88 seconds, versus 416.71 seconds at the 3013 audit. These are
local observations with different cache/load conditions, not a hosted CI gain.

No hosted CI was launched because no push is authorized. The historical
[baseline run 35508096382](https://github.com/MrEkinox/ultimadatabase/actions/runs/35508096382)
remains the only recorded remote comparison: 17m26 workflow, 2m15 build and
14m39 coverage. No new hosted duration or overall complexity percentage is claimed.

## Final audit and handoff

The correction loop is complete: cold compilation, removal/public surface
reconciliation, all retained coverage locations, dependency checks, complete
source/built/PostgreSQL gates and public site checks pass. No unresolved product
or architecture finding remains. The local automatic-worker timeout is recorded
above; the complete bounded run passes without changing the test contract.
The root compiler reference is the only configuration correction in this issue.
Production code and public exports do not change.

Evidence is retained in `/tmp/ultimabase-3014-*.log`, the three test JSON reports,
`/tmp/ultimabase-3014-after.json`, `/tmp/ultimabase-3014-fanout.json`, and
`/tmp/ultimabase-3014-runtime-quiet.json`. The detached validation checkout is
`/private/tmp/ultimabase-3014-checkpoint`. Failed installation and contention
attempts have separate logs; they are not presented as successful gates.

Issue 3014 is complete. Commit it separately, then stop. Milestone 30 stays open;
issue 3015 and all plugin-local implementation require a later explicit user
request. No new feature or push is authorized.
