# Milestone 63 capability reconciliation

Baseline: `3c130475`; product: `3a5874d7` plus editor/type regressions only.

All 89 stable IDs are retained in this ledger. Earlier removals are not
attributed to milestone 63. Source existence is inventory, not behavioral
proof by itself; unit/type/conformance and built/JavaScript/PostgreSQL gates
supply regression evidence. Hover and Typegen limits are explicit in the report.

## B ledger

| ID    | Contract                                                                                                                                                  | Final disposition and evidence                                                                                                       |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| B-001 | Static schemas, fields, immutable Query/models, CRUD, bulk, upsert, nested writes, relations, contextual relation filters, inclusions and virtual results | Retained; complete source/type and built E2E regression families from the historical matrix run against the migrated implementation. |
| B-002 | Mandatory validation, policy, behavior, persistence and result order                                                                                      | Retained; complete source/type and built E2E regression families from the historical matrix run against the migrated implementation. |
| B-003 | One automatic transaction for each mutation and Hook-started database work                                                                                | Retained; complete source/type and built E2E regression families from the historical matrix run against the migrated implementation. |
| B-004 | Anonymous and non-forgeable server-side Master authority                                                                                                  | Retained; complete source/type and built E2E regression families from the historical matrix run against the migrated implementation. |
| B-005 | JavaScript applications execute without Typegen                                                                                                           | Retained; complete source/type and built E2E regression families from the historical matrix run against the migrated implementation. |
| B-006 | Direct TypeScript inference, editor documentation and deterministic generated declarations                                                                | Exact types/completion retained; nested-option JSDoc and update-hover verbosity remain explicit presentation limits.                 |
| B-007 | REST and GraphQL normalize into the same operation/query semantics and Runtime                                                                            | Retained; complete source/type and built E2E regression families from the historical matrix run against the migrated implementation. |
| B-008 | Stable plugin ID plus optional explicit instance; deterministic dependencies and lifecycle cleanup                                                        | Retained; complete source/type and built E2E regression families from the historical matrix run against the migrated implementation. |
| B-009 | Current support for several active applications in one process                                                                                            | Already-delivered one-active-application/isolated-worker model retained (ADR-0258), not historical concurrent hosting.               |
| B-010 | Core stays independent from concrete products and infrastructure                                                                                          | Retained; complete source/type and built E2E regression families from the historical matrix run against the migrated implementation. |
| B-011 | Hooks and Access remain optional and add zero neutral Runtime stages when absent                                                                          | Retained; complete source/type and built E2E regression families from the historical matrix run against the migrated implementation. |
| B-012 | PostgreSQL, HTTP/Hono, REST, GraphQL/Yoga/explorers, ACL, Roles, Validation, Password Auth and Soft Delete retain current outcomes                        | Retained; complete source/type and built E2E regression families from the historical matrix run against the migrated implementation. |

## P ledger

