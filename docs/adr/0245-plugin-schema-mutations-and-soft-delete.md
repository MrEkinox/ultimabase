# ADR-0245: Plugin-defined schema mutations preserve logical identity

- Status: accepted
- Date: 2026-09-10
- Refines: ADR-0188, ADR-0192, ADR-0193, ADR-0200, ADR-0225, ADR-0232, ADR-0233, ADR-0240
- Depends on: ADR-0188, ADR-0190, ADR-0191, ADR-0192, ADR-0193, ADR-0200, ADR-0205, ADR-0206, ADR-0207, ADR-0225, ADR-0232, ADR-0233, ADR-0240

## Context

Core already has two adjacent extension paths, but neither represents the
requested operation.

Plugin operations may target an application, schema, or model. Their arbitrary
input and result contracts are useful for login, status, and other domain APIs,
and their owner handler deliberately receives a `RequestEngine` plus leased
adapter access. A schema or model operation executes through that operation
handler; it does not become an item-oriented schema mutation with Core-owned
target loading, Access, Hooks, structural candidate validation, a canonical
persistence plan, or mutation materialization. Protocol-1 operation transport
bindings and ADR-0240 planning therefore accept application-targeted operations
only.

Separately, `ApplicationRequestExecutor.executeMutation()` accepts the closed
native create, update, upsert, and delete schema-command union. These commands
own the complete canonical mutation pipeline, but adding `softDelete`,
`publish`, `approve`, or another product name to that Core union would make the
kernel and every transport grow one branch per plugin feature. Encoding an
explicit soft delete as a nested native update would instead invoke update
Access and update Hooks, losing the logical operation the developer requested.

The official soft-delete plugin needs both contracts:

- replace mode keeps native logical delete while writing a tombstone through
  ADR-0200's physical rewrite;
- explicit mode is a distinct singular logical mutation with its own Access and
  Hooks identity, application model commands, and REST and GraphQL operations;
- restore and purge are private Master-only schema mutations;
- every mode needs protected visibility and tombstone writes without requiring
  the optional official Access or Hooks engine.

The solution must remain generic enough to prove a community workflow mutation,
but it must not expose the complete engine, add a mutable registry, or design an
open-ended action language for hypothetical consumers.

## Decision

### Schema mutations are a narrow operation specialization

Core adds `defineSchemaMutation()`. It creates a nominal immutable
`PluginSchemaMutationDefinition` and reuses the existing canonical namespaced
operation name, exact SemVer, `defineOperationValue()` input contract, declared
public plugin errors, and owner provenance. It does not change the semantics of
`defineOperation()` or broaden the existing plugin-operation handler.

The protocol-1 definition has these exact logical properties:

```ts
const archiveMutation = defineSchemaMutation({
	authority: 'request',
	effect: 'update',
	errors: ['community.workflow.archive-rejected'],
	input: defineOperationValue(snapshotArchiveInput),
	name: 'community.workflow.archive',
	returning: 'after',
	select: { workflowState: true },
	version: '1.0.0',
})
```

- `name` and `version` form the canonical operation identity.
- `input` validates and snapshots only the operation-specific payload. The
  target ID, result selection, inclusion, context, and authority are not input.
- `errors` is the complete public `PluginError` vocabulary.
- `authority` is `request` or `master`. `request` accepts the caller's real
  anonymous or Master context and participates in an installed policy engine.
  `master` rejects every non-Master context before target lookup.
- `effect` is `update` or `delete`. Protocol 1 has no create, upsert, relation,
  bulk, arbitrary adapter, or custom physical statement.
- `returning` is `before` or `after` for update. Delete requires `before`.
- `select` is an optional flat persisted dependency selection for the owner
  effect resolver. Core always retains `id` and separately loads fields required
  by protected constraints, policy, Hooks, and the public result.

The source token privately retains its input snapshot callback. The compiled
application descriptor, schema compiler IR, Typegen snapshot, transport plan,
diagnostics, and persistence plan contain only inert facts and nominal identity;
they never serialize or expose that callback.

