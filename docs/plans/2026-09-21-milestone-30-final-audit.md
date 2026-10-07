# Milestone 30 — final simplification and parity audit

- Recorded: 2026-09-21
- Status: completed — stop after issue 3034; no later work or push authorized
- Original baseline: `5806d87a879df0db8265579737c83111eb6030f9`
- Core checkpoint: `23b75027`; final implementation and website: `0e199514`
- [Baseline](2026-09-20-architecture-simplification-baseline.md),
  [Core checkpoint](2026-09-21-core-kernel-simplification-checkpoint.md),
  [contract matrix](2026-09-20-architecture-contract-matrix.md),
  [removal history](../../HISTORIQUE_SUPPRESSIONS.md).

## Result and scope

Issues 3001–3034 are complete. The original 3014 stop was observed; the user's
later authorization covered the 16 plugin audits, three website reviews and this
final gate. Each issue has its own local commit and correction/re-audit record.
The plugin wave makes no new public framework contract or capability removal.
Core, shared, plugin-kit, testing and Typegen production sources are unchanged
from the checkpoint. Fourteen plugins have smaller internal implementations;
Vector and Yoga retain their implementation because no safe reduction justified
another abstraction or a weaker contract.

The complete preservation ledger still contains 89 distinct IDs: 12 behaviors,
23 authoring powers, 39 named protocols, ten approved removals and five explicit
behavior differences. All 36 retained protocols still have their production
declarations. The three absent tokens are precisely the approved generic
Runtime replacement, observer and compiler replacement protocols. Negative tests
and internal performance probes remain; their names are not public escape hatches.
No suspended ACL or Soft Delete feature was resumed. The user's editor change
and suspended stash were preserved.

## Measured size

Counts retain issue 3001's definitions: physical TypeScript lines under package
production sources, separate test/support and tooling lines, and exports from
built package roots. Documentation additions are not production simplification.
Final declaration sizes are measured immediately after the canonical package
build, not after a fixture's TypeScript emission has rewritten a declaration.

| Measurement             | Original baseline | Core checkpoint |   Final | Baseline-to-final delta |
| ----------------------- | ----------------: | --------------: | ------: | ----------------------: |
| Production lines        |           134,104 |         127,883 | 127,093 |                  -7,011 |
| Production files        |               706 |             704 |     702 |                      -4 |
| Core lines              |            73,748 |          68,780 |  68,780 |                  -4,968 |
| Core files              |               341 |             339 |     339 |                      -2 |
| Test/support lines      |           131,314 |         130,662 | 130,820 |                    -494 |
| Test/support files      |               689 |             708 |     707 |                     +18 |
| Tooling lines           |             2,121 |           2,120 |   2,119 |                      -2 |
| Public exports          |             1,832 |           1,726 |   1,726 |                    -106 |
| Entry declaration bytes |           902,767 |         858,980 | 858,903 |                 -43,864 |

The full milestone removes 7,011 production lines (5.23%), including 4,968 Core
lines (6.74%). The plugin wave removes another 790 physical lines after 3014, including three
lines from the final formatting correction. Its 16 public
export-name sets are unchanged; all 23 package export-name sets also match the
checkpoint. Soft Delete removes equivalent redundant Readonly wrappers, while
Vector changes a JSDoc; neither changes its accepted type contract. Canonical
Vector declaration sizes are 4,200 then 4,193 bytes. The 4,103-byte file observed
after some tests is plain tsc output, not the comparable bundled artifact.

Core's share is 54.99% originally, 53.78% at 3014 and 54.12% finally: later plugin
reductions change the denominator, not Core's size. The approximate 60,000 Core /
110,000 total-line directional targets were not reached. Retained execution,
authority, policy, transaction, codec and lifecycle boundaries justify keeping
that code; no feature or test was removed to hit a target.

### Each existing plugin

