# ADR-0244: Contextual field builders and virtual results

- Status: accepted
- Date: 2026-09-09
- Refines: ADR-0140, ADR-0161, ADR-0165, ADR-0175, ADR-0187, ADR-0196, ADR-0198, ADR-0207, ADR-0213
- Depends on: ADR-0140, ADR-0161, ADR-0165, ADR-0175, ADR-0187, ADR-0196, ADR-0198, ADR-0207, ADR-0213

## Context

UltimaBase currently presents one familiar family of field factories at a
schema root and inside `field.object({ fields })`. The embedded callback already
removes pointers, relations, and auto-incrementing integers because those
features require schema or column identity. It still inherits other root-field
options, such as portable `indexed`, even when Core cannot give them embedded
occurrence semantics. Generated plugin options likewise have one shared field
augmentation, so autocomplete can advertise behavior whose provider never
compiled an embedded path.

The same ambiguity would become worse for an output-only virtual value. Reusing
`field.string()` or `field.object()` as its type would offer defaults,
immutability, indexes, generators, input Hooks, and mutation validation even
though the value is resolved after persistence and is never accepted as input.
A TypeScript omission alone would not protect JavaScript, stale generated
declarations, schema patches, or replacement compilers.

Applications also need fields derived from persisted values and request-local
identity without storing redundant data. These values must work through direct
queries, mutation results, eager inclusions, REST, and GraphQL. Restoring the
removed field `resolveOutput` Hook would mix optional Hooks lifecycle with a
Core schema result contract. Resolving them in a transport would instead split
direct, REST, and GraphQL behavior. Treating them as database-generated columns
would make one adapter authoritative and would not support `RequestContext`.

The contract must therefore separate declaration capabilities by context and
add virtual fields at Core's logical result boundary. It must also constrain
asynchronous collection resolution so one query cannot create an unbounded
fan-out.

## Decision

### Four declaration contexts

Core recognizes four closed field declaration contexts:

| Context    | Meaning                                                        |
| ---------- | -------------------------------------------------------------- |
| `stored`   | One top-level logical schema field with persistence and inputs |
| `embedded` | One value property stored inside a parent object field         |
| `virtual`  | One top-level schema result field resolved by Core             |
| `output`   | One value descriptor nested below a virtual field              |

These context names describe schema semantics, not a database implementation.
They are validated during source declaration capture, canonical application
compilation, schema patching, and replacement-compiler output decoding.
Unsupported methods and options are rejected; Core never removes or ignores
them silently.

The ordinary root `FieldBuilder` remains the `stored` builder. Its existing
scalar, object, pointer, and relation methods and all valid storage, input,
index, generation, and installed plugin options remain available.

`EmbeddedFieldBuilder` remains the callback argument for
`field.object({ fields })`, including recursively nested objects. Its Core
built-ins are value scalars and objects. It retains portable occurrence
semantics already executed by Core: `description`, `required`, `list`,
`default`, `immutable`, temporal `autoNow`, structural normalization, and
installed input, validation, Hook, or Access options that explicitly support
embedded occurrences. It excludes:

- pointer and relation methods;
- `indexed`, because a property of one logical value is not a portable schema
  index target;
- integer and bigint `autoIncrement`, because a sequence requires a dedicated
  column;
- system-only `generatedOn`; and
- every plugin method or direct field option that did not explicitly declare
  embedded support.

An adapter-specific JSON-path index may later use a database-owned direct
option with explicit embedded support. Core's portable `indexed` option does
not imply it. This refines ADR-0165, whose previous adapter-late rejection of
nested portable index metadata is no longer considered truthful autocomplete.

`field.virtual` is available only on the stored root builder and creates a
field in the `virtual` context. Its Core declaration keys are `output`,
`select`, `resolve`, and optional `description`. It accepts only installed
direct field options that explicitly support virtual fields. In particular,
the official Access option may support `virtual`; the mutation-only Validation
option and input-only Hooks option may not. Stored-field `required`, `list`,
`default`, `immutable`, `indexed`, `autoNow`, `autoIncrement`, PostgreSQL
metadata, pointer, and relation options are invalid on the virtual wrapper.
Nullability and list shape belong to `output`.

