# @ultimabase/pg-vector-plugin

Plugin-owned vector fields for PostgreSQL pgvector integrations.

The package proves the complete custom-field boundary:

- `pgVectorPlugin()` contributes the application-local
  `field.vector({ dimensions })` declaration method;
- `vectorField({ dimensions })` remains its immutable field-factory foundation;
- `@ultimabase/core` retains it through the common scalar validation plan;
- `pgVectorPlugin()` narrows `plan.field.kind`, then reads and validates the
  exact vector field without Schema understanding vector configuration;
- `VectorValue` remains an immutable `readonly number[]` snapshot.

The field validates the options container before reading `dimensions` and uses
Schema's `snapshotValue` contract. Its snapshot is pure, deterministic, and
idempotent, so declaration-time static defaults own detached vector values.
Like every stored field, a vector may also receive one synchronous Standard
Schema validator through `validation`; the validator observes the complete
canonical vector after the plugin has enforced its structural dimension and
finite-number contract.

```ts
import { Schema, createApplication } from '@ultimabase/core'
import { hooksPlugin } from '@ultimabase/hooks-plugin'
import { pgVectorPlugin } from '@ultimabase/pg-vector-plugin'

const DocumentSchema = Schema.define({
	className: 'Document',
	fields: (field) => ({
		embedding: field.vector({
			dimensions: 1536,
			required: true,
			hooks: {
				// The value is inferred as readonly number[].
				resolveInput: ({ value }) => value,
			},
		}),
	}),
})

const application = await createApplication({
	schemas: [DocumentSchema],
	plugins: [hooksPlugin(), pgVectorPlugin()],
})
```

The plugin registers the runtime method before static schema compilation. The
generated application contract adds its exact `VectorFieldBuilderMethod` type
to that application's builder; Core deliberately does not expose `vector` when
the plugin is absent. The PostgreSQL package will later consume the plugin's
database compiler to produce a real pgvector column. Until that milestone is
implemented, this package deliberately contains no Drizzle or SQL dependency.
The combined generated Hooks, Access, and vector editor contract is exercised
by
[`generator-language-service.test.ts`](../typegen/src/generator-language-service.test.ts).