| Issue | Package                              | Checkpoint lines | Final lines | Delta | Share before / after | Final exports |
| ----- | ------------------------------------ | ---------------: | ----------: | ----: | -------------------: | ------------: |
| 3015  | `@ultimabase/access-plugin`          |            5,227 |       5,185 |   -42 |        4.09% / 4.08% |            79 |
| 3016  | `@ultimabase/hooks-plugin`           |            5,620 |       5,528 |   -92 |        4.39% / 4.35% |           102 |
| 3017  | `@ultimabase/validation-plugin`      |              787 |         757 |   -30 |        0.62% / 0.60% |             9 |
| 3018  | `@ultimabase/roles-plugin`           |            2,397 |       2,313 |   -84 |        1.87% / 1.82% |            40 |
| 3019  | `@ultimabase/acl-permissions-plugin` |            3,725 |       3,581 |  -144 |        2.91% / 2.82% |            42 |
| 3020  | `@ultimabase/password-auth-plugin`   |            3,329 |       3,234 |   -95 |        2.60% / 2.54% |            32 |
| 3021  | `@ultimabase/soft-delete-plugin`     |              788 |         738 |   -50 |        0.62% / 0.58% |             5 |
| 3022  | `@ultimabase/postgres-plugin`        |           10,891 |      10,794 |   -97 |        8.52% / 8.49% |            39 |
| 3023  | `@ultimabase/pg-vector-plugin`       |              246 |         246 |    +0 |        0.19% / 0.19% |            11 |
| 3024  | `@ultimabase/http-plugin`            |            2,517 |       2,499 |   -18 |        1.97% / 1.97% |            64 |
| 3025  | `@ultimabase/server-hono-plugin`     |              495 |         492 |    -3 |        0.39% / 0.39% |             6 |
| 3026  | `@ultimabase/rest-plugin`            |            4,955 |       4,875 |   -80 |        3.87% / 3.84% |            45 |
| 3027  | `@ultimabase/graphql-plugin`         |            8,710 |       8,659 |   -51 |        6.81% / 6.81% |            33 |
| 3028  | `@ultimabase/graphql-yoga-plugin`    |              815 |         815 |    +0 |        0.64% / 0.64% |             4 |
| 3029  | `@ultimabase/graphiql-plugin`        |              280 |         278 |    -2 |        0.22% / 0.22% |             5 |
| 3030  | `@ultimabase/apollo-sandbox-plugin`  |              293 |         291 |    -2 |        0.23% / 0.23% |             5 |

Shares use all package production lines as their denominator. The supporting
`graphql-http` package remains 82 lines and three exports; its boundary was
included in the HTTP and Yoga audits.

## Architecture and retained contracts

| Structural indicator                     | Original baseline | Core checkpoint | Final |
| ---------------------------------------- | ----------------: | --------------: | ----: |
| Ordinary defineCapability calls          |                38 |              35 |    35 |
| Named retained protocols                 |                39 |              36 |    36 |
| Used command kinds                       |                 2 |               2 |     2 |
| Used handler/transport binding protocols |                 4 |               4 |     4 |

The baseline operation and schema-mutation journeys had separate compiled
registries, handler/transport stores and repeated correspondence validation.
The checkpoint removed four Runtime stores and made compilation, attributed
binding, envelope preparation and inert projections share canonical facts.
The final plugin wave keeps that shape. Public definitions, actual bindings,
transport codecs and distinct operation/mutation execution semantics still
have concrete consumers; their survival is deliberate. No new cross-plugin
abstraction is introduced to shrink plugin implementations.

The canonical private command graph remains the single owner of compiled facts
and attributed implementations. Application operations and schema mutations are
both retained, with their real authority and result differences. TypeScript,
Typegen, REST and GraphQL derive their views from that graph. Logical operations
remain separate from physical persistence plans and protected constraints.

The plugin audits remove discarded work, redundant state, relay functions,
repeated metadata and superseded result adaptations. Access and ACL still only
narrow policy; authentication and roles grant nothing by themselves. Hooks retain
attribution, order, rollback and post-commit behavior; Validation keeps one final
Standard Schema pass. PostgreSQL retains locks, atomic batches, relationship
maintenance and error boundaries. Transports retain exact headers, application
identity, credentials, codecs, errors, cancellation and safe post-disposal rejection.
Core still imports no concrete policy, auth, database or transport provider.

The following dispositions and regression families were rechecked against final
source and the complete source/built gates. Public surfaces and source consumers
remain mapped in the original matrix; website ownership and source links were
reconciled by 3031–3033. No stable ID is deleted or silently reclassified.

| ID    | Owner                     | Final disposition                                                                                              | Regression family                                            |
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