| ID    | Contract                                                                                                           | Final disposition and evidence                                                                                                                      |
| ----- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| P-001 | Declare schemas and field builder methods with `schema:declare`                                                    | Retained through the public Core kernel; Core-native/Plugin Kit community conformance and owning-package regression suites.                         |
| P-002 | Declare namespaced schema and field options                                                                        | Retained through the public Core kernel; Core-native/Plugin Kit community conformance and owning-package regression suites.                         |
| P-003 | Select schemas and apply additive patches with `schema:declare`; destructive patches use `schema:transform`        | Additive selection/patching retained; destructive patches and `schema:transform` were already removed by ADR-0259.                                  |
| P-004 | Add contextual field kinds, codecs and adapter/compiler facts                                                      | Retained through the public Core kernel; Core-native/Plugin Kit community conformance and owning-package regression suites.                         |
| P-005 | Add application-owned schema/model commands with `model:extend`                                                    | Retained through the public Core kernel; Core-native/Plugin Kit community conformance and owning-package regression suites.                         |
| P-006 | Declare application/schema/model operations and handlers with `operation:declare`                                  | Canonical application operations and selected schema mutations retained; arbitrary schema/model operation targets were already removed by ADR-0259. |
| P-007 | Declare selected schema mutations, handlers and surface aliases                                                    | Retained through the public Core kernel; Core-native/Plugin Kit community conformance and owning-package regression suites.                         |
| P-008 | Declare owner-private tables/fields with `storage:private`                                                         | Retained through the public Core kernel; Core-native/Plugin Kit community conformance and owning-package regression suites.                         |
| P-009 | Materialize and dispose application-lifetime capability resources                                                  | Retained through the public Core kernel; Core-native/Plugin Kit community conformance and owning-package regression suites.                         |
| P-010 | Explicit instances, dependencies, peers, nested-plugin flattening and deterministic order                          | Flat use chain; identities/instances/dependencies/peers/lifecycle retained. Nested installation was already removed before this milestone.          |
| P-011 | Define, provide, require and compose versioned declaration/application capabilities                                | Retained through the public Core kernel; Core-native/Plugin Kit community conformance and owning-package regression suites.                         |
| P-012 | Add ordered behavior stages with `runtime:intercept`                                                               | Retained through the public Core kernel; Core-native/Plugin Kit community conformance and owning-package regression suites.                         |
| P-013 | Add deny/narrow-only constraints with `runtime:constrain`                                                          | Retained through the public Core kernel; Core-native/Plugin Kit community conformance and owning-package regression suites.                         |
| P-014 | Observe Runtime activity with `runtime:observe`                                                                    | Retained through the public Core kernel; Core-native/Plugin Kit community conformance and owning-package regression suites.                         |
| P-015 | Rewrite physical persistence plans with `persistence:rewrite` while preserving logical semantics                   | Retained through the public Core kernel; Core-native/Plugin Kit community conformance and owning-package regression suites.                         |
| P-016 | Provide/consume adapter contributions with `adapter:consume`, privileged `adapter:raw`, and `migration:contribute` | Physical contributions and transaction-bound raw access retained; migration powers already removed by ADR-0266.                                     |
| P-017 | Expose routes, operation bindings and schema-mutation bindings with `transport:expose`                             | Retained through the public Core kernel; Core-native/Plugin Kit community conformance and owning-package regression suites.                         |
| P-018 | Publish and consume typed post-commit events with `event:publish`                                                  | Retained through the public Core kernel; Core-native/Plugin Kit community conformance and owning-package regression suites.                         |
| P-019 | Register nominal type references with `typegen:reference`                                                          | Nominal references and deterministic Typegen retained; local receipts supply configured typing. No manual output/parallel registry.                 |
| P-020 | Request audited internal elevation with `authority:elevate`                                                        | Retained through the public Core kernel; Core-native/Plugin Kit community conformance and owning-package regression suites.                         |
| P-021 | Declare principal, role and reference-cleanup protocols without granting access                                    | Retained through the public Core kernel; Core-native/Plugin Kit community conformance and owning-package regression suites.                         |
| P-022 | Inspect manifests, privileges, claims and capability ownership before effects                                      | Retained through the public Core kernel; Core-native/Plugin Kit community conformance and owning-package regression suites.                         |
| P-023 | Read immutable compiled schemas and plugin exports during setup                                                    | Retained through the public Core kernel; Core-native/Plugin Kit community conformance and owning-package regression suites.                         |

## C ledger