A mutation definition is not active merely because a module exported it. Its
owner declares it under `operation:declare`, supplies one application-lifetime
effect resolver, and attaches it to frozen schema targets through the existing
`model:extend` registrar using a distinct `schemaMutations` map:

```ts
models.extend(Post, {
	contributionId: 'workflow-mutations',
	schemaMutations: {
		archive: {
			mutation: archiveMutation,
			surfaces: ['schema', 'model'],
		},
	},
})
```

The map key is the developer-facing command name and the policy and lifecycle
key. It must be a safe TypeScript property and GraphQL field-name component.
Core rejects command collisions across native handles, schema commands, model
commands, query extensions, other schema mutations, and reserved object
properties. A mutation may target several frozen schemas, but one schema may
bind one command name to exactly one definition and owner. `surfaces` is a
non-empty subset of `schema` and `model`; a model surface accepts persisted
models only.

This separate map is intentional. Existing `schemaCommands` and `modelCommands`
remain arbitrary plugin operations with their existing handler, transaction,
and adapter contracts. A command cannot claim mutation semantics merely by
using a familiar method name.

### Application handles own the direct call surface

Typegen projects each compiled mutation onto its exact application schema and
model handles. JavaScript reads the same graph dynamically. The schema form is:

```ts
await ultimabase.schema(Post).archive(
	{
		id: postId,
		input: { reason: 'superseded' },
		select: { title: true, workflowState: true },
	},
	{ context },
)
```

The bound persisted-model form omits `id` because the immutable model already
owns it. When the operation payload type is `undefined`, generated declarations
omit the `input` property, so soft delete remains concise:

```ts
await ultimabase.schema(Post).softDelete({ id: postId })
await ultimabase.schema(Post).for(post).softDelete()
```

Both forms accept the existing operation-wide cancellation, explicit context,
and trusted server `useMasterKey` options. They never contain a raw key, grant,
adapter, transaction, or engine. Draft, foreign, stale, disposed, wrong-schema,
and tombstoned model targets fail before owner callbacks.

Schema mutation results use the existing schema selection and eager inclusion
contracts rather than an arbitrary operation result codec. `id` is always
retained. The definition's `before` or `after` rule fixes which logical record
is selected, materialized, restricted, and returned across every entry path.

### The effect resolver is narrower than a plugin-operation handler

The mutation owner contributes one application-lifetime effect resolver under
the same exact definition and owner. It receives immutable values only:

```ts
schemaMutationHandler({
	mutation: archiveMutation,
	resolve: async ({ context, input, originalItem, target }) => ({
		data: { workflowState: 'archived' },
	}),
})
```

The input contains the real `RequestContext`, validated operation payload,
exact schema and ID, and immutable privately selected original item. It contains
no `RequestEngine`, adapter access, authority grant, protected constraint,
transaction control, lifecycle facade, application object, or transport value.
Queries started through ordinary public schema APIs inherit the active request
scope and root transaction exactly like Hook-started work.

An update resolver returns one plain `data` object. Protocol 1 permits direct
replacement values for persisted, non-relationship fields contributed by the
same exact plugin instance as the mutation. Core rejects system fields,
developer-owned fields, fields owned by another plugin, virtual fields,
pointers, relations, nested writes, arithmetic expressions, unknown fields, and
empty effects. It structurally snapshots complete replacement values without
running caller-input defaults, generators, field `resolveInput`, application
validators, or native update Hooks. A delete resolver returns no data.

This owner-only rule is the smallest safe write authority proven by the
soft-delete use case. A future workflow mutation may update state that its own
plugin contributed. Updating arbitrary developer fields or relationship graphs
needs a separate accepted refinement with field-policy and validation semantics.

Both effect kinds require `persistence:rewrite`. `operation:declare` authorizes
the logical operation, `model:extend` authorizes the handle surface, and neither
silently grants physical writes. Delete effects additionally require
`authority: "master"` in protocol 1. A plugin cannot use this contract to add a
public hard-delete synonym.

### Core retains one generic logical discriminant