### Named protocols

Paths resolve under the final repository. Retained production declarations and
conformance/boundary suites preserve their public cardinality, version, ownership
and lifecycle. Removed protocols retain their direct product counterpart.

| ID    | Protocol                                              | Final declaration or approved removal                                               |
| ----- | ----------------------------------------------------- | ----------------------------------------------------------------------------------- |
| C-001 | `ultimabase.access.contributions`                     | `packages/access-plugin/src/contributions.ts`                                       |
| C-002 | `ultimabase.access.diagnostics-observer`              | `packages/access-plugin/src/runtime/diagnostics.ts`                                 |
| C-003 | `ultimabase.acl-change-events`                        | `packages/acl-permissions-plugin/src/acl-events.ts`                                 |
| C-004 | `ultimabase.application-operation-transport-planning` | `packages/core/src/runtime/application/application-operation-transport-planning.ts` |
| C-005 | `ultimabase.application-request-execution`            | `packages/core/src/runtime/application/application-request-execution.ts`            |
| C-006 | `ultimabase.application-schema-mutation-surface`      | `packages/core/src/runtime/application/application-schema-mutation-surface.ts`      |
| C-007 | `ultimabase.database-adapter`                         | `packages/core/src/runtime/database/contracts.ts`                                   |
| C-008 | `ultimabase.graphql.application`                      | `packages/graphql-plugin/src/application.ts`                                        |
| C-009 | `ultimabase.graphql.http-endpoint`                    | `packages/graphql-http/src/index.ts`                                                |
| C-010 | `ultimabase.graphql.schemas`                          | `packages/graphql-plugin/src/schema-contributions.ts`                               |
| C-011 | `ultimabase.hook-diagnostics-observer`                | `packages/hooks-plugin/src/runtime/diagnostics.ts`                                  |
| C-012 | `ultimabase.hooks.contributions`                      | `packages/hooks-plugin/src/contributions.ts`                                        |
| C-013 | `ultimabase.hooks.event-consumers`                    | `packages/hooks-plugin/src/runtime/events.ts`                                       |
| C-014 | `ultimabase.http.application`                         | `packages/http-plugin/src/application-capability.ts`                                |
| C-015 | `ultimabase.http.browser-policy`                      | `packages/http-plugin/src/browser-policy-capability.ts`                             |
| C-016 | `ultimabase.http.context-resolvers`                   | `packages/http-plugin/src/context.ts`                                               |
| C-017 | `ultimabase.http.endpoints`                           | `packages/http-plugin/src/endpoints.ts`                                             |
| C-018 | `ultimabase.operation-transport-bindings`             | `packages/core/src/runtime/plugin-operations/capabilities.ts`                       |
| C-019 | `ultimabase.persistence-plan-rewriters`               | `packages/core/src/runtime/persistence/capabilities.ts`                             |
| C-020 | `ultimabase.plugin-operation-handlers`                | `packages/core/src/runtime/plugin-operations/capabilities.ts`                       |
| C-021 | `ultimabase.plugin-schema-mutation-handlers`          | `packages/core/src/runtime/schema-mutations/capabilities.ts`                        |
| C-022 | `ultimabase.postgres-connection`                      | `packages/postgres-plugin/src/connection/contracts.ts`                              |
| C-023 | `ultimabase.postgres-migration-contribution`          | `packages/postgres-plugin/src/adapter-capabilities.ts`                              |
| C-024 | `ultimabase.postgres-physical-schema-contribution`    | `packages/postgres-plugin/src/adapter-capabilities.ts`                              |
| C-025 | `ultimabase.postgres-raw-adapter`                     | `packages/postgres-plugin/src/adapter-capabilities.ts`                              |
| C-026 | `ultimabase.postgres-schema-preparation`              | `packages/postgres-plugin/src/schema-preparation-capability.ts`                     |
| C-027 | `ultimabase.request-subject.principal-resolver`       | `packages/core/src/access/subject/contracts.ts`                                     |
| C-028 | `ultimabase.request-subject.reference-cleanup`        | `packages/core/src/access/subject/reference-cleanup.ts`                             |
| C-029 | `ultimabase.request-subject.role-resolver`            | `packages/core/src/access/subject/contracts.ts`                                     |
| C-030 | `ultimabase.rest.route-graph`                         | `packages/rest-plugin/src/routes.ts`                                                |
| C-031 | `ultimabase.role-events`                              | `packages/roles-plugin/src/role-events.ts`                                          |
| C-032 | `ultimabase.runtime-behaviors`                        | `packages/core/src/runtime/capabilities.ts`                                         |
| C-033 | `ultimabase.runtime-constraints`                      | `packages/core/src/runtime/capabilities.ts`                                         |
| C-034 | `ultimabase.runtime-executor`                         | R-004: direct canonical Runtime retained                                            |
| C-035 | `ultimabase.runtime-interceptors`                     | `packages/core/src/runtime/capabilities.ts`                                         |
| C-036 | `ultimabase.runtime-observers`                        | R-009: product observers/events retained                                            |
| C-037 | `ultimabase.schema-compiler`                          | R-003: direct canonical compiler retained                                           |
| C-038 | `ultimabase.schema-mutation-transport-bindings`       | `packages/core/src/runtime/schema-mutations/transport-capabilities.ts`              |
| C-039 | `ultimabase.typegen-emitter`                          | `packages/core/src/plugins/capability-token.ts`                                     |