| ID    | Contract                                              | Final disposition and evidence                                                                                                                                                      |
| ----- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C-001 | `ultimabase.access.contributions`                     | Retained; [production source](../../../packages/access-plugin/src/contributions.ts), owning-package and generic capability/conformance tests.                                       |
| C-002 | `ultimabase.access.diagnostics-observer`              | Retained; [production source](../../../packages/access-plugin/src/runtime/diagnostics.ts), owning-package and generic capability/conformance tests.                                 |
| C-003 | `ultimabase.acl-change-events`                        | Retained; [production source](../../../packages/acl-permissions-plugin/src/acl-events.ts), owning-package and generic capability/conformance tests.                                 |
| C-004 | `ultimabase.application-operation-transport-planning` | Retained; [production source](../../../packages/core/src/runtime/application/application-operation-transport-planning.ts), owning-package and generic capability/conformance tests. |
| C-005 | `ultimabase.application-request-execution`            | Retained; [production source](../../../packages/core/src/runtime/application/application-request-execution.ts), owning-package and generic capability/conformance tests.            |
| C-006 | `ultimabase.application-schema-mutation-surface`      | Retained; [production source](../../../packages/core/src/runtime/application/application-schema-mutation-surface.ts), owning-package and generic capability/conformance tests.      |
| C-007 | `ultimabase.database-adapter`                         | Retained; [production source](../../../packages/core/src/runtime/database/contracts.ts), owning-package and generic capability/conformance tests.                                   |
| C-008 | `ultimabase.graphql.application`                      | Retained; [production source](../../../packages/graphql-plugin/src/application.ts), owning-package and generic capability/conformance tests.                                        |
| C-009 | `ultimabase.graphql.http-endpoint`                    | Retained; [production source](../../../packages/graphql-http/src/index.ts), owning-package and generic capability/conformance tests.                                                |
| C-010 | `ultimabase.graphql.schemas`                          | Retained; [production source](../../../packages/graphql-plugin/src/schema-contributions.ts), owning-package and generic capability/conformance tests.                               |
| C-011 | `ultimabase.hook-diagnostics-observer`                | Retained; [production source](../../../packages/hooks-plugin/src/runtime/diagnostics.ts), owning-package and generic capability/conformance tests.                                  |
| C-012 | `ultimabase.hooks.contributions`                      | Retained; [production source](../../../packages/hooks-plugin/src/contributions.ts), owning-package and generic capability/conformance tests.                                        |
| C-013 | `ultimabase.hooks.event-consumers`                    | Retained; [production source](../../../packages/hooks-plugin/src/runtime/events.ts), owning-package and generic capability/conformance tests.                                       |
| C-014 | `ultimabase.http.application`                         | Retained; [production source](../../../packages/http-plugin/src/application-capability.ts), owning-package and generic capability/conformance tests.                                |
| C-015 | `ultimabase.http.browser-policy`                      | Retained; [production source](../../../packages/http-plugin/src/browser-policy-capability.ts), owning-package and generic capability/conformance tests.                             |
| C-016 | `ultimabase.http.context-resolvers`                   | Retained; [production source](../../../packages/http-plugin/src/context.ts), owning-package and generic capability/conformance tests.                                               |
| C-017 | `ultimabase.http.endpoints`                           | Retained; [production source](../../../packages/http-plugin/src/endpoints.ts), owning-package and generic capability/conformance tests.                                             |
| C-018 | `ultimabase.operation-transport-bindings`             | Already absent before this milestone: Canonical command graph (ADR-0261/0262/0263).                                                                                                 |
| C-019 | `ultimabase.persistence-plan-rewriters`               | Retained; [production source](../../../packages/core/src/runtime/persistence/capabilities.ts), owning-package and generic capability/conformance tests.                             |
| C-020 | `ultimabase.plugin-operation-handlers`                | Already absent before this milestone: Canonical command graph (ADR-0261/0262/0263).                                                                                                 |
| C-021 | `ultimabase.plugin-schema-mutation-handlers`          | Already absent before this milestone: Canonical command graph (ADR-0261/0262/0263).                                                                                                 |
| C-022 | `ultimabase.postgres-connection`                      | Retained; [production source](../../../packages/postgres-plugin/src/connection/contracts.ts), owning-package and generic capability/conformance tests.                              |
| C-023 | `ultimabase.postgres-migration-contribution`          | Already absent before this milestone: Migration scaffold removed by ADR-0266; physical metadata/raw access retained.                                                                |
| C-024 | `ultimabase.postgres-physical-schema-contribution`    | Retained; [production source](../../../packages/postgres-plugin/src/adapter-capabilities.ts), owning-package and generic capability/conformance tests.                              |
| C-025 | `ultimabase.postgres-raw-adapter`                     | Retained; [production source](../../../packages/postgres-plugin/src/adapter-capabilities.ts), owning-package and generic capability/conformance tests.                              |
| C-026 | `ultimabase.postgres-schema-preparation`              | Already absent before this milestone: Migration marker removed by ADR-0266; prepareSchema/synchronization retained.                                                                 |
| C-027 | `ultimabase.request-subject.principal-resolver`       | Retained; [production source](../../../packages/core/src/access/subject/contracts.ts), owning-package and generic capability/conformance tests.                                     |
| C-028 | `ultimabase.request-subject.reference-cleanup`        | Retained; [production source](../../../packages/core/src/access/subject/reference-cleanup.ts), owning-package and generic capability/conformance tests.                             |
| C-029 | `ultimabase.request-subject.role-resolver`            | Retained; [production source](../../../packages/core/src/access/subject/contracts.ts), owning-package and generic capability/conformance tests.                                     |
| C-030 | `ultimabase.rest.route-graph`                         | Retained; [production source](../../../packages/rest-plugin/src/routes.ts), owning-package and generic capability/conformance tests.                                                |
| C-031 | `ultimabase.role-events`                              | Retained; [production source](../../../packages/roles-plugin/src/role-events.ts), owning-package and generic capability/conformance tests.                                          |
| C-032 | `ultimabase.runtime-behaviors`                        | Retained; [production source](../../../packages/core/src/runtime/capabilities.ts), owning-package and generic capability/conformance tests.                                         |
| C-033 | `ultimabase.runtime-constraints`                      | Retained; [production source](../../../packages/core/src/runtime/capabilities.ts), owning-package and generic capability/conformance tests.                                         |
| C-034 | `ultimabase.runtime-executor`                         | Already absent before this milestone: Token removed by ADR-0259; canonical Runtime retained.                                                                                        |
| C-035 | `ultimabase.runtime-interceptors`                     | Retained; [production source](../../../packages/core/src/runtime/capabilities.ts), owning-package and generic capability/conformance tests.                                         |
| C-036 | `ultimabase.runtime-observers`                        | Already absent before this milestone: Protocol removed by ADR-0259; product diagnostics/events retained.                                                                            |
| C-037 | `ultimabase.schema-compiler`                          | Already absent before this milestone: Token removed by ADR-0259; canonical compilation retained.                                                                                    |
| C-038 | `ultimabase.schema-mutation-transport-bindings`       | Already absent before this milestone: Canonical command graph (ADR-0261/0262/0263).                                                                                                 |
| C-039 | `ultimabase.typegen-emitter`                          | Already absent before this milestone: Emitter marker removed by ADR-0265; ordinary Typegen setup retained.                                                                          |