### OutputBuilder describes values without fields

The required `output` callback executes once during the enclosing schema field
declaration and receives an `OutputBuilder`:

```ts
displayName: field.virtual({
	output: (output) => output.string({ nullable: false }),
	select: { firstName: true, lastName: true },
	resolve: ({ item, context }) => {
		const principal = context.getValue(authenticatedPrincipal)

		return principal?.id === item.id
			? `${item.firstName} ${item.lastName}`
			: item.firstName
	},
})
```

The callback returns one immutable output descriptor, not a `FieldDefinition`.
It is captured exactly once like an embedded object callback and is never
replayed by Typegen, an application, a resolver invocation, or a transport.

Every output descriptor accepts:

- `nullable?: boolean`, defaulting to `true`;
- `list?: boolean`, defaulting to `false`; and
- `description?: string`.

`nullable` applies to the described value or list container. List elements are
non-null and use the descriptor's scalar or object element shape, matching the
existing one-dimensional field-list contract. `undefined` is never a valid
resolved value. A nullable descriptor resolves to its value or canonical
`null`.

The builder exposes Core's string, boolean, int, float, bigint, decimal, UUID,
date, time, date-time, binary, JSON, enum, and object value kinds. Decimal
precision and scale, temporal timezone, enum values and `typeName`, and object
`typeName` remain available because they define logical validation or wire
representation. It exposes no pointer or relation descriptor in v1.

`output.object({ fields })` recursively provides the same `OutputBuilder`:

```ts
summary: field.virtual({
	output: (output) =>
		output.object({
			typeName: 'UserSummary',
			nullable: false,
			fields: (output) => ({
				label: output.string({ nullable: false }),
				score: output.int({ nullable: false }),
			}),
		}),
	select: { firstName: true, lastName: true, score: true },
	resolve: async ({ item }) => ({
		label: `${item.firstName} ${item.lastName}`,
		score: item.score,
	}),
})
```

Every declared object property is present in the resolved object. Its own
descriptor determines whether its value may be `null`. Undeclared properties,
missing properties, invalid scalar values, mutable lists, and mutable objects
fail Core's structural output snapshot.

Output descriptors never accept defaults, required-create presence,
immutability, indexes, generators, input Hooks, mutation validators, Access,
columns, storage codecs, or migration metadata. Access applies to the enclosing
virtual field as one independently selectable logical field; v1 does not add
per-property Access inside one virtual output object.

Plugins may contribute an output builder method or descriptor option only with
explicit `output` support and a logical snapshot sufficient for Core. Stored or
embedded support never implies output support. An output contribution has no
storage codec requirement, but each exposed transport still requires the
field owner to provide its existing exact nominal wire protocol codec. Missing
REST or GraphQL compatibility rejects that transport during application
compilation as it does for stored plugin fields.

### Plugin declarations state supported contexts

Every plugin-owned FieldBuilder method and direct field option declares a
non-empty immutable subset of `stored`, `embedded`, `virtual`, and `output`.
Schema-scoped options are unchanged. Context support is part of the static
declaration, owner provenance, compiler IR, Typegen snapshot, and application
fingerprint.

A plugin method supplies an exact factory and structured Typegen descriptor for
each supported builder context. Reusing one factory in several contexts is
legal only when its definition passes each context's Core validation. A stored
field factory is never automatically converted into an output descriptor.

Typegen emits a method or direct option only on its declared contextual builder
or virtual options interface. JavaScript and stale declarations pass through
the same application-local context checks. Missing owners, ambiguous plugin
instances, unsupported contexts, invalid factory results, and conflicting
declarations fail before plugin setup or infrastructure effects.

Official field options adopt these initial contexts:

| Option or method               | Contexts                                          |
| ------------------------------ | ------------------------------------------------- |
| Hooks `hooks` field option     | `stored`, `embedded`                              |
| Validation `validation` option | `stored`, `embedded`                              |
| Access `access` field option   | `stored`, `embedded`, `virtual`                   |
| PostgreSQL `postgres` option   | `stored`                                          |
| PostgreSQL vector field method | contexts explicitly proven by its concrete issues |

