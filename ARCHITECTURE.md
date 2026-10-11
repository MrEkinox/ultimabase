# Architecture

This file is the system-level contract and dependency narrative of UltimaBase,
followed by the module layout of the rebuilt implementation. Use the
[current architecture index](docs/current-architecture.md) to locate a
concept's maintained contract, responsible code, and accepted ADRs.

## History

The current implementation is a package-by-package rebuild of the reference
implementation (commit `0ae7767f7b75dd6c640ca547f9ff85b60f46e69d`, tag
`reference-archive`). The rebuild rewrote internal implementations only:

- The public contract is unchanged: package exports and `package.json`
  exports, signatures, generics, literal types and JSDoc, inference,
  completion, hover text and diagnostics, observable behavior, error classes,
  codes and messages, ordering, transactions, and security guarantees.
- Public tests stayed unchanged and served as the oracle; internal tests were
  ported without losing an assertion.
- The few deliberate observable differences, all on untyped or forged inputs,
  are listed in [`docs/rebuild/DIFFERENCES.md`](docs/rebuild/DIFFERENCES.md).
- Production code went from 114,742 to 104,141 non-blank lines (731 to 622
  files, `yarn measure:size`). The published runtime dependencies are the
  same 16 packages.

The process records of that rebuild (protocol, per-package `REBUILD*.md`
mappings and validation evidence) are archived at tag `rebuild-archive`; the
reference's issue backlog and plans are archived at tag `reference-archive`.
Accepted ADRs remain in force. When an ADR names an internal module, it
describes the reference layout, not the [current one](#module-layout).
Editor-visible behavior of later refactors is compared with
[the DX audit](tooling/dx-audit/README.md).

## System shape

One initialized application exists per JavaScript realm, with concurrent
requests and sequential replacement after disposal
([ADR-0258](docs/adr/0258-single-active-application-lifecycle.md)). Lifecycle
ownership is enforced before initialization, admitted Core work drains before
teardown, and a cleanup failure retains the slot. There is no shared-server
routing: under [ADR-0260](docs/adr/0260-single-owner-http-dispatch.md), server
providers dispatch to one optional HTTP owner through the safe HTTP boundary,
including rejection after shutdown; HTTP application identity remains required.

[ADR-0259](docs/adr/0259-smaller-plugin-kernel-and-canonical-commands.md)
removes ten precisely listed extension powers and introduces one private
compiled command graph.
[ADR-0261](docs/adr/0261-command-compilation-and-binding-phases.md) defines the
construction phases: pure compilation freezes declarations and ordered
surfaces; application materialization binds exact owner implementations and
inert transport metadata before consumers. Application operations execute from
those exact records: direct handles and wire transports share one input
snapshot and envelope boundary, and Runtime reads command identity, transaction
policy, result boundaries, and public errors from the graph. The retained
declaration view is a derived adapter, not an execution registry. Schema
mutations use the same boundary: request dispatch validates the exact canonical
command and its frozen schema-local aliases, while the logical pipeline
preserves Master checks, protected targeting, owner-only effects, and
before/after results. Typegen inspection derives from canonical inert commands
and the same alias index as direct handles;
[ADR-0262](docs/adr/0262-descriptive-typegen-command-inspection.md) removes
executable tokens and constructors from that tooling view, while direct
execution retains exact original declarations. Static and executable transport
projections derive from the same commands and exact materialized bindings.
Shared inert descriptor identities replace duplicate metadata assembly and
GraphQL structural comparisons. Removed extension APIs have no compatibility
path.

[ADR-0279](docs/adr/0279-source-typed-configured-application-authoring.md)
defines the current authoring target. `UltimaBase.use(plugin())` builds one
immutable configured application factory, `App.Schema.define()` projects its
exact source-owned plugin surface, and `new App({ schemas: [...] })` remains the
explicit Runtime registration root. Typegen remains the sole application-local
literal-name graph for circular and cross-file schema relationships. Configured
local fields, options and command surfaces infer from plugin source definitions;
retained standalone, advanced-handle and complete-graph consumers still use
generated descriptors. Direct schema class commands
resolve and verify the sole active application without storing resources or
authority on the class.

[ADR-0282](docs/adr/0282-variadic-configured-plugin-installation.md) extends
the same installation entry point to fixed or dynamic plugin lists through
`UltimaBase.use(...plugins)`, without a second constructor plugin option.

[ADR-0281](docs/adr/0281-retain-generated-where-contracts.md) also retains
the complete generated `WhereInput` for every schema.
Source filters before generation are a bootstrap shape, not a claim that
custom plugin operators have complete Typegen-free editor typing.

ADR-0280 and ADR-0283 retain complete schema Access/Hooks/ACL callback contexts.
ADR-0284 supplies configured Password User authoring while retaining exact User
results and standalone specialized builders. The [Typegen contract](packages/typegen/README.md)
records the final consumer boundary; generation is not limited to relationships.

```text
developer declarations + pure authorized plugin declarations
                              ↓
privilege policy → deterministic capability graph
                              ↓
compiled application graph + owner provenance
                  ├───────────→ optional Typegen → inert name graph + retained declarations
                              ↓
logical Query / operation
                              ↓
capability middleware + protected constraints
                              ↓
rewritable physical persistence plan
                              ↓
database adapter → result middleware → post-commit delivery
```

UltimaBase separates contracts, orchestration, and implementations inside one
foundational package:

- Core's `schema` and `query` domains define portable data and operation contracts.
- Core's application domain owns structured plugin and instance identity,
  privileges, versioned capabilities, static compilation, private resource
  materialization, lifecycle, and diagnostics.
- Core's `runtime` domain executes logical operations, protected constraints,
  physical persistence plans, transactions, master authority, and generic
  middleware.
- official plugins provide Hooks, Access, database, transport, HTTP server,
  and policy implementations through the same public kernel as
  community plugins.

ADRs 0186 through 0205 define this package boundary. Core contains no built-in
Hooks or Access product implementation; the official vertical packages and
community alternatives use the same public kernel.

## Package dependency graph

An arrow means “imports or depends on” and always points toward a foundation.
`yarn constraints` ([`yarn.config.cjs`](yarn.config.cjs)) rejects any runtime
dependency outside this graph, and any workspace dependency of Shared, Core or
Plugin Kit outside it, including development dependencies.

```text
core ─────────────────→ shared
plugin-kit ───────────→ core, shared
typegen ──────────────→ core, shared
hooks-plugin ─────────→ plugin-kit, core, shared
access-plugin ────────→ plugin-kit, core, shared
validation-plugin ────→ plugin-kit, core, shared
soft-delete-plugin ───→ plugin-kit, core, shared
pg-vector-plugin ─────→ core, shared
roles-plugin ─────────→ plugin-kit, core, shared
acl-permissions-plugin → plugin-kit, core, shared
postgres-plugin ──────→ plugin-kit, core, shared
http-plugin ──────────→ plugin-kit, core, shared
server-hono-plugin ───→ http-plugin, plugin-kit, core, shared
rest-plugin ──────────→ http-plugin, plugin-kit, core, shared
password-auth-plugin ─→ http-plugin, plugin-kit, core, shared
graphql-plugin ───────→ plugin-kit, core, shared
graphql-http ─────────→ core, shared
graphql-yoga-plugin ──→ graphql-http, http-plugin, graphql-plugin, plugin-kit, core, shared
graphiql-plugin ──────→ graphql-http, http-plugin, plugin-kit, core
apollo-sandbox-plugin → graphql-http, http-plugin, plugin-kit, core
testing ──────────────→ typegen, core, shared
```

`create-app`, the interactive project initializer, has no workspace dependency:
it generates projects that depend on the published packages. The rebuild left
every package manifest and dependency edge unchanged.

Concrete plugins depend on Core's public contracts. Core never depends back on
concrete plugins. HTTP supplies its immutable effective browser policy to each
generic context resolver and validates resolver policy requirements while
materializing the application, avoiding reverse capability dependencies from
credential plugins back to the HTTP provider.

The accepted future package identities below are issue-tracked architecture,
not current workspaces. Each package is created only when its first
implementation issue starts:

```text
postgres-migrations-plugin → postgres-plugin, core
http-basic-auth-plugin ────→ http-plugin, plugin-kit, core, shared
better-auth-plugin ────────→ http-plugin, plugin-kit, core, shared
```

The HTTP package owns application IDs, an
application-lifetime Fetch route graph, anonymous
request-context resolution, safe pre-dispatch failures, and the explicitly
enabled audited Master header boundary without opening a socket. The Hono
package supplies the optional server lifecycle. The REST package owns
deterministic application-local REST v1 route metadata, the direct schema
option, schema-aware read and mutation normalization, response encoding, route
dispatch, and logical delegation through Core's narrow application request
executor. Password Auth owns its typed
User identity, owner-private credential and session records, authentication
operations, generation-based account-wide session invalidation, and HTTP
session integration through the HTTP package's public resolver and endpoint
capabilities.

Package-owned schema classes use Core's sole `Schema.defineSpecialized()`
boundary when they need immutable static helpers or persisted-result commands.
The factory receives only the exact schema capability context and returns
explicit `statics` and `results`; ordinary application schemas continue to use
`App.Schema.define()`. Core attaches string or private symbol statics before
freezing the class and never exposes a second schema compiler, mutable
prototype, application, adapter, or authority through this boundary.
`graphql-plugin` compiles one application-local generated and custom schema,
accepts ordered plugin-owned schemas through its own multiple capability, and
executes bounded documents with an exact application-bound `RequestContext`.
It remains network-independent.
`graphql-http` publishes one provider-neutral application capability containing
the selected GraphQL HTTP path. Yoga provides it, while the optional GraphiQL
and Apollo Sandbox plugins consume it without depending on Yoga. Explorer
bootstrap pages use only HTTP's reserved application path; every non-explorer
application request still verifies its header identity. Yoga, REST, Hono, and HTTP
authentication integrations meet through the HTTP plugin rather than importing
one another.

Core provides one narrow versioned application request execution capability as
accepted by ADR-0225. Its stable facade is privately bound after engine
construction and before Runtime or transport lifecycle hooks. Transport
plugins may create and bind contexts, enter request execution, exchange one raw
Master credential through the audited application authority, expose selected
plugin operations, and report public-protection uncertainty. They never receive
the application, engine, adapter, pipeline, authority, grant, transaction, or
lifecycle controls themselves.

Normalized schema reads enter that facade through `executeRead`; the method is
read-discriminant-only and returns the ordinary logical Runtime result. It does
not add a generic operation executor or expose application state. Schema
mutations enter through `executeMutation` as one closed schema-command union.
Core delegates each discriminant to the same canonical command boundary as the
class API, so bulk remains ordered, itemized, and atomic without exposing its
transaction machinery. Plugin-field wire protocols use Core-canonical
name-and-version identities so a field owner and transport can declare an exact
codec without importing one another.

ADR-0243 extends only singular create and update data with schema-aware pointer
and relation commands. Core normalizes those commands into one immutable,
bounded, transport-neutral graph before effects, then executes every child
object and membership change through the ordinary Runtime and the root's one
automatic transaction. REST and GraphQL own only recursive wire decoding and
result representation; PostgreSQL receives ordinary object operations,
protected relation deltas, and the borrowed transaction rather than a public or
adapter-specific nested-write API. Bulk roots, upserts, nested delete/upsert,
provisional references, and partial success remain outside this contract.

ADR-0244 adds output-only virtual schema fields without making them persisted
data. Selection policy authorizes the logical field first; Core then derives a
private adapter projection containing its stored dependencies, strips
dependency-only values before public result behavior, and resolves the field
through an application-bound callback executor. The exact request context,
owner attribution, structural output validation, fixed concurrency batches, and
operation-local scheduler also apply to eager targets and nested-write
transactions. Virtual failure precedes mutation commit and cannot bypass target
Access, protected output restrictions, or application isolation.

ADR-0245 adds a narrow plugin-defined schema mutation specialization beside
arbitrary plugin operations and native CRUD. Core retains one product-neutral
logical discriminant, loads and locks the exact persisted target, validates one
owner-only update or Master-only delete effect, and compiles its physical plan
without replaying native update or delete semantics. Application schema and
model handles, optional official Access and Hooks engines, REST, and GraphQL
derive exact application-local command keys from the inert compiled mutation
surface. Static transport planning and late execution remain separate; Core and
the transports never name `softDeleteOne`, `restoreOne`, or `purgeOne`. A
mutation declared with `target: 'many'` takes a `where`: Core resolves the
rows the command may target, then runs the one-row pipeline for each inside one
transaction (ADR-0316).

ADR-0248 also exposes schema mutations through direct frozen-class syntax.
Each call resolves the sole active initialized application and verifies exact
schema and command ownership against its compiled surface before entering the
same handle and Runtime. Classes retain no application resource, transaction,
credential, or authority; calls outside the active owner's lifecycle fail
before effects.

ADR-0247 makes a relation field's static or request-contextual `where` a
Core-owned private read scope. The exact request context resolves synchronous
application behavior once per relation definition and root operation; the
result then combines monotonically with caller predicates, target policy,
protected constraints, and physical membership. Relation handles, eager
inclusions, transport projections, predicates, emptiness, and cardinality share
that visible universe. Adapters receive only portable normalized filters, while
membership mutations and nested writes retain physical edge semantics.

Operation transport identities follow the same exact canonical rule. Their
bindings may carry immutable transport-owned JSON metadata, while Core's
allowlist facade reveals only inert operation descriptors. REST uses that
boundary to validate complete public-error status mappings before startup and
never imports an operation owner such as Password Auth.
ADR-0240 adds a separate Core-owned materialization-time planner for transports
whose public shape must compile before the application engine exists. It
returns the same inert descriptors after exact token, protocol, owner, and
privilege validation, but never exposes codecs or execution. GraphQL compiles
selected operation roots from that plan and later binds the matching executable
allowlist through the ordinary request executor.

ADR-0234 adds exact owner-private plugin records for data such as password and
session verifiers that must participate in typed transactions and schema preparation
without becoming application schemas. Private collections remain outside
Query, Typegen, generated transports, Hooks, Access, application validators,
Runtime observers, and events. The critical `storage:private` privilege grants
one plugin instance access only to its own declarations and never exposes a raw
adapter or another authority mode. ADR-0235 applies that boundary to Password
Auth while keeping its public User as an ordinary typed plugin-owned schema.

ADR-0226 keeps browser preflight outside application selection. One HTTP server
provider has one effective browser policy. Under ADR-0258, one initialized
application owns that provider in each JavaScript realm, so no
cross-application policy comparison exists. The HTTP plugin owns
safe failures before route dispatch; REST, GraphQL, and other protocols own
only failures raised after their handler begins.

ADR-0228 fixes the experimental REST v1 surface under `/api/v1`. Application-owned
schemas may declare the direct `rest` option, sparse declarations inherit the
REST plugin default, and plugin-owned schemas remain private from generated CRUD
routes. Short class paths normalize simple GET parameters or explicit complex
POST bodies into the existing Query and Operation AST. REST returns stable
`result`, `results`, `count`, `exists`, and error envelopes, pages with `take`
and `skip` or with an opaque `after` cursor answered by `nextCursor` (ADR-0309),
and preserves atomic itemized bulk execution.

Official Hooks, Access, and Validation contracts live in their respective plugin
packages. Importing a package does not install it. Official-compatible plugins and
providers import those public contracts, while independent alternatives own
their protocols and use the generic kernel directly.

`@ultimabase/plugin-kit` is the public authoring toolbox. It binds stable package
manifest facts, parses strict manual or synchronous Standard Schema plugin
options into immutable objects, builds common additive
schema patches, flattens operation-provider wrappers, and groups nominal Typegen
references without weakening a Core validation boundary.
Capabilities, privileges, ownership, registries, adapters, and
Master remain direct Core contracts. Core never imports the kit. Official
plugins use the same toolbox where it removes real duplication, while
`@ultimabase/testing` owns runner-agnostic conformance fixtures and assertions.
Its optional generic Typegen check explains the dependency on Typegen; the
baseline kernel suite remains logical-only and opens no PostgreSQL resource.
The types-only `@standard-schema/spec` dependency is owned only by packages that
parse Standard Schema contracts, including Plugin Kit and the optional Validation
plugin. Core has no direct dependency on it.

`@ultimabase/typegen` is optional development tooling. It snapshots the final
compiled application graph and retains the sole exact mapping from literal
relationship targets to application schema contracts. Plugin-added builders,
options, methods, mutations, commands, and operations project from the
installed plugin source definitions on configured factories. Retained standalone
and advanced consumers still use generated descriptors from this same graph.
Typegen emits one replaceable `.d.ts`
contract before infrastructure connection; it never generates JavaScript or a
Runtime client. Core never imports Typegen, and JavaScript applications execute
the same compiled graph without generated artifacts.

Core retains request authority and generic protected constraint contracts. The
official Access plugin owns Access vocabulary and compilation; Runtime does not
install or name Access, ACL, role, authentication, or a community policy engine
when no such capability is present.

Trusted master authority bypasses the complete official Access and ACL
authorization policies. Validation, hooks, transactions, database constraints,
and integrity-maintenance contributions remain active. Core keeps explicit
per-contribution master behavior on its generic policy-neutral boundary because
it cannot classify community constraints as authorization or integrity work.

Structural mutation validation has two Core-owned passes. The initial pass resolves
defaults and generators and guarantees immutable structural shape before Access
or developer behavior. After every optional input transform, one mandatory
final pass repeats structural snapshots before value-dependent enforcement,
observers, or persistence. Behavior providers cannot omit or replace this
revalidation invariant. Authorized providers may run a generic rejection-only
final mutation-input guard with stable prepared targets before enforcement
reevaluation; the guard cannot replace the operation.

The optional `@ultimabase/validation-plugin` owns the direct `validation` option,
Standard Schema execution, issue mapping, and projected arithmetic checks at
that guard boundary. Reads, adapter results, materializations, includes, and
final projections repeat only Core structural snapshots. An application without
the plugin has no application field validator or placeholder Runtime behavior.

The official `@ultimabase/soft-delete-plugin` is written with `definePlugin`
(ADR-0316). A schema opts in with the `.softDelete()` shape method, which adds
the server-written `isDeleted` and `deletedAt` fields and the `softDeleteOne`,
`softDeleteMany`, `restoreOne`, `restoreMany`, `purgeOne` and `purgeMany`
commands. Without options, the native logical delete is kept while a protected
plan rewrite performs the physical tombstone update; `{ mode: 'command' }`
keeps hard delete. Both use the same generic Runtime transaction, protected
constraints, and persistence boundary. Optional Access and Hooks engines derive
independent logical operation keys; REST and GraphQL expose the one-row
request commands on otherwise eligible schemas. Purge is audited Master-only.
The package depends only on public foundations and never imports those
optional engines, transports, Yoga, or a database implementation.

## Module layout

This section describes the rebuilt source layout. Paths are relative to each
package's `src/` directory. A module kept at a reference path is often kept
because a website page lists it in its `sources` frontmatter or because a
test deep-imports it; the package `REBUILD*.md` files archived at tag
`rebuild-archive` record each case.

### Core domains

Core keeps one public entry (`src/index.ts`, 1,118 exported names, identical to
the reference) and separates its internals into domains. The table lists the
directories under `packages/core/src` and the modules that own each mechanism
after the rebuild.

| Directory                                                                                              | Responsibility                                                                                   | Owning modules in the rebuild                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.` (root)                                                                                             | Public entry, plugin-author foundation exports, shared exact-object boundary                     | `index.ts`, `foundation.ts`, `exact-object-validation.ts` (one implementation of the plain-object and unknown-key checks every domain uses)                                                                                                                                                                                                                                      |
| `schema/fields/`                                                                                       | Field definitions, options, built-in and plugin field kinds                                      | `base/factory.ts` (one `createScalarFieldFactory` for every scalar kind), `base/definition.ts`, `base/options.ts`, one module per built-in kind in `builtins/`, `constraints/temporal.ts`, `plugin.ts`                                                                                                                                                                           |
| `schema/schema/`                                                                                       | `Schema` classes, field builders, registry, compilation, immutable models and static commands    | `definition.ts`, `definition-compilation.ts` (compiled-record store, `SchemaCompilationError` and compilation together), `registry.ts`, `field-builder.ts`, `runtime-field-builder.ts`, `model-class.ts` (static commands and the static-mutation proxy), `model-commands.ts`, `source-type-info.ts`                                                                             |
| `schema/nested-writes/`, `schema/output/`, `schema/plans/`, `schema/relations/`                        | Nested-write normalization, output builders, structural validation plans, pointers and relations | `nested-writes/normalization.ts` (one `NestedWriteNormalizer`), `output/builder.ts`, `plans/compiler.ts`, `relations/mapping.ts`                                                                                                                                                                                                                                                 |
| `query/`                                                                                               | Query AST, clauses, filters, updates, logical operations and schema commands                     | `filters/primitive.ts` (one `where` operator table shared by normalization, serialization and relation counts), `filters/where-normalize.ts`, `filters/where-builder.ts`, `filters/operand-snapshots.ts`, `operations/execution.ts`, `operations/schema-command-execution.ts`, `operations/results.ts`, `query/query.ts`                                                         |
| `access/`                                                                                              | Request access and subject contracts                                                             | Unchanged from the reference (public contracts and JSDoc only)                                                                                                                                                                                                                                                                                                                   |
| `plugins/`                                                                                             | Plugin definitions, graph, manifests, privileges, capabilities, declarations, commands, Typegen  | `plugin.ts` (with its private contribution compiler), `graph.ts`, `manifest.ts`, `capabilities.ts`, `capability-rules.ts` (one table of protected protocol families), `capability-inventory.ts`, `capability-host.ts`, `declaration-host.ts`, `plugin-contributions.ts`, `plugin-command-contributions.ts`, `command-graph.ts`, `typegen-declarations.ts`, `schema-compilation/` |
| `application/`                                                                                         | Active application slot, handles, model views, privilege policy, command envelopes               | `active-application.ts`, `application-handles.ts`, `application-model-views.ts`, `plugin-privilege-policy.ts`, `framework-application.ts`                                                                                                                                                                                                                                        |
| `errors/`                                                                                              | Framework and plugin error classes                                                               | `framework-error.ts` (with the private public-error base), `plugin-error.ts`                                                                                                                                                                                                                                                                                                     |
| `runtime/application/`                                                                                 | The `UltimaBase` facade, configured factories, the application request execution capability      | `ultima-base.ts` (kernel and engine in `#private` fields), `configured-application-factory.ts`, `application-request-execution.ts`, `application-operation-transport-planning.ts`                                                                                                                                                                                                |
| `runtime/engine/`                                                                                      | Framework and request engines, Master elevation, terminal context resolution                     | `request-engine.ts` (private state read through one `readRequestEngineInternals` accessor), `framework-engine.ts`, `request-engine-batch.ts`, `application-binding.ts`                                                                                                                                                                                                           |
| `runtime/pipeline/`, `runtime/behaviors/`, `runtime/contributions/`                                    | Logical operation pipeline, stage inputs, database execution, behavior composition               | `pipeline/runtime-pipeline.ts`, `pipeline/stage-inputs.ts`, `pipeline/database-execution.ts`, `pipeline/inclusion-projection.ts`, `pipeline/application-bindings.ts` (one bind-once factory for relation filters and virtual fields), `behaviors/composition.ts`, `behaviors/validation-boundaries.ts`                                                                           |
| `runtime/enforcement/`, `runtime/validation/`                                                          | Protected policies and constraints, structural and final mutation validation                     | `enforcement/state.ts`, `enforcement/protected-policy.ts`, `validation/runtime-validation.ts` (one compiled-plan cache), `validation/runtime-mutation-validation.ts`, `validation/final-mutation-validation.ts`                                                                                                                                                                  |
| `runtime/transactions/`, `runtime/context/`, `runtime/master/`, `runtime/cancellation/`                | Transactions, request context, Master authority, cancellation                                    | `transactions/run-transaction.ts` (identity, callback, lifetime, commit, rollback and post-commit flush in one function), `transactions/pipeline-transaction.ts`, `context/active-framework-context.ts`, `master/master-authority.ts`                                                                                                                                            |
| `runtime/nested-writes/`, `runtime/relations/`, `runtime/relation-filters/`, `runtime/virtual-fields/` | Nested-write execution, relation mutations and inclusions, contextual relation filters, virtuals | `nested-writes/runtime-host.ts`, `relations/relation-mutation.ts`, `relation-filters/execution.ts`, `virtual-fields/execution.ts`                                                                                                                                                                                                                                                |
| `runtime/plugin-operations/`, `runtime/schema-mutations/`, `runtime/commands/`                         | Plugin operations, plugin schema mutations, command bindings and transport projections           | `plugin-operations/request-execution.ts`, `plugin-operations/engine-integration.ts`, `schema-mutations/runtime.ts`, `schema-mutations/request-execution.ts`, `schema-mutations/transport.ts`, `commands/transport-projection.ts`                                                                                                                                                 |
| `runtime/database/`, `runtime/persistence/`, `runtime/operations/`                                     | Database adapter contracts, persistence plans, result materialization                            | `database/contracts.ts`, `persistence/plans.ts`, `persistence/execution.ts`, `operations/materialize-result.ts`                                                                                                                                                                                                                                                                  |
| `private-storage/`                                                                                     | Owner-private plugin records                                                                     | `runtime.ts` (reads the engine internals instead of its own registration), `registry.ts`, `request.ts`                                                                                                                                                                                                                                                                           |

Core production went from 63,660 to 58,694 non-blank lines (schema −1,349,
plugins/application/errors −703, query −690, runtime application domain −916,
runtime pipeline domain −1,029, then −279 in the integration pass). The
per-domain records are archived at tag `rebuild-archive`.

### Official packages

| Package                  | Rebuilt layout (under `src/`)                                                                                                                                                                                                                                                                          | Lines before → after |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------: |
| `shared`                 | Unchanged: every line is public contract                                                                                                                                                                                                                                                               |              74 → 74 |
| `plugin-kit`             | `plugin-events.ts` (trusted event contracts in a `WeakSet`), `plugin-options.ts`, `schema-patch.ts`, `contextual-fields.ts`                                                                                                                                                                            |            778 → 722 |
| `typegen`                | Snapshot half: `snapshot.ts`, `snapshot/fields.ts`, `snapshot/virtual-fields.ts`, `snapshot/plugin-graph.ts`; generator half: `generator.ts`, `generator/identifiers.ts`, `generator/filters/{operators,field-filters,declarations}.ts` and the other renderers; `plugin.ts`, `loader.ts`, `writer.ts` |        3,018 → 2,733 |
| `testing`                | `plugins/runner.ts` (one `UltimaBase.use(...plugins)` per fixture), `plugins/suite.ts`, `plugins/fixture.ts`, `plugins/static-snapshot.ts`, `plugins/typegen-check.ts`, `postgres/worker.ts`                                                                                                           |        1,243 → 1,162 |
| `hooks-plugin`           | `authoring/declarations.ts` (one declaration boundary), `context/hook-context.ts`, `runtime/dispatcher.ts` (one dispatcher closure), `runtime/lifecycle.ts` (phase table), `runtime/execution-runtime.ts`, `runtime/events.ts`                                                                         |        4,145 → 3,447 |
| `access-plugin`          | `authoring/declarations.ts`, `authoring/plan.ts` (one operation-slot table), `authoring/compiler.ts` (drafts frozen in place), `runtime/rule-evaluation.ts` (one `AccessScope`), `runtime/dispatcher.ts`                                                                                               |        4,438 → 3,653 |
| `validation-plugin`      | `operation-validation.ts` (flattened arithmetic projection), `field-validation.ts`, `standard-schema.ts`                                                                                                                                                                                               |            663 → 622 |
| `soft-delete-plugin`     | `plugin.ts` (kept from the reference for hover parity), `contracts.ts`, `visibility.ts`, `replace-delete.ts`, `explicit.ts`, `administration.ts`                                                                                                                                                       |            710 → 709 |
| `acl-permissions-plugin` | `acl.ts` (one canonical `ACLJSON` state per `ACL`), `acl-json.ts`, `application-state.ts` (merged state, attribution and operation lookup), `acl-operation-resolution.ts`, `plugin.ts`                                                                                                                 |        3,188 → 2,687 |
| `roles-plugin`           | `plugin.ts` (wiring and Runtime behavior), `role-member.ts` (one relation-command factory), `role-hierarchy.ts`, `role-resolution.ts` (single schema-root Query bridge), `role-deletion.ts`                                                                                                            |        2,192 → 2,043 |
| `pg-vector-plugin`       | `index.ts` (public types dominate; unchanged except one local)                                                                                                                                                                                                                                         |            202 → 201 |
| `postgres-plugin`        | `required.ts` and `naming.ts` (new), `schema/`, `query/` (`jsonb-operand.ts` merges two modules), `drizzle/` (`prepared-operation.ts` merges four modules; one `PostgresStatementContext`), `synchronization/`, `introspection/`                                                                       |        9,307 → 7,966 |
| `http-plugin`            | `definitions.ts` (shared exact-option checks and definition registry), `application.ts` (one `dispatchPreparedRequest`), `request-boundary.ts`, `browser-policy.ts`, `route-graph.ts`, `endpoints.ts`                                                                                                  |        2,338 → 2,080 |
| `server-hono-plugin`     | `plugin.ts`, `options.ts`, `provider.ts`, `original-headers.ts`                                                                                                                                                                                                                                        |            431 → 424 |
| `rest-plugin`            | `errors.ts` (all three error families), `transports.ts` (closures instead of class, `WeakMap` and exported binders), `http-handler.ts`, `reads.ts`, `mutations.ts` (one contract table), `field-values.ts`, `routes.ts`                                                                                |        4,320 → 3,728 |
| `password-auth-plugin`   | `operation-handlers.ts` (one closure over private state), `credentials.ts` (one compare-and-swap writer), `sessions.ts`, `operations.ts`, `http-cookie-routes.ts` (one `route(key)`), `plugin.ts`                                                                                                      |        3,567 → 3,366 |
| `graphql-plugin`         | `compile-context.ts` (one `GraphqlCompileContext`), `binding-compiler.ts`, `binding-metadata.ts`, `binding-types.ts`, `root-fields.ts`, `wire-values.ts`, `connection-runtime.ts`, `schema-composition.ts`                                                                                             |        7,620 → 6,661 |
| `graphql-http`           | `endpoint.ts` (`path` read once)                                                                                                                                                                                                                                                                       |              76 → 72 |
| `graphql-yoga-plugin`    | `handler.ts` (one ordered Yoga plugin list), `errors.ts` (one failure constructor), `body.ts`, `media.ts`, `options.ts`, `plugin.ts`                                                                                                                                                                   |            731 → 726 |
| `graphiql-plugin`        | `plugin.ts`, `options.ts`, `page.ts` (HTML and CSP identical)                                                                                                                                                                                                                                          |            188 → 183 |
| `apollo-sandbox-plugin`  | `plugin.ts`, `options.ts`, `page.ts` (HTML and CSP identical)                                                                                                                                                                                                                                          |            197 → 192 |
| `create-app`             | `catalog.ts` (one `selectedPluginIds`), `config.ts` (shared plan queries), `prompts.ts`, the three template modules (condition tables), `generate.ts`, `cli.ts`                                                                                                                                        |        1,656 → 1,557 |

## Rebuild simplifications

The rebuild counts as simplification only what removes indirection or
duplication; it never compacts formatting, moves code into tests, weakens a
check, or adds `any` or unjustified casts.
The recurring changes are:

- **One implementation per boundary check.** Exact-object and unknown-key
  validation, namespaced-name, plugin-identifier, error-code and TypeScript
  identifier grammars, behavior stage names, and owner and
  identity snapshots each have one implementation in their owning domain. Each
  keeps the reference check order and message at every call site.
- **Private state instead of side registrations.** `RequestEngine`,
  `FrameworkEngine` (Master authority) and `UltimaBase` keep their state in
  `#private` fields read through one internal accessor, instead of module
  `WeakMap` entries registered per instance and re-read by every consumer.
  GraphQL operation and schema-mutation executions follow the same rule.
- **Tables instead of parallel branches.** Protected capability families
  (`plugins/capability-rules.ts`), `where` operators (`query/filters/primitive.ts`),
  Hooks phases, Access operation slots, REST mutation contracts, Typegen filter
  names, PostgreSQL column specifications, and create-app conditions are each
  one table read by every consumer, so the consumers cannot drift.
- **Context records instead of positional parameters.** Examples include
  `AccessScope`, `GraphqlCompileContext`, `PostgresStatementContext`,
  `RuntimeOperationScope`, and the nested-write `RelationshipSite`.
- **Fewer modules and wrappers.** Tiny modules merge into their only consumer;
  pure re-export modules and the forwarders that kept the frozen Core partition
  paths alive were removed once the partitions were integrated. Production
  files went from 731 to 619.
- **Unreachable checks removed with proof.** Each removed check is listed in
  its archived package `REBUILD*.md` with the earlier check that rejects the
  same input and the test that proves it.
- **Prototype-safe copies.** Records keyed by developer-declared names are
  built with `Object.fromEntries` or `Map` instead of assignment loops. This
  closes the `__proto__` and getter time-of-check/time-of-use defects listed
  in [DIFFERENCES.md](docs/rebuild/DIFFERENCES.md); ordinary inputs behave
  identically.

What deliberately did not change: every public entry, every emitted export
list, the type declarations whose private aliases shape hover text (restored
where a first rewrite changed hovers, for example in Hooks, REST, Password
Auth, Roles and Soft Delete), modules that website pages list as sources or
that frozen tests deep-import, and the 16 published runtime dependencies.

## Direct plugin options

Core accepts schema and field options only when an installed plugin contributes
their typed contracts to the compiled application graph. For example, `access`
is recognized only when `accessPlugin()` contributes its option definitions:

```ts
import { accessPlugin } from '@ultimabase/access-plugin'
import { UltimaBase } from '@ultimabase/core'

const Application = UltimaBase.use(accessPlugin())

const Post = Application.Schema.define({
	className: 'Post',
	access: {
		read: true,
	},
	fields: (field) => ({
		title: field.string(),
	}),
})

const application = new Application({ schemas: [Post] })
```

Each used direct option resolves against one exact definition contributed by an
installed plugin without exposing that plugin's implementation to Schema.
During application initialization, Core validates and normalizes the value
under its definition owner. Missing, ambiguous, or wrongly owned definitions
fail before any infrastructure phase; duplicate definitions become an error
only when an occurrence needs an exact owner.

Plugin schema selectors can match direct-option presence, portable structural
equality, or the exact absence form `{ option: { name, present: false } }`.
Absence is distinct from an explicit `false` and still requires one exact
option-definition owner. Equality and paths inspect only portable normalized
values; opaque values expose neither their contents nor internal markers. Plugin manifests remain the smallest fixed truthful set of potential
powers evaluated before schema compilation; effective declarations may compile
to an empty application-local plan without creating a second capability graph.

Plugin definitions carry structured public source references for their
developer-authored options. Factory-owned compiler markers remain internal:
Core retains their validation, ownership, provenance, and plugin requirement
while configured authoring types omit their names. Only references needed by
the retained application schema-name graph reach Typegen.

Plugins may also contribute new logical field kinds. Structural validation
plans retain the original immutable field definition by identity; the owning
plugin claims its namespaced kind and contributes validation and adapter
behavior without a second plugin-only plan representation.

A plugin scalar with a portable versioned JSON storage codec receives exact
complete-value equality and membership through the ordinary Query AST. Core
snapshots operands with the field validator and adapters reuse the storage
codec. ADR-0212 additionally lets a non-list plugin scalar explicitly own a
typed partial JSON snapshot for the existing structural `contains` leaf.
Adapters advertise that protocol separately from JSON storage and never receive
the plugin snapshot callback. Ordered, string, inverse containment, and
domain-specific operators still require a separate accepted contract; codec
availability alone never implies them.

## Embedded object values

`objectField` composes value fields into one logical structured value. Nested
field input resolution and Access execute for every concrete object or list
occurrence with deterministic child-before-parent traversal. The object has no
independent schema identity, lifecycle, relationship graph, or hidden columns.

Core therefore rejects pointer and relation children plus integer or bigint
children using `autoIncrement`; those capabilities require top-level
relationship or database-column ownership. PostgreSQL stores the remaining
structured value in one JSONB column and rejects unsupported nested physical
metadata during setup.

## Relationship targets

Application relationship fields declare the stable class name of their target.
Core resolves every name against the complete application registry, retains the
exact registered class as a private field capability, freezes one
application-local logical graph, and closes schema registration before plugin
setup, `connect`, or another infrastructure phase. Plugin setup receives only a
read-only view of that compiled schema registry. Low-level field factories may
still use lazy class callbacks for framework-owned composition.

The graph stores only source schema identity, structural field path, and target
schema identity. It contains no foreign-key column, join-table name, transport
shape, or execution state. Database plugins consume this same graph when they
later compile physical relationships, while transports remain downstream
consumers of Core Query and Runtime contracts.

`pointerField` is the first producer of this graph. Its ordinary value is the
nominal immutable `Pointer<TSchema>` class, which carries exact schema identity
and a string object ID without loading a target. Pointer metadata defines only
logical presence, uniqueness, and referential action. Direct target queries
execute through Runtime with a private ID row filter combined monotonically
with Access. Inclusion instead carries a separately prepared singular target
Access plan to an eager-capable adapter, without manufacturing target schema
hooks. Database adapters explicitly advertise the versioned portable pointer
capabilities; physical foreign keys remain adapter-owned.

Parent filters keep pointer identity and target traversal explicit. Identity
operators accept target object IDs and inspect only the stored pointer. `is`
and `isNot` carry a target-typed nested filter through the portable relationship
predicate AST, target Access, and an adapter-owned singular relation query.

## Plugins

Plugins form one deterministic flat graph. The immutable configured factory is
the sole installation path:

```ts
const Api = UltimaBase.use(graphqlYogaPlugin()).use(apolloSandboxPlugin())
```

Plugin definitions never contain nested plugins. Dependencies determine setup
order, then `.use()` position breaks ties. Teardown uses the reverse order.
Every plugin has one stable namespaced ID and may have an explicit instance ID;
the same plugin can be configured several times only through distinct instance
identities.

Each plugin definition contains a static manifest with its structured identity,
package and Core compatibility, derived privileges with author or generated
reasons (ADR-0290), environment claims, and provided and required capability
tokens. An application may deny privileges globally, by plugin ID, or for an exact
instance. The application logger (ADR-0313) writes the complete report of
every plugin and requested power at `debug`, and one `info` startup line names
critical privileges; one typed diagnostic aggregates denials, logged at
`error`, before declarations, Typegen, setup, connections, Runtime, or
transports can produce effects.

Plugins are trusted in-process Node.js code. Privileges govern UltimaBase-owned
facades and make powers inspectable; separate environmental claims describe
direct filesystem, network, process, or native-code behavior that Core cannot
verify. Neither mechanism is an operating-system sandbox. Critical privileges
are private storage and authority elevation. Core exposes no filesystem, network, or Typegen replacement
privilege without a corresponding enforceable facade. Master credential
verification and grant creation remain Core-owned. An explicitly configured
HTTP plugin may pass one raw key to the exact application authority selected by
the mandatory public application ID, but transport structure, flags, contexts,
grants, and foreign credentials cannot manufacture authority. Successful
verification and audit create the same private application-owned provenance as
trusted server execution.

Versioned capabilities replace public architectural string slots. A `single`
capability accepts one provider, a `multiple` capability accepts independent
providers, and a `pipeline` capability composes handlers. Tokens also distinguish
pure `declaration` values from resource-backed `application` implementations
materialized during setup. Providers retain exact owner identity and stable
order. Competing single providers are errors; generic provider replacement and
consumer decoration are not public powers (ADR-0259).

`PluginGraph` validates the combined normalized configuration again, resolves
required and present optional dependencies, validates non-ordering plugin peers,
rejects explicit conflicts and cycles, and exposes one stable dependency-first
order without initializing plugins. A peer proves exact identity and semantic
compatibility only; it grants no capability read or lifecycle guarantee.

Each application owns its capability host and private resource store.
Plugin-scoped views attach the actual owner and instance to every declaration,
additive patch, middleware, constraint, codec, persistence rewrite, Typegen
reference, event, and command. Plugin code cannot self-assert a different
owner.

Before application compilation, Core invokes each authorized plugin's
synchronous static declaration callback in dependency-first order. The public
host may add schemas, FieldBuilder methods and logical kinds, namespaced schema
or field options, additive immutable patches, schema-mutation methods,
application operations, and public Typegen references. Each boundary requires
its exact privilege; destructive patches and generic schema/model operations
are removed by ADR-0259. Declarations are pure, deterministic, and separated from
secrets, services, adapters, requests, clocks, and network state.

Developer declarations and authorized plugin contributions compile into one
immutable application graph with per-contribution provenance. Each plugin's
selectors observe the graph completed by earlier plugins and freeze targets
before that plugin's patches. Conflicts never silently use last-writer-wins. A
schema class may expose different handle surfaces in independent applications;
conflicting declarations within one application fail before setup. Plugin-created
schemas and application-specific commands remain reachable through the
application-owned `ultimabase.schema(nameOrClass)` handle without mutating
exported classes or recording process-global compatibility state. Models
returned through an application are transparent immutable views of the original
schema instance: generated plugin commands are directly callable on the result,
while ownership, command lookup, and disposal remain local to that application.

Core's canonical compiler applies normalized contributions directly to private
immutable prepared schemas (ADR-0263). Domain objects retain exact nominal
identity; portable options remain detached snapshots and opaque callbacks are
never invoked by selectors or patch application. Final validation checks input
membership, ownership, provenance, protected fields and complete selection
results before command compilation and atomic registry publication. No compiler
transport, artifact-session lookup or replacement API remains. Public tooling
and transport projections stay inert; plugins extend compilation only through
authorized declarations.

The kernel has no string slots, plugin service registry, or generic named
setup contribution registries. Versioned capabilities are the only public
cross-plugin host; concrete Hooks and Access contracts live in their vertical
packages, while Core retains exact privilege-scoped facades only for generic
Runtime, persistence, and constraint mechanisms.

The lifecycle manager first completes every setup callback, leaving a validation
boundary before infrastructure changes. It then runs connect, schema
preparation, runtime start, and transport start in graph order. Stop and dispose
run in reverse order, and a partial failure cleans every completed stage before
the original failure is reported.

`UltimaBase` is the sole public application owner. Core's Runtime domain keeps
its application kernel and engine private behind that facade. Construction and
`compile()` perform no I/O; `initialize()` materializes application capabilities,
and `start()` assembles Runtime before starting infrastructure. Configured
literal plugin names retain their setup export types.

## Engines

Core owns the logical operation pipeline, structural validation, generic
behavior composition, protected monotonic constraints, transactions,
cancellation, persistence plans, result materialization, and post-commit
observer boundaries. It installs no concrete behavior or policy engine.
ADR-0264 removes plugin contribution of normalization/commit stages; Core owns
these assembly boundaries. Runtime behaviors and prepared-operation interceptors
retain their nominal capability, privileges, deterministic order and exact
callback owner, as do Hook transaction callbacks and post-commit delivery.

`@ultimabase/hooks-plugin` owns the official schema and field `hooks` option
namespaces, callback context, lifecycle phases, event delivery, diagnostics,
ordering, and recursion semantics. It contributes complete product behavior
through `runtimeBehaviorCapability`. Omitting it allocates no hook dispatcher,
snapshot, or placeholder stage. A community alternative may own a different
authoring protocol and use the same generic capability.

`@ultimabase/access-plugin` similarly owns the official `access` namespaces,
policy compilation, provider protocol, diagnostics, and Runtime behavior. ACL
does not depend on that product: it contributes Core `protectedPolicy()` values
and row filters directly. Roles and authentication may supply optional
request subjects but grant nothing by themselves.

The low-level `preparedOperation()` factory is a generic Runtime
contribution, not a built-in schema Hook. Its input uses immutable
`RequestContext`; ADR-0289 removed the unconsumed `beforeOperation()` and
`afterOperation()` interceptor factories in favor of Runtime behaviors. Core executes such callbacks through a product-neutral
cancellation and recursion boundary; concrete plugins may add stricter
lifecycle contexts internally.

Core also owns application-bound callback attribution. Direct setup, lifecycle,
capability, Runtime, persistence, transport-codec, and operation callbacks run
under their exact plugin instance. A vertical engine uses the same public
executor to replace its outer ownership with `application` for inline
declarations or with the exact contributing plugin for provider callbacks.
This attribution drives Core privilege checks such as `authority:elevate`; it
is not a sandbox or a transferable authority token.

Logical operations remain distinct from physical persistence plans. An
authorized rewriter may change the physical statement, while protected
constraints stay outside the replaceable plan and business behavior continues
to observe the original logical operation.

## Optional Access capability

The official `@ultimabase/access-plugin` preserves four neutral levels:

```text
operation decision
AND row filters
AND item decision
AND field decisions
```

- `operation` grants or rejects an operation family before business hooks;
- `filter` constrains reads and mutation targets in the database;
- `item` validates create input or one prepared mutation target;
- `field` controls read, filter, order, create, and update use.

Access filters reuse Core's typed filter AST but remain outside the developer
Query. Query predicates and every Access provider
constraint combine through logical `AND`; a business hook cannot inspect or
remove the private Access state.

Persisted object ACL is an independent protected policy. Its immutable value
stores public, authenticated, exact schema-qualified principal, and
schema-qualified role grants for `read`, `update`, and `delete`. The reserved
ACL field itself is visible and mutable only under trusted master execution;
ordinary object update grants never authorize ACL management.
The ACL package reads the Core current principal (ADR-0304) and consumes the
separate neutral role resolver; it never imports a concrete authentication or
roles plugin. Missing identity fails closed while applications using only
public and audited master behavior require neither provider.

The direct plugin-owned `acl` schema option owns row-aware defaults and shared create/update
input resolution through public capability middleware. `aclPlugin()` owns an
independent monotonic protected policy and declares master bypass. It does not
depend on the official Access package. Core Runtime has no ACL stage or subject
vocabulary. PostgreSQL stores one indexed JSONB ACL document on each protected
row. The ACL field owns and validates its narrow structural-containment
operands, while ACL authorization emits ordinary protected row filters. The
generic PostgreSQL plugin-field compiler combines those filters with every
other predicate in one statement without importing or naming ACL. This
physical representation requires no ACL-specific join or integration package.
Subject-owning providers independently choose `fail`, `preserve`, or `cascade`
deletion behavior. ACL publishes neutral principal and role cleanup
contributions, then uses a private asynchronous maintenance scope to add an
exact-subject protected row filter to ordinary read execution. PostgreSQL
lowers its field-owned containment leaf generically. Cascade derives every rewritten
ACL from the locked current row and performs singular updates inside the
subject deletion transaction, preserving unrelated grants and rolling all
schemas back together on failure.
ACL observes complete schema mutation materializations and queues one typed
structured-diff event for post-commit delivery.
This observer never participates in authorization, emits nothing on rollback,
and is not published by realtime or transport plugins by default.

The official schema Access surface is the generalized class-level permission
system, and its field Access surface controls field disclosure and mutation.
ACL is an optional persisted per-object policy that composes through Core's
generic protected constraint boundary. Roles and authentication
supply optional typed subject capabilities and grant nothing by themselves.
The Access plugin contains no built-in ACL, user, owner, or role rule. Its
complete policy and ACL authorization always bypass audited master authority;
Core Runtime still has no permission-specific bypass branch. A community Access
engine may expose different syntax while using the same protected constraint
contracts and must opt into bypass at the generic policy boundary.

Plugin permissions are generic (ADR-0317): a plugin declares a named schema
permission through `provideSchemaPermissions` and asks during a request with
`holdsSchemaPermission`. Core answers `true` for Master, otherwise asks every
protected policy's optional `permission` handler and holds the permission only
when one grants it and none refuses it. Soft Delete's `readDeleted` is the
first consumer and Access the first grantor; neither imports the other. Soft
Delete keeps its trash filter on Master reads unless their own `where` names
`isDeleted` (ADR-0317, 6.1 amendment).

Official-compatible Access providers import public contracts from
`@ultimabase/access-plugin`; independent policy engines use the generic kernel
directly and own their protocol identity. Official-compatible Hook providers
follow the same model with `@ultimabase/hooks-plugin`. Core cannot prove that an
arbitrary protected policy covers every operation exposed by a public
transport. Every unacknowledged exposure therefore emits
`UNVERIFIED_PUBLIC_TRANSPORT_PROTECTION`; its structured data distinguishes no
provider from provider-present-but-unverified without naming a concrete policy
product.

## Database and migrations

Drizzle and PostgreSQL imports exist only inside PostgreSQL packages.

`postgresPlugin` follows the existing explicit `schemaPolicy`: `override`,
`fail`, or `ignore`, with unchanged default and synchronization behavior.
`renamedFrom` remains a supported data-preserving direct synchronization input.
Use `ignore` when an external tool owns schema changes.

ADR-0266 removes migration-only support/intent/planning protocols, the
`migration:contribute` privilege, PostgreSQL's preparation marker and migration
metadata, and `FakeAdapterMigrationHistory`. No migration product, history
storage, SQL runner or replacement integration is introduced. Future migration
work must decide its integration against the then-current kernel.

ADR-0289 also removes the test-only adapter support tokens, attributed
physical-schema contributions and raw adapter leases. Private storage
descriptors, fingerprints, codecs, transaction leases and lifecycle preparation
remain unchanged. Removing
a plugin does not authorize a destructive drop; existing synchronization keeps
unmatched columns and private/orphaned storage for explicit external review.

## HTTP and GraphQL

- HTTP servers are plugins. The first implementation is Hono on Node.js.
- REST converts requests to Operation AST and never queries PostgreSQL directly.
- ADR-0238 names the network-independent package
  `@ultimabase/graphql-plugin`; `graphqlPlugin()` generates, composes, and
  executes one application-local `GraphQLSchema` through Core's narrow request
  capability.
- `graphqlYogaPlugin()` is an explicit sibling that depends on GraphQL and the
  shared HTTP plugin. It never installs either dependency automatically and
  never receives an application engine.
- Completed Nexus, Pothos, GraphQL Tools, or other compatible schemas compose
  through GraphQL-owned application-local inputs and capabilities, not a Core
  registry.
- Generated relationship selections use Core's eager inclusion contract. V1
  adds no framework-owned DataLoader or second policy-aware loading path.
- Explicit plugin operations enter GraphQL only through the canonical
  `ultimabase.graphql.operation@1.0.0` binding and Core's operation transport;
  installed declarations are never exposed automatically.

## Further reading

- [`docs/adr/`](docs/adr/README.md): decision records, which remain in force.
- [`docs/concepts/`](docs/concepts/README.md): detailed contracts.
- [`docs/rebuild/DIFFERENCES.md`](docs/rebuild/DIFFERENCES.md): deliberate
  observable differences from the reference implementation.
- [`tooling/dx-audit/`](tooling/dx-audit/README.md): the editor-visible audit
  that compares a baseline checkout with a candidate.
- [ROADMAP.md](ROADMAP.md): proposed directions.
- Tags `reference-archive` and `rebuild-archive`: the reference's issue
  backlog and plans, and the rebuild's per-package records.
