# Architecture

## System shape

```text
static schemas
      ↓
SchemaRegistry
      ↓
typed extensions + plugin declaration setup
      ↓
application-local relationship target graph
      ↓
Query / Operation AST
      ↓
compiled AccessPlan
      ↓
Runtime pipeline
      ↓
database adapter
      ↓
transport serialization and post-commit events
```

UltimaBase separates contracts, orchestration, and implementations inside one
foundational package:

- Core's `schema`, `query`, and `access` domains define data and authority contracts.
- Core's application domain owns plugins, services, lifecycle, and errors.
- Core's `runtime` domain executes CRUD, transactions, hooks, and policy-neutral enforcement effects.
- official plugins provide database, transport, HTTP server, migrations, and permission implementations.

## Package dependency graph

An arrow means “imports or depends on” and always points toward a foundation.

```text
core ─────────────────→ shared
pg-vector-plugin ─────→ core, shared
roles-plugin ─────────→ core
acl-permissions-plugin → core
postgres-plugin ──────→ core
acl-postgres-plugin ──→ acl-permissions-plugin, postgres-plugin, core
postgres-migrations-plugin → postgres-plugin, core
server-hono-plugin ───→ core
rest-plugin ──────────→ core
graphql-plugin ───────→ core
graphql-yoga-plugin ──→ graphql-plugin, core
testing ──────────────→ core, shared
```

Concrete plugins depend on Core's public contracts. Core never depends back on
concrete plugins.

The internal Access domain remains a neutral home for request-authority and
shared policy contracts. Runtime using those contracts does not install or
name ACL, role, authentication, or community-provider behavior.

## Schema extensions

Core's Schema domain only knows the generic `SchemaExtension` and
`FieldExtension` contracts. Plugins contribute typed extension objects:

```ts
Schema.define({
	className: 'Post',
	access: {
		read: true,
	},
	fields: {
		title: stringField({ access: { update: isEditor } }),
	},
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

Relationship fields retain zero-argument lazy schema callbacks as private field
capabilities rather than physical metadata. Declaration-only plugin setup may
register additional schemas. Core then resolves every callback by exact class
identity, freezes one application-local logical graph, and closes further
schema registration before `connect` or another infrastructure phase.

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

The child is still registered globally. Dependencies determine setup order, then configuration position breaks ties. Teardown uses the reverse order.

Plugins occupying mutually exclusive architectural roles declare the same
`slot`. Normalization rejects multiple definitions for slots such as
`database-adapter` before any plugin is initialized.

`PluginGraph` validates the combined normalized configuration again, resolves
required and present optional dependencies, rejects explicit conflicts and
cycles, and exposes one stable dependency-first order without initializing
plugins.

Each application owns its setup registries. Plugin-scoped views attach the
current plugin name to services, extension handlers, operators, hooks,
generators, transports, pipelines, events, and commands without trusting
plugin code to declare its own owner.

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

Hooks are a native Runtime lifecycle, not a plugin or schema extension. Schemas
declare precisely typed operation-family hooks, fields declare hooks over their
exact logical values, and plugins append contributions through the same
application-owned dispatcher. Plugin targets may be global, an exact schema, a
typed field path, an extension, or a namespaced field kind. Contributions never
replace developer hooks.

Hook callbacks are retained through private Schema-domain capabilities keyed by
exact declaration identity. They never enter field options, extensions,
validation plans, schema hashes, or migration metadata. Core's Runtime domain
reads those declarations internally; absent hooks create no neutral stage.

Runtime does not name ACL, roles, authenticated users, ownership, or another
concrete policy domain. Core's fundamental Access domain compiles native schema
and field declarations plus plugin-provided policies into `operation`,
`filter`, `item`, and `field` decisions. The compiler lowers those decisions
into the existing policy-neutral `guard`, `constraint`, `restrictInput`,
`restrictSelection`, and `restrictOutput` enforcement primitives. Guards may
only deny, adapter constraints accumulate with logical `AND`, and field
restrictions only narrow. Enforcement state remains separate from transformable
operations so later business hooks cannot broaden it. An application with no
Access declaration or provider follows its configured global default without
installing placeholder callbacks.

The existing Runtime hook factories remain the low-level implementation
foundation beside native declarations and policy-neutral enforcement. Core has
removed the legacy named permission stages and stores owner-scoped
contributions without executing them. Runtime reads immutable dependency-first
snapshots and composes them with developer hooks. Schema `resolveInput`
transforms mutation input; grouped before- and after-operation hooks observe
complete mutation values and have ignored return values. Business after-hooks
may still abort before commit, while externally visible event handlers run only
after commit succeeds.

Mutation transformers complete before one final structural revalidation and
value-dependent Access reevaluation. Low-level `beforeOperation()` is also an
observer; only the target-aware `preparedOperation()` boundary may replace
normalized update values. Prepared adapters lock with the initial protected
request, then receive the final operation and cumulative constraints for the
actual write so a later restriction cannot remain only in Runtime memory.

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

## Access control

Access is a fundamental Core lifecycle with four neutral levels:

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

Persisted object ACL is one optional provider for this lifecycle. Its immutable
value stores public, authenticated, exact schema-qualified principal, and
schema-qualified role grants for `read`, `update`, and `delete`. The reserved
ACL field itself is visible and mutable only under trusted master execution;
ordinary object update grants never authorize ACL management.
The ACL package consumes an optional neutral current-principal resolver and the
separate neutral role resolver; it never imports a concrete authentication or
roles plugin. Missing identity fails closed while applications using only
public and audited master behavior require neither provider.

The `acl()` schema extension owns row-aware defaults and shared create/update
input resolution through generic extension-targeted hooks. `aclPlugin()` owns
monotonic Access contributions and declares master bypass. Runtime has no ACL
stage or subject vocabulary. PostgreSQL stores one indexed JSONB ACL document
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

Native schema Access is the generalized class-level permission system, and
native field Access controls field disclosure and mutation. ACL is an optional
persisted per-object provider. Roles and authentication supply optional typed
subject capabilities and grant nothing by themselves. Core Access contains no
built-in ACL, user, owner, or role rule. Each native declaration or provider
decides whether audited master authority bypasses its own policy; Runtime has no
permission-specific bypass branch.

## Database and migrations

Drizzle and PostgreSQL imports exist only inside PostgreSQL packages.

Without a migration plugin, `postgresPlugin` follows a configurable schema policy: `override`, `fail`, or `ignore`.

With `postgresMigrationPlugin`, startup schema preparation is claimed by the migration plugin. It owns `_ultimabase_schema`, migration history, snapshots, SQL generation, destructive policies, and drift detection.

## HTTP and GraphQL

- HTTP servers are plugins. The first implementation is Hono on Node.js.
- REST converts requests to Operation AST and never queries PostgreSQL directly.
- `graphqlCorePlugin` generates and executes a `GraphQLSchema` without a network server.
- `graphqlYogaPlugin` mounts GraphQL over HTTP and installs GraphQL Core automatically if needed.
- Custom Nexus, Pothos, or other schemas are accepted as `GraphQLSchema` instances and merged with the generated schema.

## Further reading

See [`docs/adr/`](docs/adr/README.md) for decision records and [`docs/concepts/`](docs/concepts/README.md) for detailed contracts.