The vector method is not granted output or embedded behavior merely because it
already owns logical, storage, REST, and GraphQL codecs. Issue 2504 must prove
each additional context it chooses to declare.

### Virtual selection is logical; dependencies are private

`select` is required and reuses ADR-0140's flat boolean syntax. At least one
`true` selects those named dependencies, an all-`false` object selects every
eligible persisted field except those named, an empty object selects every
eligible persisted field, and `id` is always retained and cannot be false.

Dependency selection may name persisted scalar or object fields and stored
pointer identities. A selected pointer remains its immutable `Pointer`; it
does not load the target. Relation fields, virtual fields, nested selections,
and `include` are invalid. A resolver that needs no field beyond identity uses
`select: { id: true }` rather than an empty selection.

The caller's public logical selection and the adapter's physical persisted
selection are distinct:

1. Core normalizes the caller's public selection, including virtual names.
2. Protected selection enforcement authorizes or removes each logical output
   field. An explicitly forbidden virtual selection fails like an explicitly
   forbidden stored selection; a forbidden field in a complete selection is
   omitted.
3. Core unions the caller-visible persisted selection with the declared
   dependencies of every requested and permitted virtual field. Duplicate
   dependencies are loaded once.
4. The adapter receives only that persisted selection and cannot observe a
   virtual field name or resolver.
5. Core structurally snapshots the persisted superset, retains private
   dependency views, and removes dependency-only fields before any public
   result behavior can observe them.
6. Core resolves virtual values from the private views, validates them, and
   adds only requested and permitted virtual outputs to the logical result.

Private dependency loading is trusted application computation, not caller
field selection. A dependency may therefore be unavailable as a public field
under Access while still being visible to the application-owned resolver of an
independently authorized virtual field. When the caller also requests that
persisted field, its ordinary field Access still applies. Dependencies never
appear in `toJSON()`, `get()`, a transport response, an output behavior, an
error payload, or diagnostics containing values unless independently selected
and authorized.

A resolver is responsible for any information it deliberately derives from a
private value. Resolver conditions may vary presentation by context, but they
are not authorization. Denying the field belongs to Access or another
monotonic protected policy.

An absent or empty caller selection continues to mean the complete visible
result and therefore requests every virtual field not removed by Access. A
caller avoids its resolution with ordinary exclusion, for example
`select: { expensiveScore: false }`.

### Resolver input and output

Core invokes one requested virtual resolver once per materialized item. Its
contract is:

```ts
type VirtualFieldResolver<TItem, TValue> = (input: {
	readonly item: Readonly<TItem>
	readonly context: RequestContext
}) => MaybePromise<TValue>
```

`item` contains exactly the virtual field's declared dependency projection plus
canonical `id`. It does not grow when the caller selects other fields or when
another virtual field requires more dependencies. The object, nested objects,
lists, Pointers, and binary values are immutable snapshots with the same
canonical logical representations as persisted query results.

`context` is the exact application-bound `RequestContext` used by the
operation. It exposes its real anonymous or Master mode, source, request ID,
safe metadata, cancellation signal, capabilities, and typed plugin-owned
values. A transport cannot supply a shaped context or manufacture values,
application ownership, or Master provenance.

The resolver receives no Query, schema handle, application, engine, adapter,
transaction, policy state, credential, grant, or transport object. Normal
JavaScript closure capture remains possible and trusted application code may
start an ordinary nested query, but the resolver contract grants no bypass or
raw persistence capability.

Resolvers may return a direct value or `PromiseLike` value. Core awaits it,
checks cancellation before and after invocation, and structurally validates
and freezes the result through the declared output descriptor. The optional
Validation plugin is mutation-input-only and is not replayed on virtual output.

The callback executes through Core's application-bound Runtime callback
executor. An inline developer declaration has application ownership. A
plugin-added or replaced virtual field executes under its exact plugin and
optional instance identity for the complete asynchronous lifetime. The
callback descriptor includes schema and field identity, so recursively
resolving the same virtual field in one active callback chain fails through the
existing Runtime recursion boundary.

