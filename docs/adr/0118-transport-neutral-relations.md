# ADR-0118: Transport-neutral pointers and relations

- Status: accepted
- Date: 2026-08-03
- Refines: ADR-0004, ADR-0005, ADR-0055, ADR-0063, ADR-0109, ADR-0115, ADR-0116

## Context

UltimaBase needs typed object relationships before role storage, REST, or
GraphQL can use them. Defining relationships in a transport or database plugin
would split validation, Access, hooks, and developer inference across several
execution paths. Embedding related collections directly in object rows would
also make pagination, filtering, referential integrity, and large collections
unreliable.

Parse distinguishes single-object pointers from queryable relations. Prisma
separates logical relations from their physical foreign keys and supports
explicit relationship models. Keystone distinguishes one-sided and two-sided
relationships and exposes connect, disconnect, and set operations. UltimaBase
adopts these useful boundaries without copying a transport-specific API.

## Decision

Pointers and relations are foundational `@ultimabase/core` schema, Query, and
Runtime concepts. They work through `UltimaBase` and a database adapter without
REST or GraphQL. Transports may translate their inputs into the same public
contracts later, but Core owns no route, resolver, DataLoader, or transport ID
format.

### Schema references

Relationship targets are lazy schema-class references. Application setup
resolves them against its own registered schema set after declarations finish,
which permits precisely typed circular declarations without evaluating a
target during module initialization. Foreign, missing, ambiguous, or invalid
targets fail before infrastructure starts.

### Pointers

`pointerField` declares one target object. Its ordinary model value is an
immutable nominal `Pointer<TSchema>` containing target identity without
auto-loading the target. `new Pointer(TargetSchema, id)` is the general
constructor, while a schema convenience may create the same value.

Pointer fields never use `list: true`. One-to-one storage uses a unique pointer.
Referential actions are explicit as `restrict`, `cascade`, or `setNull`, with
`restrict` as the safe default. A database plugin maps this logical contract to
its own foreign-key representation.

A pointer can produce a normal target Query. Query also supports immutable,
selection-aware pointer inclusion. Inclusion is initially limited to pointers;
to-many relationships remain independently paginated rather than being hidden
inside an unbounded parent result.

### Relations

`relationField` declares a queryable to-many relationship and never an embedded
array. An owning relation creates adapter-managed relationship storage. An
inverse relation uses `mappedBy` to reference one exact pointer or relation
field on its target and creates no duplicate storage.

This represents one-to-many relationships through an inverse pointer and
many-to-many relationships through one owning relation plus an optional
inverse. One-to-one relationships use a unique pointer.

Persisted models expose a typed immutable `Relation<TSource, TTarget>` handle
through `model.relation(fieldName)`. The handle builds a normal target Query
with an adapter-private relationship scope and exposes `connect`, `disconnect`,
`set`, and `clear` mutations. It does not expose join rows or mutable collection
state.

If a relationship itself owns application data such as position, timestamps,
or status, the developer declares an ordinary schema with two pointer fields.
Hidden join-table metadata is not part of `relationField`.

### Query, Access, and lifecycle

Relation scopes are immutable private Runtime constraints. Business Query hooks
cannot inspect, replace, or remove them. Related reads enforce the source
field's read policy and the target schema's complete Access pipeline. Missing
and inaccessible targets have the same observable result.

Pointer writes use the normal field update path. Relation mutations use the
existing update lifecycle and automatic transaction boundary, expose a typed
relation delta to compatible hooks, and obey field update policy. Updating an
inverse pointer relation executes the corresponding target pointer mutation,
including its validation, Access, and hooks.

Core Query may add portable `some`, `none`, and `every` relation predicates.
They are Query AST nodes rather than GraphQL operators, so every transport and
adapter observes the same semantics.

### PostgreSQL representation

`@ultimabase/postgres` compiles pointers to foreign keys and owning relations
to deterministic join tables. Join storage has composite uniqueness and
indexes in both directions. Deleting a source or target may cascade its join
rows, but relation storage never implicitly deletes the related objects.

Physical constraint, column, and join-table names remain PostgreSQL concerns.
Core metadata contains only logical targets, ownership, inverse mapping, and
referential behavior.

## Consequences

- Relations can be tested end to end with only Core and PostgreSQL.
- REST, GraphQL, jobs, hooks, and application code share one relationship
  model and one security boundary.
- Models remain small and predictable because to-many values are not loaded or
  inferred as ordinary object properties.
- Circular schema declarations require application-time target resolution and
  precise diagnostics.
- Database adapters must explicitly advertise and implement pointer, relation,
  inclusion, predicate, and mutation capabilities.
- Batched transport loading and nested to-many pagination remain transport
  optimizations above the Core contract.