## R ledger

| ID    | Contract                                                                 | Final disposition and evidence                                                                           |
| ----- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| R-001 | Generic `decorateCapability` and `capability:decorate`                   | Already removed by ADR-0259; not reintroduced. Negative-power, privilege and conformance tests retained. |
| R-002 | Generic `replaceCapability` and `capability:replace`                     | Already removed by ADR-0259; not reintroduced. Negative-power, privilege and conformance tests retained. |
| R-003 | `replaceSchemaCompiler` and `schema:replace`                             | Already removed by ADR-0259; not reintroduced. Negative-power, privilege and conformance tests retained. |
| R-004 | `replaceRuntime` and `runtime:replace`                                   | Already removed by ADR-0259; not reintroduced. Negative-power, privilege and conformance tests retained. |
| R-005 | Query extensions and `query:extend`                                      | Already removed by ADR-0259; not reintroduced. Negative-power, privilege and conformance tests retained. |
| R-006 | Manual `typegen:contribute` structured main-output augmentation          | Already removed by ADR-0259; not reintroduced. Negative-power, privilege and conformance tests retained. |
| R-007 | Manual `typegen:emit` plugin-owned output files                          | Already removed by ADR-0259; not reintroduced. Negative-power, privilege and conformance tests retained. |
| R-008 | Destructive schema patches and `schema:transform`                        | Already removed by ADR-0259; not reintroduced. Negative-power, privilege and conformance tests retained. |
| R-009 | Generic Core Runtime observer token and factories                        | Already removed by ADR-0259; not reintroduced. Negative-power, privilege and conformance tests retained. |
| R-010 | Arbitrary plugin-operation schema/model targets and generic command maps | Already removed by ADR-0259; not reintroduced. Negative-power, privilege and conformance tests retained. |