Arbitrary resolver exceptions follow the ordinary safe Runtime and transport
error boundary. Invalid resolved values use Core's existing result
`VALIDATION_ERROR` contract with private schema and field diagnostics. Core
does not retry a resolver. It creates no cross-item or cross-request cache and
does not serialize a resolved value into schema or migration state.

### Asynchronous collections use fixed bounded batches

Core assigns every requested resolver occurrence a logical ordinal: result
item order first, then schema field declaration order. It processes consecutive
batches containing at most 16 invocations. Invocations inside one batch may run
concurrently; Core waits for every started invocation in that batch to settle
before starting another batch.

If several invocations in one batch fail, Core reports the failure with the
lowest logical ordinal. No later batch starts. Already-started callbacks are
allowed to settle so no rejected Promise escapes the operation. Cancellation
is checked before each batch and after each callback; a canceled operation
starts no further callbacks and reports the ordinary cancellation error. A
resolver should pass `context.signal` to cancellable external work.

The ceiling of 16 is Core-owned and not configurable in v1. Resolver order of
completion and side effects is not a public contract. Resolvers are output
derivation, must not be used as Hooks or durable effect delivery, and receive
no retry or exactly-once promise. A later batching or loader API requires a
separate proven contract; applications may currently place their own
request-scoped loader behind a typed context value.

The same operation-local scheduler covers the root projection and every eager
pointer or relation target projection it materializes. Nested queries started
deliberately by application code remain ordinary independently bounded Runtime
operations. Result array order never changes.

### Persisted items and public outputs become distinct types

The generated schema contract separates the complete persisted item from the
complete public result shape:

- `SchemaItem<TSchema>` remains the selection-independent persisted logical
  item and excludes virtual fields;
- new `SchemaOutput<TSchema>` represents the complete caller-visible result and
  includes persisted result fields plus virtual fields;
- `SchemaResult<TSchema>` and Query projection inference use
  `SchemaOutput<TSchema>` by default;
- mutation candidates, adapter records, Hooks items, Access transitions,
  protected constraints, persistence plans, and virtual resolver dependency
  inputs continue to use `SchemaItem<TSchema>` explicitly.

Typegen adds an output shape and separate persisted-field and selectable-field
sets to `SchemaTypeInfo`. Create, update, nested create/update, where, orderBy,
numeric update, relationship, index, and persistence contracts derive from the
persisted set. Public `select` and result projection derive from the selectable
output set. This prevents a generated declaration from promising a virtual
field to a Hook or adapter that never materializes it.

The output descriptor determines the resolver return type before Typegen.
Before a generated registry exists, dependency keys use the safe flat bootstrap
selection and resolver items use `BaseItem`. After Typegen, the exact selected
persisted item replaces that fallback and the return remains the descriptor's
exact value or `PromiseLike` value. Typegen emits no callback body, closure,
loader, or executable helper.

### Runtime order and mutation atomicity

For every root or eager target result projection, Core preserves this order:

1. normalize and enforce the public logical selection, including virtual field
   Access;
2. derive the private persisted dependency selection;
3. execute the ordinary protected persistence plan;
4. structurally snapshot the complete persisted superset;
5. separate private dependency views from the caller-visible persisted result;
6. run existing projected database-result behavior only on the permitted public
   persisted result;
7. hydrate requested pointer and relation inclusions, each with its own target
   policy and virtual projection;
8. resolve and structurally validate requested virtual fields through the
   operation-local bounded scheduler;
9. run existing materialized result behavior on the complete logical public
   result;
10. structurally snapshot replacements and apply final monotonic output
    restrictions;
11. commit a mutation, then deliver post-commit effects.

Schema mutation Hooks continue to observe complete persisted
selection-independent items and never receive virtual fields. Virtual
resolution occurs after mutation outcome and business after-Hooks but before
commit. A resolver throw, rejection, cancellation, invalid output, Access
failure, result behavior failure, or final output failure therefore rolls back
the complete automatic mutation transaction, including nested writes and
buffered events. Reads retain the existing no-automatic-transaction rule.