Core represents every execution with one product-neutral logical envelope:

```text
kind: plugin-schema-mutation
definition identity + command name + schema + id
validated payload + selection + inclusion
```

`softDelete`, `restore`, `purge`, `archive`, and future names never become Core
operation kinds. Generic Runtime behavior and protected policy match the stable
discriminant plus exact definition identity when needed. The native
`OperationKind` union remains the native Query and CRUD vocabulary; official
engines project application-specific authoring keys from the compiled mutation
surface rather than extending that union globally.

Protocol 2 of the persistence-plan boundary separates this logical identity
from its physical statement. Native plans retain their existing behavior.
Plugin schema mutations compile only to an ordinary physical `update-one` or
`delete-one` target with Core-owned query, selection, materialization phase,
protected row filter, opaque constraints, and provenance. Adapters learn no
custom operation name and cannot call its resolver. Official adapters must
advertise protocol-2 support before an application containing schema mutations
starts.

The owner resolver returns an effect, not a persistence plan. Core validates the
effect, constructs the plan, appends provenance, and retains the protected
execution envelope outside plugin-visible state. Persistence rewriters may
observe the logical schema-mutation identity only through the generic protocol
and cannot change its target, returning phase, constraints, or effect family.

### Runtime order is fixed

One singular plugin schema mutation runs in the following order inside one
automatic transaction:

```text
bind context, schema, mutation, ID, cancellation, and authority
→ snapshot payload and normalize selection/inclusion
→ initial Core structural validation
→ initial protected policy and optional operation Access
→ load and lock the target with accumulated row restrictions
→ resolve the owner effect from the immutable original item
→ structurally validate the owner-only update candidate
→ protected-policy and optional item Access re-evaluation
→ plugin/global before observers
→ optional schema beforeOperation.<command>
→ compile the physical plan with protected constraints
→ database operation
→ materialize the declared before/after record
→ optional schema afterOperation.<command>
→ plugin/global after behavior and final output restrictions
→ beforeCommit
→ commit
→ afterCommit and post-commit events
```

The target query uses the exact ID, the mutation owner's protected filters, and
every other accumulated monotonic policy. Missing and policy-hidden targets
share Core's existing non-disclosing object-not-found failure. The target stays
locked through effect resolution, persistence, Hooks, and commit.

The effect resolver runs before value-dependent Access so the custom operation's
item rule may inspect both `originalItem` and the structurally valid final
`item`; a delete effect supplies `item: null`. Before Hooks receive the same
selection-independent pair and validated payload. After Hooks receive the
persisted pair. Neither engine sees or can replace the physical plan.

A physical update does not replay native update Access, input resolution,
validation, Hooks, observers, or events. A physical delete does not replay
native delete Access or Hooks. Failure or cancellation at any pre-commit phase
rolls back the effect and all nested database work. Post-commit failures retain
the existing committed-result semantics.

### Access discovers application-specific mutation keys

Core adds no Access stage or option. The optional official Access package reads
the inert compiled mutation surface through a versioned generic capability and
augments only `authority: "request"` commands:

```ts
access: {
	softDelete: {
		allow: ({ context, input }) => context.has('editor'),
		where: { locked: { eq: false } },
		item: ({ originalItem, item }) => item?.isDeleted === true,
	},
}
```

The rule shape reuses the existing `allow`, `where`, and `item` stages but its
input also carries the exact mutation payload and canonical definition identity.
It is independent from update and delete. An allowed update cannot grant soft
delete, and an allowed soft delete cannot grant hard delete.

A boolean `accessPlugin({ default: true | false })` applies to native and
application-specific operations. The granular default gains
`schemaMutations?: boolean`; omission is `false`. An exact schema mutation rule
overrides that configured base decision, after which compatible provider rules
can only narrow it through logical AND. Master bypasses the complete official
Access engine as before. `authority: "master"` mutations do not appear in the
Access authoring surface because no Access rule can grant them to another
authority.