### Exact approved removals and differences

No additional removal is justified by this audit. Historical ADRs are retained;
D-001–D-005 delimit every intentional baseline-to-final public difference.

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

| ID    | Approved difference and retained boundary                                                                                                                                                                                            |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D-001 | ADR-0258: one initialized owner per realm, no shared multi-application Hono hosting. Concurrent requests and isolated workers remain. ADR-0260 explicitly approves the minimal safe HTTP dispatch replacement.                       |
| D-002 | ADR-0259 authorizes exactly R-001–R-010 above, including internalizing actual performance measurements instead of dropping them.                                                                                                     |
| D-003 | ADR-0259/0261: one private canonical graph; pure compilation precedes exact handler/codec materialization and setup. Invalid bindings fail before setup. No public graph registrar is introduced.                                    |
| D-004 | Manual Typegen augmentation and extra plugin outputs are removed by R-006/R-007. Derived declarations and consumed nominal references remain.                                                                                        |
| D-005 | Separately approved ADR-0262: inspection drops executable snapshots/nominal operation tokens and schema constructors. Direct authoring/execution, descriptive layout, owners, alias order, generated output and fingerprints remain. |

An exact-name scan of 796 active source, example and website files finds none of
24 representative retired APIs/privileges. Packed JavaScript, negative type tests,
manifest rejection, generated-project and public-root suites provide executable
coverage beyond that textual scan. Internal performance fixtures and explicit
negative/historical references are retained intentionally.

## Verification from a clean checkout

`/private/tmp/ultimabase-3034-audit` is a detached checkout at `0e199514`, with
its own node_modules and no copied dist, TypeScript cache or website output.
Installation uses the existing immutable Yarn archive cache and runs normal native
and Fumadocs build scripts. The first install lacked a local cache directory;
pointing YARN_CACHE_FOLDER at the existing immutable cache resolved that setup
error. No production workaround or package change was needed.

All heavy gates run successively. The two-worker test bound matches the 3014
checkpoint and CI's bounded execution; no retries, limits, coverage thresholds,
exclusions or assertions were relaxed.

| Gate                                                       | Wall time | Result |
| ---------------------------------------------------------- | --------: | ------ |
| `yarn constraints`                                         |    0.40 s | Pass   |
| `yarn typecheck`                                           |   65.04 s | Pass   |
| `yarn build`                                               |   40.02 s | Pass   |
| `yarn test --maxWorkers=2`                                 |  178.66 s | Pass   |
| `yarn test:coverage --coverage.reportOnFailure`            |  429.81 s | Pass   |
| `yarn lint`                                                |   95.50 s | Pass   |
| `yarn format:check`                                        |   25.24 s | Pass   |
| `yarn test:pack:built --maxWorkers=2`                      |   27.11 s | Pass   |
| `yarn test:e2e:built --maxWorkers=2`                       |  125.49 s | Pass   |
| `yarn website:validate`                                    |   14.44 s | Pass   |
| `yarn website:build`                                       |   45.66 s | Pass   |
| `yarn tsc -p apps/website/tsconfig.json --noEmit`          |    3.71 s | Pass   |
| `yarn vitest run --project website-browser --maxWorkers=2` |   77.29 s | Pass   |

