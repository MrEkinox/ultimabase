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

ADRs 0186 through 0205 define this package boundary. Core contains no native Hooks or Access product implementation; the official vertical packages and community alternatives use the same public kernel.

## Package dependency graph

An arrow means “imports or depends on” and always points toward a foundation.

```text
core ─────────────────→ shared
plugin-kit ───────────→ core, shared
typegen ──────────────→ core, shared
pg-vector-plugin ─────→ plugin-kit, core, shared
roles-plugin ─────────→ plugin-kit, core
acl-permissions-plugin → plugin-kit, core
postgres-plugin ──────→ plugin-kit, core
acl-postgres-plugin ──→ acl-permissions-plugin, postgres-plugin, plugin-kit, core
testing ──────────────→ typegen, core, shared
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
hooks-plugin ──────────────→ plugin-kit, core, shared
official Hooks extensions ─→ hooks-plugin, plugin-kit, core, shared
access-plugin ─────────────→ plugin-kit, core, shared
official Access providers ─→ access-plugin, plugin-kit, core, shared
acl-permissions-plugin ────→ plugin-kit, core, shared
```

Official Hooks and Access contracts live in their respective plugin packages.
Importing either package does not install it. Official-compatible extensions
and providers import those public contracts, while independent alternatives own
their protocols and use the generic kernel directly.

`@ultimabase/plugin-kit` is the public authoring toolbox. It binds stable package
manifest facts, parses strict immutable plugin options, builds common additive
schema patches, flattens operation-provider wrappers, and groups nominal Typegen
references without weakening a Core validation boundary. Destructive
transformations, capabilities, privileges, ownership, registries, adapters, and
Master remain direct Core contracts. Core never imports the kit. Official
plugins use the same toolbox where it removes real duplication, while
`@ultimabase/testing` owns runner-agnostic conformance fixtures and assertions.
Its optional generic Typegen check explains the dependency on Typegen; the
baseline kernel suite remains logical-only and opens no PostgreSQL resource.

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
`FieldExtension` contracts. Plugins contribute typed extension objects. For
example, `access` is recognized only when `accessPlugin()` contributes its
namespace to the compiled application graph:

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

A plugin scalar with a portable versioned JSON storage codec receives exact
complete-value equality and membership through the ordinary Query AST. Core
snapshots operands with the field validator and adapters reuse the storage
codec. Ordered, string, structural, and domain-specific operators require a
separate accepted contract; codec availability alone never implies them.

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
required and present optional dependencies, validates non-ordering plugin peers,
rejects explicit conflicts and cycles, and exposes one stable dependency-first
order without initializing plugins. A peer proves exact identity and semantic
compatibility only; it grants no capability read or lifecycle guarantee.

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
schema class may expose different handle surfaces in independent applications;
conflicting declarations within one application fail before setup. Plugin-created
schemas and application-specific commands remain reachable through the
application-owned `ultimabase.schema(nameOrClass)` handle without mutating
exported classes or recording process-global compatibility state. Models
returned through an application are transparent immutable views of the original
schema instance: generated plugin commands are directly callable on the result,
while ownership, command lookup, and disposal remain local to that application.

Complete logical compilation crosses one versioned callback-free IR. Portable
facts remain visible, while schema classes and Runtime-bearing field, extension,
and option artifacts use nominal references owned by one private application
session. The canonical compiler and a compatible privileged replacement consume
the same request; Core never runs a hidden canonical pass before replacement and
always revalidates the returned graph before publishing it.

Milestone 14 removed string slots, the plugin service registry, and generic
named setup contribution registries. Versioned capabilities are the only public
cross-plugin host; concrete Hooks and Access contracts live in their vertical
packages, while Core retains exact privilege-scoped facades only for generic
Runtime, persistence, and constraint mechanisms.

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

Core owns the logical operation pipeline, structural validation, generic
behavior composition, protected monotonic constraints, transactions,
cancellation, persistence plans, result materialization, and post-commit
observer boundaries. It installs no concrete behavior or policy engine.

`@ultimabase/hooks-plugin` owns the official schema and field `hooks` option
namespaces, callback context, lifecycle phases, event delivery, diagnostics,
ordering, and recursion semantics. It contributes complete product behavior
through `runtimeBehaviorCapability`. Omitting it allocates no hook dispatcher,
snapshot, or placeholder stage. A community alternative may own a different
authoring protocol and use the same generic capability.

`@ultimabase/access-plugin` similarly owns the official `access` namespaces,
policy compilation, provider protocol, diagnostics, and Runtime behavior. ACL
does not depend on that product: it contributes Core `protectedPolicy()` values
and adapter constraints directly. Roles and authentication may supply optional
request subjects but grant nothing by themselves.

The low-level `beforeOperation()`, `afterOperation()`,
`preparedOperation()`, and `postCommitEvent()` factories are generic Runtime
contributions, not native schema Hooks. Their inputs use immutable
`RequestContext`. Core executes such callbacks through a product-neutral
cancellation and recursion boundary; concrete plugins may add stricter
lifecycle contexts internally.

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
The ACL package consumes an optional neutral current-principal resolver and the
separate neutral role resolver; it never imports a concrete authentication or
roles plugin. Missing identity fails closed while applications using only
public and audited master behavior require neither provider.

The `acl()` schema extension owns row-aware defaults and shared create/update
input resolution through public capability middleware. `aclPlugin()` owns an
independent monotonic protected policy and declares master bypass. It does not
depend on the official Access package. Core Runtime has no ACL stage or subject
vocabulary. PostgreSQL stores one indexed JSONB ACL document
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
ACL is an optional persisted per-object policy that composes through Core's
generic protected constraint boundary. Roles and authentication
supply optional typed subject capabilities and grant nothing by themselves.
The Access plugin contains no built-in ACL, user, owner, or role rule. Each
declaration or provider decides whether audited master authority bypasses its
own policy; Core Runtime has no permission-specific bypass branch. A community
Access engine may expose different syntax while using the same protected
constraint contracts.

Official-compatible Access providers import public contracts from
`@ultimabase/access-plugin`; independent policy engines use the generic kernel
directly and own their protocol identity. Official-compatible Hook extensions
follow the same model with `@ultimabase/hooks-plugin`. A public transport without
a compatible policy engine remains supported but emits
`UNPROTECTED_PUBLIC_TRANSPORT` unless its configuration explicitly acknowledges
unprotected exposure.

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
