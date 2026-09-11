# ADR-0247: Relation fields own contextual read filters

- Status: accepted
- Date: 2026-09-11
- Refines: ADR-0118, ADR-0154, ADR-0156, ADR-0157, ADR-0158, ADR-0160, ADR-0207, ADR-0218, ADR-0227, ADR-0238
- Depends on: ADR-0118, ADR-0154, ADR-0156, ADR-0157, ADR-0158, ADR-0160, ADR-0196, ADR-0206, ADR-0207, ADR-0218, ADR-0227, ADR-0231, ADR-0238

## Context

A relation currently describes physical membership and lets each read add its
own target `where`. This is sufficient when every caller wants a different
subset, but it duplicates application rules when one relation consistently
represents a narrower view. Examples include published comments, active
memberships, or a participant collection that omits the authenticated user.

A schema-root target filter cannot express this accurately. The same `User`
schema may be reached through `participants`, `otherParticipants`, `reviewers`,
and unrelated root queries with different intended subsets. Repeating the
condition in direct Query calls, REST handlers, GraphQL resolvers, or read Hooks
would create several observable contracts and make omission easy.

Drizzle relational queries can compile nested target predicates, but making
Drizzle own the declaration would give PostgreSQL behavior that Core, another
adapter, relation handles, predicates, REST, and GraphQL cannot reproduce. The
filter must be a Core relationship concept and reach adapters only after
request context, structural validation, and policy boundaries are known.

The feature must also distinguish application-owned shaping from authorization.
A relation filter can narrow one traversal but cannot prevent the same target
from being read through another field or root query. Access, ACL, and protected
constraints remain responsible for security.

## Decision

### Relation fields accept one `where`

The stored root `relation` field accepts an optional `where` beside `target`,
`mappedBy`, and its existing options. It has two forms:

```ts
comments: field.relation({
	target: 'Comment',
	where: {
		published: { eq: true },
	},
})
```

The static form is the ordinary canonical `WhereInput` for the exact target
schema. The contextual form is:

```ts
type RelationWhereResolver<TTarget extends SchemaDefinition> = (input: {
	readonly context: RequestContext
	readonly where: WhereBuilder<TTarget>
}) => WhereInput<TTarget> | WhereBuilder<TTarget>
```

For example:

```ts
participants: field.relation({
	target: 'User',
	where: ({ context, where }) => {
		const principal = context.getValue(authenticatedPrincipal)

		return principal === undefined ? where : where.ne('id', principal.userId)
	},
})
```

The supplied builder starts empty, is immutable, and is bound to the exact
target schema. The resolver may instead return a canonical target input. It
must return a value; an empty builder or empty object means no additional
restriction for that context. `undefined`, `null`, a foreign builder, a mutable
or malformed input, and a `PromiseLike` result fail before database work.

The callback is deliberately synchronous. Request context lookup does not
require asynchronous work, while asynchronous relation planning would invite
network or database I/O before one read can be prepared and would complicate
grouped eager inclusions. The function receives no source item, source field
values, Query executor, application, engine, adapter, transaction, credential,
authority grant, transport request, or mutable context.

`where` is used rather than `defaultWhere`. Within a relation declaration it
describes the field's target subset, and unlike a conventional default it cannot
be replaced by the caller.

### Source declarations remain Runtime truth

Static inputs are structurally snapshotted and normalized only after the target
name resolves in the complete application graph. A later mutation of the source
object cannot change the relation. The compiled schema representation retains
only immutable callback-free facts and, for a static form, its portable
normalized expression.

A contextual declaration retains its executable function privately beside the
source field definition. Callback identity never enters compiler IR, Typegen,
diagnostics, migration snapshots, transport metadata, or adapter requests.
Typegen emits only the exact target-dependent authoring types. JavaScript uses
the same source definition and Runtime behavior without generated files.

An inline developer callback runs as application-owned code. A relation added
or replaced by an authorized plugin runs under that exact plugin and optional
instance identity through ADR-0207's application-bound callback executor.
Orphaned, foreign, stale, or ambiguous ownership fails before callback effects.

### The filter is a private relation-shaping scope

The caller's Query AST remains an honest representation of caller input. Core
does not insert the declared relation filter into that public AST, return it
from `WhereBuilder.build()`, serialize it through a transport, or expose it to
business Query transformations.

Instead, Runtime normalizes the result into a private target row scope, beside
the existing private relation edge and protected row filters. The effective
target set is the intersection:

```text
physical relation membership
AND declared relation where
AND caller target where
AND target authorization row filters
AND target protected constraints
```

The declared filter and caller filter never replace one another. An empty
declaration result is the identity element. Every policy or protected row
restriction remains append-only and can only narrow the same set.

Because this is trusted declaration shaping, target field-level filter Access
evaluates only filter syntax supplied by the caller. A relation may therefore
use a target field that is not publicly filterable without granting callers
that field capability or revealing its value. Target operation Access, target
row restrictions, item and output restrictions, ACL, and protected constraints
still execute normally. The declaration is not promoted to a protected policy:
another query path that does not traverse this field does not inherit it.

### One visible relation universe covers every read

The filtered visible relation universe is used consistently by:

- `Relation.findMany`, `findOne`, `get`, `count`, and `exists`;
- relation eager inclusions on reads and mutation result projections;
- generated REST relationship projections;
- generated GraphQL relation connections, including networkless execution and
  Yoga;
- `some`, `none`, `every`, `isEmpty`, and `isNotEmpty`; and
- unfiltered and filtered relation `count` predicates.

For a visible universe `V` and caller target predicate `P`, `some(P)` means a
row exists in `V` satisfying `P`, `none(P)` means none exists, and `every(P)`
means no row in `V` violates `P`. The existing vacuous truth of `every` for an
empty visible relation is unchanged. `count` without a nested predicate counts
`V`; `count.where(P)` counts the rows in `V` satisfying `P` before applying all
comparisons. Emptiness remains the corresponding existence shortcut.

Inclusion filtering happens before relation ordering, offset, and limit. Thus an
included page is selected from the same filtered collection that a relation
handle queries. Pagination still means the returned included array may be
shorter than the complete filtered relation and is not itself a cardinality
result.

Pointer projection and pointer identity comparisons are unchanged. A relation
filter affects only traversal through its exact source relation field.

### Runtime evaluation is bounded and request-local

For each root Runtime operation, Core resolves a contextual callback at most
once per exact relation field definition and reuses its immutable normalized
expression across parent items and repeated occurrences. It creates no
cross-operation or cross-request cache. A second operation under the same
request context resolves again, so application behavior does not depend on
hidden cache lifetime.

Nested relation traversals inside caller predicates, declared filters, and
inclusions resolve the `where` of each encountered field. Injected nodes count
toward the existing relationship depth and Query complexity budgets. Core also
tracks the active declaration-expansion chain: if a relation's own resolved
filter recursively requires that same declaration before the first expansion
finishes, the operation fails deterministically instead of recursing forever.
A finite caller-authored traversal may revisit the same field and reuse its
already normalized filter while still consuming ordinary depth.

Static filters are validated during application compilation. Contextual results
are normalized and structurally snapshotted for the target schema on each root
operation. Cancellation is checked immediately before and after invocation.
Core does not retry a resolver. Resolver exceptions and invalid outputs use the
ordinary safe Runtime and transport error boundary and expose no callback,
context value, schema internals, or filter operands.

The execution order for each encountered relation read is:

```text
bind the exact application, context, source field, and target
→ normalize and structurally validate caller input
→ enforce source relation-field traversal policy
→ enforce target operation and caller-authored filter policy
→ resolve or reuse the declared relation where under exact attribution
→ normalize, snapshot, and boundedly expand its private target expression
→ append target authorization and protected row constraints
→ prepare the private relation edge, row scope, and inclusion or predicate plan
→ execute the adapter operation
→ materialize target results and apply target output restrictions
```

Policy-hidden and physically absent rows remain observationally equivalent.
Resolving the declaration after caller structural and traversal authorization
prevents invalid or denied requests from invoking application filter behavior.
Keeping it before final target row constraints lets every narrowing scope be
combined once at the adapter boundary without exposing one to another.

### Master bypasses authorization, not shaping

ADR-0218 continues to bypass official Access and ACL authorization for Master.
The declared relation `where` is application behavior, not authorization, so
Master does not remove it automatically. Integrity constraints and physical
membership likewise remain active.

A contextual declaration may explicitly branch on
`context.access.mode === 'master'` and return the empty builder when that is the
intended relation contract. This is a visible declaration choice, not a generic
Runtime bypass. V1 exposes no `skipRelationWhere`, raw scope mutation, or Master
shortcut.

### Relationship writes retain physical membership semantics

