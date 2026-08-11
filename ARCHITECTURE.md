# Architecture

## System shape

```text
developer declarations + pure authorized plugin declarations
                              ↓
privilege policy → deterministic capability graph
                              ↓
compiled application graph + owner provenance
                  ├───────────→ optional Typegen → inert .d.ts contracts
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
  migrations, and policy implementations through the same public kernel as
  community plugins.

ADRs 0186 through 0194 define this accepted target. Milestones 14 and 15 are
active implementation work, so the current source still contains native Hooks
and Access compatibility domains until their removal audit completes.

## Package dependency graph

An arrow means “imports or depends on” and always points toward a foundation.

```text
core ─────────────────→ shared
plugin-kit ───────────→ core, shared
typegen ──────────────→ core, shared
pg-vector-plugin ─────→ core, shared
roles-plugin ─────────→ core
acl-permissions-plugin → core
postgres-plugin ──────→ core
acl-postgres-plugin ──→ acl-permissions-plugin, postgres-plugin, core
testing ──────────────→ core, shared
```

Concrete plugins depend on Core's public contracts. Core never depends back on
concrete plugins.

The accepted future package identities below are issue-tracked architecture,
not current workspaces. Each package is created only when its first
implementation issue starts:

```text
postgres-migrations-plugin → postgres-plugin, core
server-hono-plugin ────────→ core
rest-plugin ───────────────→ core
graphql-plugin ────────────→ core
graphql-yoga-plugin ───────→ graphql-plugin, core
hooks-contracts ───────────→ shared
access-contracts ──────────→ shared
hooks-plugin ──────────────→ hooks-contracts, plugin-kit, core
access-plugin ─────────────→ access-contracts, plugin-kit, core
acl-permissions-plugin ────→ access-contracts, core
```

`hooks-contracts` and `access-contracts` are dependency-light non-plugin
packages. They contain protocol tokens and types only, install no behavior, and
are not imported by Core. Official implementations and community alternatives
share those identities without depending on one another.

`@ultimabase/plugin-kit` is the planned public authoring toolbox. It packages
reusable declaration builders, selectors, capability helpers, provenance-aware
composition helpers, Typegen descriptors, and diagnostics without weakening a
Core validation boundary. Core never imports it. Official plugins use the same
toolbox where it removes real duplication, while `@ultimabase/testing` owns
conformance fixtures and assertions.

`@ultimabase/typegen` is optional development tooling. It snapshots the final
compiled application graph and accepts owner-scoped plugin contributions as
references, structured declarations, or separately owned deterministic output.
It emits replaceable `.d.ts` contracts and deterministic non-executable metadata
only, before infrastructure connection; it never generates JavaScript or a
Runtime client. Core never imports Typegen, and JavaScript applications execute
the same compiled graph without generated artifacts.

Core retains request authority and generic protected constraint contracts. The
official Access plugin owns Access vocabulary and compilation; Runtime does not
install or name Access, ACL, role, authentication, or a community policy engine
when no such capability is present.

## Schema extensions

Core's Schema domain only knows the generic `SchemaExtension` and
`FieldExtension` contracts. Plugins contribute typed extension objects. The
current compatibility example below uses native `access`; after milestone 15
the same option exists only when `accessPlugin()` contributes its namespace:

```ts
Schema.define({
	className: 'Post',
	access: {
		read: true,
	},
	fields: (field) => ({
		title: field.string({
			access: {
				write: {
					fill: isEditor,
					replace: isEditor,
					clear: isEditor,
				},
			},
		}),
	}),
	extensions: [auditSchema({ category: 'content' })],
})
```

Each extension records its expected plugin without exposing that plugin's
configuration contract to Schema. During application initialization, Core
matches `schema:name` and `field:name` handler identities against the setup
owner. Missing or wrongly owned handlers fail before any infrastructure phase;
duplicate handlers follow the regular contribution conflict policy.

Plugins may also contribute new logical field kinds. Structural validation
plans retain the original immutable field definition by identity; the owning
plugin claims its namespaced kind and contributes validation and adapter
behavior without a second plugin-only plan representation.

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

Plugins form one deterministic graph. Nesting is configuration sugar:

```ts
graphqlYogaPlugin({
	plugins: [apolloSandboxPlugin()],
})
```

The child is still registered globally. Dependencies determine setup order,
then configuration position breaks ties. Teardown uses the reverse order. Every
plugin has one stable namespaced ID and may have an explicit instance ID; the
same plugin can be configured several times only through distinct instance
identities.

Each plugin definition contains a static manifest with its structured identity,
package and Core compatibility, requested privileges with reasons, environment
claims, provided and required capability tokens, and replacement intent. An
application may deny privileges globally, by plugin ID, or for an exact
instance. The default console logger reports every plugin and requested power,
then one typed diagnostic aggregates denials before declarations, Typegen,
setup, connections, Runtime, or transports can produce effects.

Plugins are trusted in-process Node.js code. Privileges govern UltimaBase-owned
facades and make powers inspectable; separate environmental claims describe
direct filesystem, network, process, or native-code behavior that Core cannot
verify. Neither mechanism is an operating-system sandbox. Critical privileges
include complete schema or Runtime replacement, raw adapter access, Typegen
replacement, and authority elevation. Master credential verification and grant
creation remain Core-owned and cannot be manufactured by transport input.

Versioned capabilities replace public architectural string slots. A `single`
capability accepts one provider, a `multiple` capability accepts independent
providers, and a `pipeline` capability composes handlers. Tokens also distinguish
pure `declaration` values from resource-backed `application` implementations
materialized during setup.

`PluginGraph` validates the combined normalized configuration again, resolves
required and present optional dependencies, rejects explicit conflicts and
cycles, and exposes one stable dependency-first order without initializing
plugins.

Each application owns its capability host and private resource store.
Plugin-scoped views attach the actual owner and instance to every declaration,
transform, middleware, constraint, codec, persistence rewrite, Typegen
contribution, event, and command. Plugin code cannot self-assert a different
owner.

Before application compilation, Core invokes each authorized plugin's
synchronous static declaration callback in dependency-first order. The public
host may add schemas, FieldBuilder methods and logical kinds, namespaced schema
or field options, immutable schema patches, model methods, custom operations,
query extensions, and Typegen descriptors. Cross-owner changes require an
explicit privilege. Declarations are pure, deterministic, and separated from
secrets, services, adapters, requests, clocks, and network state.

Developer declarations and authorized plugin contributions compile into one
immutable application graph with per-contribution provenance. Each plugin's
selectors observe the graph completed by earlier plugins and freeze targets
before that plugin's patches. Conflicts never silently use last-writer-wins. A
schema class may be reused by applications only when its final plugin surface is
compatible; otherwise compilation fails. Plugin-created schemas and
application-specific commands remain reachable through the application-owned
`ultimabase.schema(nameOrClass)` handle without mutating exported classes.

The existing `declareFields`, string slots, plugin service registry, and named
setup contribution registries are transitional inputs to this generalized host.
Milestone 14 replaces them without preserving duplicate public extension
mechanisms or unprivileged escape hatches.

The lifecycle manager first completes every setup callback, leaving a validation
boundary before infrastructure changes. It then runs connect, schema
preparation, runtime start, and transport start in graph order. Stop and dispose
run in reverse order, and a partial failure cleans every completed stage before
the original failure is reported.

`FrameworkApplication` owns those Core objects per instance.
Core's Runtime domain composes it behind the primary `UltimaBase` facade, whose
constructor performs no I/O and whose `start()` assembles Runtime before
starting infrastructure. The lower-level asynchronous factory remains
available to framework packages. Configured literal plugin names retain their
setup export types, including definitions introduced through nested composition.

## Engines

- `UltimaBase` is the regular application lifecycle and direct-query facade.
- `FrameworkEngine` belongs to one isolated application.
- `RequestEngine` carries one immutable request context and delegates every
  normalized operation to that application's pipeline.
- `RequestEngine.transaction()` creates a callback-scoped engine backed by one
  adapter transaction. It commits once, rolls back on failure, cannot escape
  its callback, and rejects nested transactions until savepoints are explicit.
- Every root mutation will automatically enter that adapter boundary before
  business hooks execute. Hook-started writes through the supplied engine share
  the primary mutation's commit or rollback. Reads remain non-transactional
  unless the developer opens an explicit transaction.
- Exact schema identity prevents a request engine from accepting definitions
  owned by another application, even when class names match.
- Optional `AsyncLocalStorage` scopes derive every current-context reference
  from one explicitly injected `RequestEngine`; nested and concurrent requests
  never share mutable global state.
- Generated schema classes expose canonical object-input `findOne`, `findMany`,
  `get`, `count`, and `exists` reads whose execution resolves only when called.
- `QueryBuilder<TSchema>` and `QueryScope<TSchema>` optionally compose reusable,
  selection-preserving object inputs without retaining execution state.
- Generated schema classes own explicit `createOne`/`createMany`,
  `updateOne`/`updateMany`, `upsertOne`/`upsertMany`, and
  `deleteOne`/`deleteMany` commands. Their canonical object-shaped `where`
  inputs normalize into the same
  Operation AST and Runtime bridge as reads. Reads and writes reuse the exact
  active request and hook lease, or accept `{ ultimabase }` outside a scope. No
  process-wide application singleton, request, authority, transaction, or
  adapter enters the Query AST.
- `ultimabase.operation(tokenOrName).execute(input)` resolves stable or dynamic
  custom operations through the same RequestEngine. It works in JavaScript
  without Typegen; generated declarations narrow known tokens and literal names.
- `ultimabase.schema(nameOrClass)` returns an application schema handle.
  Application-conditional schema commands and query extensions live on that
  handle, while instance-like commands use an immutable model handle. Exported
  schema classes and prototypes are never mutated per application.

ADR-0109 and issue 339 replace the former schema instance plus plain-result
split with one class returned by `Schema.define()`. The class is the registered
schema identity, exposes schema-root reads and writes, constructs immutable drafts, and
materializes immutable persisted results after Runtime restrictions. Issue 349
adds instance commands that delegate to Query and Runtime; instances never
retain adapters, mutate records, or track dirty state. ADR-0132 makes Query
read-only, moves collection writes to the generated class, and makes every
singular mutation return a complete model allowed by Access.

The Query AST retains the exact static schema definition and represents
selection, filtering, ordering, and pagination as immutable discriminated
nodes. It contains no request, GraphQL, SQL, adapter, or execution state;
transports normalize into it and adapters compile it behind Runtime contracts.

The current source implements Hooks as a native Runtime lifecycle. ADR-0189
accepts its migration to `@ultimabase/hooks-plugin`, which will own the typed
schema and field options, dispatcher, phases, diagnostics, and recursion rules
through public capabilities. Its official implementation preserves the
existing operation-family typing, deterministic contribution order,
transaction behavior, and developer hooks; applications may omit it entirely
or install a community alternative with a different authoring experience.

Hook callbacks are retained through private Schema-domain capabilities keyed by
exact declaration identity. They never enter field options, extensions,
validation plans, schema hashes, or migration metadata. The official Hooks
capability reads those declarations after extraction; without an installed
Hooks capability, Core creates no neutral hook stage.

Runtime does not name ACL, roles, authenticated users, ownership, or another
concrete policy domain. After milestone 15, the official Access plugin compiles
its schema and field declarations plus provider policies into `operation`,
`filter`, `item`, and `field` decisions. It lowers those decisions into Core's
generic protected `guard`, `constraint`, `restrictInput`, `restrictSelection`,
and `restrictOutput` primitives. Guards may only deny, adapter constraints
accumulate with logical `AND`, and field restrictions only narrow. Protected
state remains separate from transformable operations so later middleware cannot
broaden it. With no Access capability, Core installs no default decision or
placeholder callback; master authority remains independently available.

During migration, the existing Runtime hook factories remain the compatibility
implementation beside native declarations and policy-neutral enforcement. The
official plugins must replace that private coupling with public capability
middleware before native surfaces are removed. Runtime reads immutable dependency-first
snapshots and composes them with developer hooks. Schema `resolveInput`
transforms mutation input; grouped before- and after-operation hooks observe
complete mutation values and have ignored return values. After-operation items
are complete persisted models independently of public result selection.
Business after-hooks may still abort before commit, while `HookContext.emit()`
buffers externally visible event data until commit succeeds. Schema transaction
hooks and their duplicate result journal are not part of the public lifecycle.

Mutation transformers complete before one final structural revalidation and
value-dependent policy reevaluation. Low-level `beforeOperation()` is also an
observer; only the target-aware `preparedOperation()` boundary may replace
normalized logical values. Core then derives a separate physical persistence
plan. A plugin with `persistence:rewrite` may replace that plan—for example,
soft delete may write tombstone fields—but the logical delete still determines
Hooks, Access, audit, relationship, and result semantics. Protected constraints
remain outside the replaceable plan. Prepared adapters lock with the initial
protected request, then receive the final plan and cumulative constraints for
the actual write so a later restriction cannot remain only in Runtime memory.

One schema handler may cover a full create, update, upsert, or delete family;
reads expose Query options and Access rather than schema hooks. Public
collection commands become ordered singular operations before Runtime invokes
native hooks, so item-oriented callbacks receive cardinality-free `create`,
`update`, `upsert`, or `delete` kinds. Early operation Access and callbacks that
explicitly expose the normalized AST may still observe an exact singular
terminal such as `update-one`. Update and delete batches declare one unique
target per item. Missing targets, hook failures, and persistence
failures reject and roll back the complete outer transaction; partial success
is not public. Handler lists execute sequentially. Runtime rejects dangerous
same-hook recursion and offers no general `skipHooks` bypass.

The normalized operation remains temporarily visible to relation-aware schema
hooks because relation handles do not yet materialize connect, disconnect, and
replace actions as model values. This exception is transport-neutral and does
not expose adapters.

Runtime's structural validation stage caches Schema's compact create/update
plans, traverses structured values, and delegates scalar snapshots and
constraints back to the declared field contract. Every mutation receives one
application-timezone clock instant for defaults and automatic timestamps.
Validation remains mandatory for master requests and precedes permissions and
business hooks. The framework-owned `id` is generated there as a UUID v7 from
the same instant before an adapter receives a create branch.

Core authority modes are `anonymous` and `master`. Request sources such as
`rest`, `graphql`, `job`, or `internal` are metadata, not authority modes.
`RequestContext` correlates authority with immutable request identity, source,
safe metadata, identity-based capability tokens, and typed values contributed
by plugins. Authentication, sessions, and user schemas are optional plugin
capabilities rather than Core concepts. Public context derivation cannot select
master mode. Runtime verifies raw master credentials into framework-owned
opaque grants, audits their use, and creates master engines without retaining
the credential in request state.

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

Persisted object ACL is one optional provider for this plugin lifecycle. Its immutable
value stores public, authenticated, exact schema-qualified principal, and
schema-qualified role grants for `read`, `update`, and `delete`. The reserved
ACL field itself is visible and mutable only under trusted master execution;
ordinary object update grants never authorize ACL management.
The ACL package consumes an optional neutral current-principal resolver and the
separate neutral role resolver; it never imports a concrete authentication or
roles plugin. Missing identity fails closed while applications using only
public and audited master behavior require neither provider.

The `acl()` schema extension owns row-aware defaults and shared create/update
input resolution through public capability middleware. `aclPlugin()` owns
monotonic Access contributions and declares master bypass. Core Runtime has no
ACL stage or subject vocabulary. PostgreSQL stores one indexed JSONB ACL document
on each protected row and combines its opaque containment constraint with every
other predicate in one statement. This physical representation requires no
ACL-specific join and remains private to the adapter. The optional
`@ultimabase/acl-postgres-plugin` package owns the concrete compiler bridge so
neither the database-neutral ACL provider nor PostgreSQL imports the other.
Subject-owning providers independently choose `fail`, `preserve`, or `cascade`
deletion behavior. ACL publishes neutral principal and role cleanup
contributions, then uses a private asynchronous maintenance scope to add an
opaque exact-subject constraint to ordinary read execution. PostgreSQL lowers
that constraint to indexed JSONB containment. Cascade derives every rewritten
ACL from the locked current row and performs singular updates inside the
subject deletion transaction, preserving unrelated grants and rolling all
schemas back together on failure.
ACL observes complete schema mutation materializations and queues one typed
structured-diff event for post-commit delivery.
This observer never participates in authorization, emits nothing on rollback,
and is not published by realtime or transport plugins by default.

The official schema Access surface is the generalized class-level permission
system, and its field Access surface controls field disclosure and mutation.
ACL is an optional persisted per-object provider. Roles and authentication
supply optional typed subject capabilities and grant nothing by themselves.
The Access plugin contains no built-in ACL, user, owner, or role rule. Each
declaration or provider decides whether audited master authority bypasses its
own policy; Core Runtime has no permission-specific bypass branch. A community
Access engine may expose different syntax while using the same protected
constraint contracts.

The official and alternative policy engines share protocol identity from
`@ultimabase/access-contracts`; Hooks engines use
`@ultimabase/hooks-contracts`. Importing either contracts package installs no
engine. A public transport without a compatible policy engine remains supported
but emits `UNPROTECTED_PUBLIC_TRANSPORT` unless its configuration explicitly
acknowledges unprotected exposure.

## Database and migrations

Drizzle and PostgreSQL imports exist only inside PostgreSQL packages.

Without a migration plugin, `postgresPlugin` follows a configurable schema policy: `override`, `fail`, or `ignore`.

With `postgresMigrationPlugin`, startup schema preparation is claimed by the migration plugin. It owns `_ultimabase_schema`, migration history, snapshots, SQL generation, destructive policies, and drift detection.

Persisted schemas, fields, indexes, codecs, and physical contributions retain
their plugin and instance owner, package and protocol version, stable
contribution ID, and normalized static options in snapshots and migration
plans. Plugin upgrades contribute explicit logical migration intent. Removing a
plugin produces orphaned provenance and never implies an automatic drop;
destructive cleanup remains an explicit migration decision whose artifact can
be reviewed after the plugin package is absent.

## HTTP and GraphQL

- HTTP servers are plugins. The first implementation is Hono on Node.js.
- REST converts requests to Operation AST and never queries PostgreSQL directly.
- `graphqlCorePlugin` generates and executes a `GraphQLSchema` without a network server.
- `graphqlYogaPlugin` mounts GraphQL over HTTP and installs GraphQL Core automatically if needed.
- Custom Nexus, Pothos, or other schemas are accepted as `GraphQLSchema` instances and merged with the generated schema.

## Further reading

See [`docs/adr/`](docs/adr/README.md) for decision records and [`docs/concepts/`](docs/concepts/README.md) for detailed contracts.