## D ledger

| ID    | Contract                                                                                                                      | Final disposition and evidence                                                                   |
| ----- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| D-001 | Several initialized applications and shared Hono listeners coexist; HTTP selects a mounted application                        | Prior approved difference retained; no additional functional removal authorized by milestone 63. |
| D-002 | R-001 through R-007 remain public and tested                                                                                  | Prior approved difference retained; no additional functional removal authorized by milestone 63. |
| D-003 | Operations and schema mutations use several declaration, capability, planning and projection representations                  | Prior approved difference retained; no additional functional removal authorized by milestone 63. |
| D-004 | Typegen accepts references, structured main-output contributions and owned outputs                                            | Prior approved difference retained; no additional functional removal authorized by milestone 63. |
| D-005 | `CompiledTypegenGraph` operation entries carried executable snapshots/nominal tokens and schema surfaces carried constructors | Prior approved difference retained; no additional functional removal authorized by milestone 63. |

## Later decisions and current additions

- ADR-0266/0265: migration scaffold/emitter marker removals predate the baseline.
- ADR-0279/0282: immutable use/Schema namespace and active-owner commands replace spelling/selection, not functional outcomes.
- ADR-0280/0281/0283/0284: complete callbacks, Where, exact User results and standalone specialized consumers use the same retained graph.
- ADR-0285: sparse mutation output derives class methods without dropping schema/model visibility.
- Logical vector field presence/absence remains supported; PostgreSQL vector persistence was not shipped and remains out of scope.
- Password logoutEverywhere/changePassword/session rotation, Roles hierarchy/member commands, ACL cleanup, Soft Delete modes/restore/purge, Validation arithmetic, nested writes and virtual results remain covered by package/public PostgreSQL E2E.
- The PostgreSQL concurrent-upsert correction in 6312 was explicitly requested after a failing E2E: conflicts are rechecked against the declared target, not silently accepted as another row.

## Concrete regression anchors

- [Graph/identity](../../../packages/core/src/plugins/graph.test.ts), [capability composition](../../../packages/core/src/plugins/capability-composition.test.ts), [cleanup](../../../packages/core/src/plugins/capability-resource-lifecycle.test.ts).
- [Mandatory pipeline](../../../packages/core/src/runtime/pipeline/runtime-pipeline.test.ts), [Master](../../../packages/core/src/runtime/master/master-authority.test.ts), [private storage](../../../packages/postgres-plugin/tests/e2e/private-storage-postgres.postgres.e2e.test.ts).
- [Community authoring](../../../packages/plugin-kit/tests/e2e/plugin-kit-authoring-language-service.e2e.test.ts), [JavaScript conformance](../../../packages/testing/tests/e2e/plugin-conformance-javascript.e2e.test.ts), [official manifests](../../../tests/e2e/official-plugin-manifests.e2e.test.ts).
- [Optional-engine cost](../../../tests/performance/no-product-runtime-cost.performance.test.ts), [source/packed surfaces](../../../packages/core/tests/e2e/core-plugin-source-projection.e2e.test.ts), [generated editor graph](../../../packages/typegen/tests/e2e/typegen-generated-types.e2e.test.ts).

The complete built gate passes 102 files/408 tests. This is repository
regression evidence, not an external census of all community plugins.
Budget exceptions do not waive security, correctness, parity or coverage.