The ordinary suite passes 2,536 tests across 533 files. Full source coverage,
built/packed PostgreSQL tests and website browser counts are recorded below from
their final reports. Package build also runs attw and publint. The dedicated
archive gate verifies allowed archive contents, declarations, public resolution,
private deep-import rejection and JavaScript execution without Typegen.

- Full source coverage: 2,779 tests in 607 files, all passing; statements 89.93%,
  branches 83.26%, functions 95.42%, lines 90.54%.
- Package archive/API gate: 163 passing checks.
- Complete built E2E, including PostgreSQL Testcontainers: 383 tests in 97 files,
  all passing.
- Website content/source/navigation validation: 66 tests in 17 files, all passing.
- Full website browser suite: 59 tests in eight files, all passing.
- Focused GraphQL source/type checks after the formatting repair: 106 tests in
  21 files, all passing.

These gates overlap; their counts are not added into a distinct-test total.

The documented root `yarn website:typecheck` and `yarn website:lint` commands
also pass. An earlier direct workspace invocation did not find a root-owned compiler; it was not a
failure of the documented root shortcut. The proposed script change was removed
after the clean-checkout evidence; no duplicate tool dependency or new script
is introduced. Final issue changes also repair one GraphQL condition wrapping and update the
public roadmap. After that formatting correction, the canonical emitted JavaScript
(after standard formatting) is identical, focused GraphQL source/type checks pass,
and the package rebuild plus complete built/website gates are repeated. The initial
format failure is retained separately; no source behavior or public API changes.

### Coverage reconciliation

The final coverage map contains the same 702 production files as the complete
3027 reference. All locations in 698 identical maps retain coverage. In the
four explorer maps, 156 relocated statement/function/branch locations map
without loss. The six remaining setup records were checked manually: Apollo
keeps counts 13/2/2 and GraphiQL 15/4/4 while returning the already normalized
public record instead of copying enabled/path into another object. All four files retain identical covered/total counts.
No covered retained location is lost and no production coverage file disappears.

The full coverage run precedes the final three-line condition-formatting repair
in GraphQL's binding compiler. Its canonical emitted JavaScript is identical
after standard formatting (proof retained in format-equivalence.json); focused
GraphQL tests and all built integrations validate the formatted source. This
formatting-only span shift is not an added or removed executable branch.

All prior per-plugin audits preserve retained coverage location by location.
The final map is compared with the complete 3027 map; changed explorer maps are
also reconciled to their 3029/3030 focused audits. No baseline coverage gain is
claimed from deleting unused code or changing denominators. After the validated
formatting repair, package implementation is unchanged; final handoff-only edits
receive formatting, backlog and complete-diff verification.

## Runtime, heap and validation cost

After heavy validation jobs finish, the unchanged deterministic benchmark runs
20 sequential lifetimes, forcing garbage collection before each sample. It uses
one no-product application, one in-memory read, one mutation and full disposal.

| Measurement                      | Original baseline | Core checkpoint | Final median |
| -------------------------------- | ----------------: | --------------: | -----------: |
| Startup (ms)                     |             1.706 |        1.634346 |     1.642313 |
| Read (ms)                        |             0.422 |        0.414128 |     0.415967 |
| Mutation (ms)                    |             0.502 |        0.509400 |     0.503274 |
| Heap before construction (bytes) |         9,088,640 |       8,954,896 |    8,988,248 |
| Heap after startup (bytes)       |        10,133,984 |       9,980,544 |    9,988,744 |
| Heap after requests (bytes)      |        10,320,648 |      10,177,216 |   10,185,416 |

These shared-host samples establish neither a throughput improvement nor a
complexity percentage. Deterministic counters still require one Runtime assembly,
zero optional policy/behavior bundles, stages or calls without their plugins,
one read, one prepared/executed mutation and one transaction/commit. Hooks-only,
Access-only and combined scenarios retain their real work; inserted neutral
stages are still rejected by the internal probe.