Direct Access options temporarily retain application-specific branches as
opaque declarations, then validate them against the final compiled mutation
surface before setup effects. JavaScript, stale Typegen, disabled mutations,
unknown commands, and malformed rules therefore fail deterministically rather
than being ignored. Typegen and language-service tests project only the keys
present on that exact schema.

Without `accessPlugin()`, no official Access option or stage exists. Core
structural validation, the definition's Master requirement, protected policies,
transactions, and database integrity still run.

### Hooks discovers the same keys without owning execution

The optional official Hooks package reads the same inert surface and augments
the existing grouped lifecycle:

```ts
hooks: {
	beforeOperation: {
		softDelete: ({ context, input, originalItem, item }) => auditIntent(),
	},
	afterOperation: {
		softDelete: ({ context, input, originalItem, item }) => auditResult(),
	},
}
```

Every custom key is an observer or rejection point; it cannot transform input,
the owner effect, target, result, or plan. Existing `resolveInput`, create,
update, upsert, and delete branches remain native-only. Physical statement kinds
never select a Hook branch.

Hooks includes both request and Master-only schema mutations. This lets trusted
server code audit `restore` and `purge` through the same owner-attributed,
transactional before/after lifecycle. Master does not bypass business Hooks.
Compatible Hook providers may contribute against an exact mutation definition
and schema target through the public Hooks capability. Omitting `hooksPlugin()`
installs nothing and does not prevent execution.

Like Access, the direct Hooks option defers application-specific branch
validation until the mutation surface is final. Typegen emits only exact keys;
JavaScript and stale declarations receive the same Runtime rejection.

### Static planning and late execution remain separate

Operation transport protocol 1 remains application-operation-only. Core adds a
separate schema-mutation binding family under the same canonical
`OperationTransportProtocol` identity. A binding belongs to the mutation owner,
requires `transport:expose`, carries one owner-private payload wire codec, and
exposes deeply snapshotted transport-owned metadata. Core continues to own ID,
schema selection, result selection/inclusion, context, and authority.

ADR-0240's non-replaceable planner gains
`planSchemaMutations({ transport })`. It returns only mutations that have one
exact binding for that transport, grouped by exact compiled schema and command
name. Each descriptor contains schema name, command name, mutation name and
version, authority, effect, returning phase, public errors, owner, and inert
metadata. It contains no input snapshot callback, wire codec, effect resolver,
Access or Hook declaration, Runtime, application, adapter, constraint, context,
or authority object.

Unlike application operations, the developer does not maintain a second token
allowlist. Attaching a transport-bound mutation to a schema is the operation
owner's explicit exposure declaration, and enabling that application-owned
schema in a transport is the application's explicit exposure decision. A
mutation without a binding remains direct-only. Plugin-owned schemas remain
excluded from generated CRUD and schema-mutation routes under the existing REST
and GraphQL rules.

After engine construction,
`ApplicationRequestExecutor.exposeSchemaMutations({ transport })` returns the
matching immutable executable allowlist. A transport must compare it with its
static plan before serving work. Execution accepts only a descriptor from that
allowlist plus the real route-selected schema, ID, wire payload, selection,
inclusion, and `RequestContext`. It decodes under the mutation owner and enters
the generic Runtime path. `executeMutation()` remains the closed native CRUD
facade and `exposeOperations()` remains application-operation-only.

Generated schema-mutation exposure uses Core's existing unverified public
protection diagnostic. Bindings, schema enablement, and transport exposure grant
no authority. A wire payload cannot select Master, another schema, mutation,
handler, adapter, plan, or context.

### REST and GraphQL derive schema-local operations

REST generates one route for every planned mutation on an application-owned
schema whose effective REST configuration exposes mutations. Protocol 1 fixes:

```text
POST /api/v1/classes/{Schema}/{id}/{command-kebab-case}
```

The body is the existing bounded JSON mutation envelope with optional `input`,
`select`, and `include`; `input` is omitted for an `undefined` payload. Success
returns `{ result }`. The binding metadata supplies a complete declared-error to
HTTP-status map. Route, native CRUD, and application-operation collisions fail
with provenance before startup. REST never exposes Master-only definitions.

