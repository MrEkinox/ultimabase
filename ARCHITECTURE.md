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

ADRs 0186 through 0205 define this package boundary. Core contains no built-in
Hooks or Access product implementation; the official vertical packages and
community alternatives use the same public kernel.

## Package dependency graph

An arrow means “imports or depends on” and always points toward a foundation.

```text
core ─────────────────→ shared
plugin-kit ───────────→ core, shared
typegen ──────────────→ core, shared
hooks-plugin ─────────→ plugin-kit, core, shared
access-plugin ────────→ plugin-kit, core, shared
validation-plugin ────→ plugin-kit, core, shared
pg-vector-plugin ─────→ plugin-kit, core, shared
roles-plugin ─────────→ access-plugin, plugin-kit, core, shared
acl-permissions-plugin → plugin-kit, core, shared
postgres-plugin ──────→ plugin-kit, core, shared
http-plugin ──────────→ plugin-kit, core, shared
server-hono-plugin ───→ http-plugin, plugin-kit, core, shared
rest-plugin ──────────→ http-plugin, plugin-kit, core, shared
password-auth-plugin ─→ http-plugin, plugin-kit, core, shared
graphql-plugin ───────→ plugin-kit, core, shared
graphql-http ─────────→ core, shared
graphql-yoga-plugin ──→ graphql-http, http-plugin, graphql-plugin, plugin-kit, core, shared
graphiql-plugin ──────→ graphql-http, http-plugin, plugin-kit, core, shared
apollo-sandbox-plugin → graphql-http, http-plugin, plugin-kit, core, shared
testing ──────────────→ typegen, core, shared
```

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

The HTTP package delivered by milestone 23 owns application IDs, an
application-lifetime Fetch route graph, anonymous
request-context resolution, safe pre-dispatch failures, and the explicitly
enabled audited Master header boundary without opening a socket. The Hono
package supplies the optional server lifecycle. The REST package owns
deterministic application-local REST v1 route metadata, the direct schema
option, schema-aware read and mutation normalization, response encoding, route
dispatch, and logical delegation through Core's narrow application request
executor. Password Auth owns its typed
User identity, owner-private credential and session records, authentication
operations, and HTTP session integration through the HTTP package's public
resolver and endpoint capabilities.
`graphql-plugin` compiles one application-local generated and custom schema,
accepts ordered plugin-owned schemas through its own multiple capability, and
executes bounded documents with an exact application-bound `RequestContext`.
It remains network-independent.
`graphql-http` publishes one provider-neutral application capability containing
the selected GraphQL HTTP path. Yoga provides it, while the optional GraphiQL
and Apollo Sandbox plugins consume it without depending on Yoga. Explorer
bootstrap pages use only HTTP's reserved application path; every non-explorer
application request remains header-selected. Yoga, REST, Hono, and HTTP
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
the transports never name `softDelete`, `restore`, or `purge`.

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
session verifiers that must participate in typed transactions and migrations
without becoming application schemas. Private collections remain outside
Query, Typegen, generated transports, Hooks, Access, application validators,
Runtime observers, and events. The critical `storage:private` privilege grants
one plugin instance access only to its own declarations and never exposes a raw
adapter or another authority mode. ADR-0235 applies that boundary to Password
Auth while keeping its public User as an ordinary typed plugin-owned schema.

ADR-0226 keeps browser preflight outside application selection. One HTTP server
provider has one effective browser policy, and applications sharing that
provider must request structurally identical policies. The HTTP plugin owns
safe failures before route dispatch; REST, GraphQL, and other protocols own
only failures raised after their handler begins.

ADR-0228 fixes the experimental REST v1 surface under `/api/v1`. Application-owned
schemas may declare the direct `rest` option, sparse declarations inherit the
REST plugin default, and plugin-owned schemas remain private from generated CRUD
routes. Short class paths normalize simple GET parameters or explicit complex
POST bodies into the existing Query and Operation AST. REST returns stable
`result`, `results`, `count`, `exists`, and error envelopes, uses limit and
offset pagination without response metadata, and preserves atomic itemized bulk
execution.

Official Hooks, Access, and Validation contracts live in their respective plugin
packages. Importing a package does not install it. Official-compatible plugins and
providers import those public contracts, while independent alternatives own
their protocols and use the generic kernel directly.

`@ultimabase/plugin-kit` is the public authoring toolbox. It binds stable package
manifest facts, parses strict manual or synchronous Standard Schema plugin
options into immutable objects, builds common additive
schema patches, flattens operation-provider wrappers, and groups nominal Typegen
references without weakening a Core validation boundary. Destructive
transformations, capabilities, privileges, ownership, registries, adapters, and
Master remain direct Core contracts. Core never imports the kit. Official
plugins use the same toolbox where it removes real duplication, while
`@ultimabase/testing` owns runner-agnostic conformance fixtures and assertions.
Its optional generic Typegen check explains the dependency on Typegen; the
baseline kernel suite remains logical-only and opens no PostgreSQL resource.
The types-only `@standard-schema/spec` dependency is owned only by packages that
parse Standard Schema contracts, including Plugin Kit and the optional Validation
plugin. Core has no direct dependency on it.

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

## Direct plugin options

Core accepts schema and field options only when an installed plugin contributes
their typed contracts to the compiled application graph. For example, `access`
is recognized only when `accessPlugin()` contributes its option definitions:

```ts
import { accessPlugin } from '@ultimabase/access-plugin'
import { Schema, UltimaBase } from '@ultimabase/core'

const Post = Schema.define({
	className: 'Post',
	access: {
		read: true,
	},
	fields: (field) => ({
		title: field.string(),
	}),
})

const ultimabase = new UltimaBase({
	plugins: [accessPlugin()],
	schemas: [Post],
})
```

Each used direct option resolves against one exact definition contributed by an
installed plugin without exposing that plugin's implementation to Schema.
During application initialization, Core validates and normalizes the value
under its definition owner. Missing, ambiguous, or wrongly owned definitions
fail before any infrastructure phase; duplicate definitions become an error
only when an occurrence needs an exact owner.

Developer-authored options declare structured public Typegen references.
Factory-owned compiler markers instead declare `typegen: false`: Core retains
their validation, ownership, provenance, and plugin requirement while generated
authoring types omit their internal names.

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
include complete schema or Runtime replacement, raw adapter access, and
authority elevation. Core exposes no filesystem, network, or Typegen replacement
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
facts remain visible, while schema classes and Runtime-bearing field and option
artifacts use nominal references owned by one private application
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
contributions, not built-in schema Hooks. Their inputs use immutable
`RequestContext`. Core executes such callbacks through a product-neutral
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
The ACL package consumes an optional neutral current-principal resolver and the
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

See [`docs/adr/`](docs/adr/README.md) for decision records and [`docs/concepts/`](docs/concepts/README.md) for detailed contracts.