Cold typecheck at 3014 was 65.44 s and its package build 38.59 s; ordinary tests
were 152.77 s, coverage 418.88 s and built E2E 118.97 s with two workers. The
original 26.47 s typecheck and 90.16 s test observations used different cache and
worker conditions, so this report does not convert elapsed-time differences into
CI gains. Hosted CI was not run because no push is authorized. The historical
[baseline workflow](https://github.com/MrEkinox/ultimadatabase/actions/runs/35508096382)
remains 17m26, with a 2m15 build and 14m39 coverage; there is no final hosted value.

Exact source fan-out stays 8 files for passwordAuthOperations, 3 for the Soft
Delete command tokens, 2 for vectorField, 20 for PluginOperationDefinition and
15 for PluginSchemaMutationDefinition. The corresponding original counts were
8/3/2/21/15. Reduced internal machinery is demonstrated; an overall percentage
of cognitive complexity is not measured.

## Public website and final handoff

Issues 3031, 3032 and 3033 review 44, 26 and 15 pages respectively, with overlaps.
Their inventories cover the owned Core, authoring, data/security/persistence and
transport journeys. Configuration is safe to load for Typegen; startup/disposal,
required signup fields, transport inputs/outputs, tombstone visibility, plugin
independence, unpublished packages and explorer setup reflect final source.
Literal samples run against PostgreSQL and built exports. Dark/light syntax
contrast and keyboard table scrolling are fixed with browser regressions. The
final website gates recheck source links, navigation, responsive layouts and
accessibility. Remote explorer CDN availability is not claimed.

The remaining stale phrase in the website engineering README now names the
retained schema/model mutations instead of retired Query extensions. A French
history typo is corrected. The only production-source edit in 3034 is the three-line formatting correction;
it changes no executable behavior. The public roadmap records milestone completion.
The plan is archived in place, preserving existing links, and removed from the
active index; CURRENT_PLAN explicitly records completion and the stopping point.
The paused ACL plan and Soft Delete stash remain paused. No later milestone is
created or started and nothing is pushed.

Documentation impact: both. The final engineering report, ledger, issue and plan
record the final evidence; public website reconciliation is delivered in 3031–3033.
The public roadmap now records completion without starting another objective.
No public API, option, example behavior, error, export or integration changes.

### Dedicated plugin and website commits

Counts include all committed files, including tests, README/site content and
engineering audit records. They are separate from production source deltas.

| Issue | Commit     | Added | Removed |  Net |
| ----- | ---------- | ----: | ------: | ---: |
| 3015  | `4d6faa2a` |  +242 |    -107 | +135 |
| 3016  | `bc8aeb06` |  +190 |    -171 |  +19 |
| 3017  | `0f5fe233` |  +112 |     -60 |  +52 |
| 3018  | `e6ba1934` |  +173 |    -146 |  +27 |
| 3019  | `129132a8` |  +127 |    -195 |  -68 |
| 3020  | `72abe7a0` |  +205 |    -142 |  +63 |
| 3021  | `56f88b28` |  +126 |     -97 |  +29 |
| 3022  | `581828e9` |  +154 |    -149 |   +5 |
| 3023  | `32b6dec0` |   +91 |     -20 |  +71 |
| 3024  | `e059251e` |  +141 |     -70 |  +71 |
| 3025  | `c9d79ffc` |  +126 |     -51 |  +75 |
| 3026  | `3aa4f59e` |  +180 |    -182 |   -2 |
| 3027  | `fb0a2a15` |  +161 |    -118 |  +43 |
| 3028  | `d3a910d8` |  +116 |     -20 |  +96 |
| 3029  | `dffcb3e7` |   +86 |     -20 |  +66 |
| 3030  | `267c33c7` |   +75 |     -20 |  +55 |
| 3031  | `6bd024b8` |  +220 |     -70 | +150 |
| 3032  | `60a6d2ce` |  +286 |     -50 | +236 |
| 3033  | `0e199514` |  +337 |     -81 | +256 |

The final 3034 commit count is reported in the user handoff rather than recording
its own unstable hash inside itself. Reproduction evidence is retained under
`/tmp/ultimabase-3034-*`: gate logs and timings, full test reports, source metrics,
export/protocol/removal/fan-out inventories, coverage comparison and runtime sample.
Audit complete: no unresolved finding, unapproved behavior difference or expanded
framework boundary remains. Stop here.