GraphQL generates one mutation field for every planned request-authority
definition on an exposed application schema:

```graphql
softDeletePost(input: { id: ID! }): Post
```

The field name is the command name followed by the generated model name. A
non-unit payload appears under `input.data` using the owner binding's closed
input types. GraphQL selection and eager relationship decoding use the existing
schema result contract. Root field, input, output, support-type, and custom
schema collisions fail during application capability materialization. The
resolver accepts only `{ request: RequestContext }` and executes the matching
late-bound descriptor. GraphQL never exposes Master-only definitions.

REST and GraphQL interpret only their canonical binding metadata and wire
codec. Neither package imports, identifies, or contains a branch for soft
delete. Networkless GraphQL and Yoga use the same resolver and Runtime path.

### The official soft-delete schema contract is fixed

The official package is `@ultimabase/soft-delete-plugin`. It depends on public
Core, Plugin Kit, and Shared foundations only. It does not import, install, or
require the official Access, Hooks, REST, GraphQL, Yoga, PostgreSQL, or audit
packages.

Its configuration is:

```ts
softDeletePlugin({ defaultMode: 'disabled' })

const Post = Schema.define({
	className: 'Post',
	softDelete: 'explicit',
	fields: (field) => ({ title: field.string() }),
})
```

`defaultMode` is optional and defaults to `disabled`. It accepts `disabled`,
`replace-delete`, or `explicit`. The direct application-schema option accepts
`false`, `replace-delete`, or `explicit`. Omission inherits `defaultMode` and
`false` always disables. There is no plugin `schemas` option. The default and
direct option apply to application-owned schemas only; plugin-owned schemas are
not silently patched.

Every enabled schema receives one plugin-owned stored field:

```ts
isDeleted: field.boolean({ default: false, required: true })
```

The field name and false/true representation are fixed in v1. A field, option,
or contribution collision fails application compilation; the plugin never
adopts an existing developer field. The field is a selectable boolean so an
explicit mutation result can report its postimage, but it is omitted from every
caller-controlled create, update, upsert, bulk, nested-write, REST, and GraphQL
input. A protected final mutation guard rejects stale or untyped attempts.
Plugin-owned effects remain the only write path.

One protected monotonic policy adds `isDeleted = false` to ordinary reads,
counts, exists checks, relationship traversal, eager targets, and mutation
target lookup. It applies with no Access or Hooks engine and cannot be removed
by developer predicates, business callbacks, rewriters, or Master. The policy
recognizes only the exact plugin-owned restore and purge definitions to replace
its own filter with `isDeleted = true`; this does not remove any other policy or
constraint and does not create a public include-deleted query.

Removing the plugin leaves its physical contribution as orphaned provenance.
Direct synchronization and future migrations do not infer a destructive column
drop or data rewrite.

### Replace and explicit modes have different logical semantics

`replace-delete` contributes ADR-0200's native delete-one and itemized
delete-many persistence rewrite:

```text
logical delete → physical update isDeleted = true → delete preimage result
```

Native delete Access, Hooks, observers, audit identity, errors, selection,
relation projection, batches, and transactions remain unchanged. Native update
behavior does not run. REST DELETE and GraphQL `delete{Schema}` keep their names
and contracts. The physical update does not fire database foreign-key deletion,
so pointers and relation memberships remain stored and become usable again
after restore; public behavior still observes the logical delete. Purge later
performs the physical delete and its configured referential actions.

`explicit` leaves native hard delete unchanged and attaches one request-authority
update mutation named `@ultimabase/soft-delete.soft-delete` under command
`softDelete`. Its owner effect sets only `isDeleted: true` and returns the
postimage. It therefore runs `access.softDelete`,
`beforeOperation.softDelete`, and `afterOperation.softDelete`, never native
update or delete Access and Hooks. Repeated execution sees no visible target and
returns the ordinary non-disclosing missing-object error.

