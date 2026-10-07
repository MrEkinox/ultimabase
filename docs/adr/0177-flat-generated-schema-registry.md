# ADR-0177: Flat generated schema registry

- Status: accepted
- Date: 2026-08-10
- Refines: ADR-0173, ADR-0175

## Context

The generated application declaration exposed the same schema contract through
three layers: `Schemas.Todo.Item`, `Schemas.Todo.TypeInfo.item`, and the root
`TypeInfo.schemas.Todo` registry. Core consumed only the module-augmented
registry, while application code and repository examples did not consume the
root `TypeInfo` map. The aliases made the generated file larger and obscured
which contract was authoritative.

## Decision

The public generated namespace contains one direct type per schema:

```ts
export declare namespace Schemas {
	export type Todo = {
		readonly key: 'Todo'
		readonly fields: 'id' | 'title'
		readonly item: TodoItem
		readonly inputs: {
			readonly create: TodoCreateInput
			readonly orderBy: TodoOrderByInput
			readonly select: TodoSelect
			readonly update: TodoUpdateInput
			readonly where: TodoWhereInput
		}
	}
}
```

`Schemas.Todo` is the complete public contract. The generator no longer emits
`Schemas.Todo.Item`, `Schemas.Todo.TypeInfo`, or a root `TypeInfo.schemas` map.
Core's `UltimaBaseGeneratedSchemas` augmentation references `Schemas.Todo`
directly. Generic framework code continues to use that Core registry; ordinary
application tooling can import the explicit generated schema type it needs.

## Consequences

- Every schema fact has one generated public path.
- The framework registry remains private to Core inference without duplicating
  the application-facing hierarchy.
- Removing the root `TypeInfo` export is an intentional pre-release API change.
- Generated fingerprints change because the declaration ABI changed.
