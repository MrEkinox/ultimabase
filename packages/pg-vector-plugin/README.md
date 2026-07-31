# @ultimabase/pg-vector-plugin

Plugin-owned vector fields for PostgreSQL pgvector integrations.

The package currently proves the complete custom-field boundary:

- `vectorField({ dimensions })` creates a namespaced logical field;
- `@ultimabase/schema` preserves it as an opaque plugin validation plan;
- `pgVectorPlugin()` claims, reads, and validates that plan without Schema
  understanding vector configuration;
- the public value remains an immutable `readonly number[]` snapshot.

The field validates the options container before reading `dimensions` and uses
Schema's `snapshotValue` contract. Its snapshot is pure, deterministic, and
idempotent, so static defaults can be safely normalized again during plan
compilation.

```ts
const DocumentSchema = defineSchema({
	className: 'Document',
	fields: {
		embedding: vectorField({
			dimensions: 1536,
			validation: { required: true },
		}),
	},
})
```

The future Core plugin registry will register the static handler returned by
`pgVectorPlugin()`. The PostgreSQL package will then consume its database
compiler to produce a real pgvector column. Until those milestones are
implemented, this package deliberately contains no Drizzle or SQL dependency.
