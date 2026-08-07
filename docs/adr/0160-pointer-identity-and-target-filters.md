# ADR-0160: Pointer identity and target filters

- Status: accepted
- Date: 2026-08-07
- Refines: ADR-0118, ADR-0143, ADR-0159

## Context

Canonical pointer equality inherited the stored `Pointer<TTarget>` value type.
A developer who already had a target identifier therefore had to manufacture a
pointer merely to filter its source object. The same parent `where` also had no
explicit way to constrain fields of the pointed target after pointer inclusion
became projection-only.

Identity comparison and target traversal have different Access and database
semantics. Treating both as one nested object would hide that boundary, while
reintroducing `where` under `include` would again make one existing pointer
appear missing only because of result shaping.

## Decision

Pointer `eq`, `ne`, `in`, and `notIn` operands are target object identifiers:

```ts
await Membership.findOne({
	where: { project: { eq: projectId } },
})
```

Core validates the identifier against the pointer's exact declared target and
normalizes it to the existing immutable `Pointer` scalar inside primitive Query
AST leaves. Serialization back to canonical `WhereInput` restores identifiers,
so `WhereBuilder.build()` never leaks an internal pointer operand.
Pointer nullability remains explicit through `isNull` and `isNotNull`; identity
operators never accept `null`.

Pointer target traversal uses explicit `is` and `isNot` branches:

```ts
await Membership.findMany({
	where: {
		project: {
			is: { archived: { eq: false } },
		},
	},
})
```

`is` means that one visible target satisfies the nested target-typed
`WhereInput`. `isNot` means that no visible target satisfies it; a null pointer
or target hidden by target Access therefore satisfies `isNot`. Developers may
combine `isNot` with `isNotNull: true` when null pointers must be excluded.

Identity operators inspect only the stored pointer value. They enforce the
source pointer field's filter Access but do not start target Access because no
target field is queried. `is` and `isNot` enforce the source pointer field and
the target schema's operation, filter, and field Access through the existing
private relation-predicate scopes. They do not run target read hooks.

The portable relationship predicate protocol advances to version 4. Pointer
predicate nodes retain exact source, field, and target identities. Their nested
expression type is erased only inside the AST node to prevent infinite public
type expansion for circular pointer schemas; canonical `WhereInput` and
`WhereBuilder` authoring remain target-typed and depth-bounded.

PostgreSQL compiles pointer traversal through the generated Drizzle `one`
relation. `is` becomes a correlated `EXISTS`; `isNot` negates that existence
test. Target Access constraints remain inside the correlated target predicate.

## Consequences

- Pointer identity filters no longer require temporary domain objects.
- Parent filtering stays separate from pointer result projection.
- REST and GraphQL can reuse one structural and serializable filter contract.
- Identity comparison and target-visible traversal retain distinct Access
  semantics.
- Adapters implementing relationship predicates must explicitly support
  capability version 4 before receiving pointer traversal nodes.
