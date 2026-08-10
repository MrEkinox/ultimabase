# ADR-0179: Name-based application relationship targets

- Status: accepted
- Date: 2026-08-10
- Refines: ADR-0118, ADR-0173, ADR-0175

## Context

ADR-0173 retained zero-argument target callbacks so pointer and relation fields
could reference exact schema classes after module declarations completed. With
map-returning fields and generated typing, a circular application declaration
still forms a value-level TypeScript cycle:

```ts
const User = Schema.define({
	className: 'User',
	fields: (field) => ({
		posts: field.relation({ target: () => Post, mappedBy: 'author' }),
	}),
})

const Post = Schema.define({
	className: 'Post',
	fields: (field) => ({
		author: field.pointer({ target: () => User }),
	}),
})
```

Stable TypeScript requires local `SchemaReference` annotations or separately
declared resolver functions to break that cycle. Those annotations duplicate
the class names already present in the declarations, leak framework mechanics
into application code, and contradict ADR-0175's generated typing authority.
Erasing the target generic does not help because the cycle exists between the
runtime constants rather than only between their inferred types.

## Decision

Application `FieldBuilder` pointer and relation methods accept the target's
stable schema name:

```ts
export const User = Schema.define({
	className: 'User',
	fields: (field) => ({
		posts: field.relation({ target: 'Post', mappedBy: 'author' }),
	}),
})

export const Post = Schema.define({
	className: 'Post',
	fields: (field) => ({
		author: field.pointer({ target: 'User' }),
	}),
})
```

The name is declaration syntax, not runtime relationship identity. A schema
containing a named relationship remains uncompiled until an application
registry is available. Static compilation resolves every declared name against
the complete application registry and stores a private callback returning the
exact registered schema class. The existing target graph, pointer validation,
relation topology validation, Query, Runtime, and adapter contracts continue to
consume exact class identities.

An unknown name fails static compilation with the source field path and the
declared target name before plugin setup or infrastructure starts. Reusing a
schema in another application retains the existing exact-identity compatibility
checks.

The immutable low-level `pointerField` and `relationField` factories keep lazy
class callbacks for framework and plugin composition. They are not the ordinary
application declaration surface. Generated contracts correlate relationship
types through the same stable class names and remain the source of precise
application typing.

## Consequences

- Circular application schemas require no `SchemaReference`, resolver function,
  forward declaration, or local type annotation.
- Target names receive ordinary string-literal autocomplete and generated
  relationship types remain exact after generation.
- Relationship-bearing schemas require application registration before their
  field-dependent metadata or models can be used.
- Runtime keeps exact schema identity; the change does not weaken pointer or
  relation validation to class-name comparison.
- Framework-owned low-level factory fixtures may continue to use callback
  targets where the exact class value is already available.