The soft-delete package contributes canonical REST and GraphQL bindings for
that explicit definition. An exposed schema therefore gains
`POST /api/v1/classes/Post/{id}/soft-delete` and `softDeletePost`; replace and
disabled schemas do not. Hard delete on an explicit schema can remove only a
currently visible item. `softDeleteMany` is not part of v1.

### Restore and purge are private Master-only mutations

Every replace or explicit schema attaches schema-only `restore` and `purge`
commands. Both definitions use `authority: "master"`, have no REST or GraphQL
binding, and remain unavailable from model handles to avoid treating a retained
tombstoned result as ordinary active state.

`restore` locks an `isDeleted = true` target, sets the tombstone to false, and
returns the postimage. Its physical update preserves the ID, stored data,
pointers, and relation memberships. `purge` locks an `isDeleted = true` target,
returns its preimage, and performs an irreversible physical delete with the
database's ordinary integrity and referential actions.

The commands accept an existing application-provenanced Master context or the
trusted server `useMasterKey: true` option. A new elevation uses the existing
mandatory Master audit with a reason containing the custom mutation and schema;
an already-Master context does not manufacture a second elevation event.
Operation-level auditing belongs to optional `beforeOperation.restore`,
`afterOperation.restore`, `beforeOperation.purge`, and
`afterOperation.purge` Hooks or another generic Runtime observer. Core does not
add a soft-delete audit sink.

Anonymous, authenticated, forged, foreign, stale, and transport-derived
contexts fail before target lookup. Official Access does not expose restore or
purge rules because no rule may grant them; Master still does not bypass Hooks,
transactions, structural effect validation, protected integrity constraints,
or database constraints.

## Privilege and capability summary

The official plugin requests privileges only when its effective graph needs
them:

- `schema:declare` for the direct option, tombstone, and input-surface omission;
- `model:extend` and `operation:declare` for explicit and administrative
  mutation handles;
- `runtime:constrain` for visibility and protected tombstone writes;
- `persistence:rewrite` for replace mode and schema mutation effects;
- `transport:expose` only when at least one explicit mutation binding is active.

The plugin never requests `adapter:raw`, `runtime:replace`,
`authority:elevate`, filesystem, network, process, or native powers. Caller
Master authority is inherited, never created by the plugin.

Static definitions, schema surface descriptors, transport metadata, and Typegen
facts are declaration-lifetime values. Effect resolvers and wire codecs are
application-lifetime values invoked only behind Core's owner-attributed
callback executor. The generic Core planner and request executor remain
non-replaceable demand-installed capabilities.

## Consequences

- Community plugins gain one item-oriented mutation path without receiving the
  complete engine or expanding Core for each product operation.
- Existing arbitrary plugin operations remain available and deliberately retain
  their broader owner-controlled execution contract.
- Access and Hooks can expose exact application-specific keys while remaining
  optional packages outside Core.
- REST and GraphQL can compile schema-local operations before startup and still
  execute only a matching late-bound allowlist.
- The first official soft-delete plugin supports replace and explicit semantics
  without confusing physical updates with logical update operations.
- Tombstoned records and relationships remain recoverable until an explicit
  Master purge triggers physical deletion.
- Protocol-2 persistence support and deferred validation of dynamic Access and
  Hooks keys are deliberate cross-package costs of the new capability.

## Non-goals

- Adding product-specific operation names, Access stages, Hooks stages,
  transport routes, or tombstone logic to Core.
- Replacing application operations, native CRUD commands, or arbitrary schema
  and model commands with the new specialization.
- Plugin schema mutations that create, upsert, mutate developer-owned fields,
  change relationships, perform bulk or nested writes, return arbitrary payloads,
  or execute custom adapter statements.
- Public include-deleted or only-deleted queries, a general protected-policy
  bypass, or implicit Master behavior.
- Configurable tombstone names or values, deletion timestamps, deleter identity,
  reasons, cascade strategies, uniqueness reuse, partial indexes, retention,
  background jobs, automatic purge, or bulk restore and purge.
- REST or GraphQL restore and purge, `softDeleteMany`, nested soft delete,
  OpenAPI, SDK generation, administration UI, or backward-compatibility aliases.