`deleteOne` and collection deletion projections may resolve from the persisted
returning preimage retained inside the active transaction. Virtuals selected on
eager target results use that target schema's own declaration, Access,
dependencies, resolver, and output descriptor; a parent never lends authority
or dependencies to a target.

### Persistence and transports remain representational

Virtual fields are logical selectable output fields. They are absent from
database field plans, columns, indexes, constraints, synchronization,
introspection, migration snapshots, migration diffs, storage codecs, physical
rewrites, raw adapters, and private plugin storage. Changing only a virtual
resolver, dependency selection, or output descriptor creates no database
schema drift.

PostgreSQL compiles only the private persisted selection supplied by Core and
returns canonical logical dependency values. It never recognizes, executes,
filters, orders, or caches a virtual field.

REST exposes virtual fields in response metadata and reuses the existing flat
selection syntax and field wire encoders. GraphQL exposes them on model output
types and normalizes selected fields into the same Core selection. GraphQL
object shapes come from output object descriptors; custom named type
composition retains its existing conflict rules. Neither transport places a
virtual in mutation inputs, `where`, `orderBy`, relation arguments, or nested
write inputs. Neither transport executes the resolver itself.

## Consequences

- Developers see only options that the current declaration context can execute.
- Embedded objects keep their familiar map-returning syntax while portable
  nested index metadata is removed rather than rejected late by PostgreSQL.
- Virtual fields behave consistently in direct, included, mutation, REST, and
  GraphQL results without storing redundant values.
- Context-aware asynchronous values are possible without unbounded collection
  fan-out or transport-local resolvers.
- Private dependencies can support safe derived presentation without becoming
  public selection or weakening the virtual field's independent Access.
- Generated types distinguish persisted truth from caller-visible output, while
  JavaScript execution remains independent from Typegen.
- Core gains output descriptor and resolution responsibilities but no concrete
  plugin, database, HTTP, REST, GraphQL, or Yoga dependency.

## Rejected alternatives

### Reuse ordinary FieldBuilder definitions as output types

This advertises defaults, indexes, generation, mutation Hooks, and storage
options that an output value cannot execute. Filtering those options only in
TypeScript would leave JavaScript and compiler replacements inconsistent.

### Add `dependsOn` beside a separate result type

The existing `select` vocabulary already expresses inclusive and exclusive
flat projections, supplies implicit identity, and has generated typing. A new
dependency syntax would duplicate it without enabling a current behavior.

### Give every resolver the complete loaded item

This defeats projection, makes resolver behavior depend on unrelated caller
selection, and broadens access to values the declaration did not request. Each
resolver receives only its own declared private view.

### Restore field `resolveOutput`

ADR-0161 deliberately limits field Hooks to input resolution. A virtual field
is a Core result declaration with explicit dependencies, typing, persistence
absence, and transport representation, not an optional Hook phase.

### Resolve fields in REST or GraphQL

Transport-local resolution would give direct Query, REST, and GraphQL different
semantics and would let a transport bypass Core Access, cancellation,
transaction, attribution, and output validation.

### Use unbounded `Promise.all` or sequential collection resolution

Unbounded execution can exhaust external services or database pools. Fully
sequential resolution makes independent asynchronous outputs unnecessarily
slow. Fixed ordered batches give a finite ceiling and deterministic failure
selection without adding a speculative public scheduler API.

### Store or push down virtual values

Generated columns, views, SQL expressions, expression indexes, or materialized
values cannot observe the request context and require database-specific
contracts. They may be designed separately as stored or physical plugin
features.

## Non-goals

- Virtual-to-virtual dependencies or dependency cycles.
- Nested dependency selection or eager relationship traversal inside a virtual
  declaration.
- Virtual `where`, `orderBy`, unique targets, indexes, constraints, or database
  pushdown.
- Pointer or relation output descriptors.
- Cross-request caching, Runtime-owned DataLoader, public batching, or
  configurable resolver concurrency.
- Resolver side-effect, retry, exactly-once, post-commit, or event semantics.
- Generated Runtime code or a generated client.
- A compatibility alias for invalid embedded or stored-field output options.