The filter does not participate in `connect`, `disconnect`, `set`, or `clear`,
including the equivalent commands inside nested writes. Target lookup,
authorization, Hooks, validation, constraints, and transaction behavior for
those mutations remain unchanged. A target excluded from the relation's read
view may still be connected or disconnected when the ordinary mutation policy
allows it.

An eager relation projection requested from a successful mutation is a read of
the result and therefore does apply the filter. This does not change which edge
the mutation created or removed. There is no implicit cleanup, cascading,
hidden-membership preservation rule, or write-side interpretation of `where`.

### Transports and adapters remain representational

REST and GraphQL expose no new client argument or resolver callback. They
normalize relationship selection and caller `where` exactly as before, pass the
real application-bound context into Core's request executor, and encode the
filtered result. Networkless GraphQL and Yoga share the same Runtime path.

GraphQL Relay cursor payloads continue to fingerprint the caller's wire filter,
effective order, schema, and relationship path. They do not serialize or
fingerprint the resolved contextual relation filter or request identity. Like a
change in Access row visibility, a different context on a later page can change
the visible collection; the signed offset cursor provides integrity, not a
snapshot. Runtime recomputes the filter and policy for every page.

Adapters receive only normalized portable Query expressions, private row
filters, relationship references, and inclusion or predicate plans. They never
receive `RequestContext` or an executable resolver. The existing database
request envelope already requires adapters to combine the operation predicate,
private row filter, protected constraints, and relation membership with logical
`AND`, so no Drizzle-specific public contract is added.

PostgreSQL may use Drizzle relational `with` and nested `where` for eager
collections, ordinary parameterized predicates for direct relation reads, and
its existing correlated `EXISTS` and aggregate compilation for relation
predicates. Those are physical compilation choices. Capability versions advance
only if implementation discovers an adapter-visible shape that the current
versioned envelope cannot represent; Core must not silently send new semantics
to an older adapter.

## Consequences

- A relation can represent one contextual application view without duplicating
  filters across callers or changing the target schema globally.
- Direct TypeScript, REST, GraphQL, Yoga, and database adapters share one
  visible-membership definition.
- Private declaration filters may use non-publicly-filterable target fields
  without granting that filter capability to a client.
- Counts, emptiness, quantifiers, and included results cannot disagree about
  which related targets exist before pagination.
- Dynamic request context prevents cross-request result caching by Core; only
  normalized expressions are reused within one root operation.
- Relation write behavior stays understandable because read shaping never
  changes physical edge commands.
- Core gains relation-filter resolution but no dependency on Access, ACL,
  Hooks, PostgreSQL, Drizzle, REST, GraphQL, or Yoga.

## Rejected alternatives

### Put the option in Drizzle relation metadata

This would make PostgreSQL authoritative, bypass the Core policy order, and
give direct relation methods and future adapters a different contract.

### Apply one default filter to the target schema

One target schema participates in unrelated roots and relations. A global
filter cannot express that `otherParticipants` excludes the caller while
`participants` does not.

### Rewrite the public caller `where`

Exposing the declaration in the public AST would let transformations inspect or
remove it and would make field-level filter Access treat trusted application
shaping as client-authored syntax. A private row scope preserves both truths.

### Treat the filter as authorization

The restriction applies only to one relationship traversal. Calling it a policy
would falsely imply that another route to the target is protected.

### Pass the source model to the resolver

Per-parent inputs would require loading undeclared source dependencies, invoke
callbacks for every parent, complicate grouped eager inclusion, and risk N+1
execution. A later source-dependent feature needs its own selection, batching,
policy, and failure contract.

### Allow asynchronous resolution

The accepted use case needs only request context. Async resolution would permit
I/O during query planning and require a separate bounded scheduler, transaction,
retry, and cancellation design without current evidence.

### Add a generic bypass flag

A bypass would make relation meaning vary by caller and could be exposed
accidentally by transports. The declaration itself can branch on explicit
context when different behavior is intended.

## Non-goals

- Source-item or source-field-dependent relation filters.
- Asynchronous filters, I/O during filter planning, or side-effect guarantees.
- Schema-root default filters or implicit propagation to other relationships.
- Relation-write filtering, hidden edge cleanup, cascades, or membership policy.
- Public bypass flags or transport-only overrides.
- Pointer inclusion filters or changes to pointer identity semantics.
- Cross-request caching, Runtime DataLoader, snapshot pagination, or keyset
  cursors.
- Drizzle callbacks, SQL fragments, adapter handles, or database-specific field
  options.
