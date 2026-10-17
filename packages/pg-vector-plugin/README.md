# @ultimabase/pg-vector-plugin

Plugin-owned vector fields for PostgreSQL pgvector integrations.

The package proves the complete custom-field boundary:

- `pgVectorPlugin()` contributes the application-local
  `field.vector({ dimensions })` declaration method;
- `vectorField({ dimensions })` remains its immutable field-factory foundation;
- `@ultimabase/core` retains it through the common scalar validation plan;
- `isVectorFieldValidationPlan()` narrows the preserved scalar plan, while
  Core's `snapshotScalarFieldValue()` validates the exact vector value without
  Schema understanding vector configuration;
- `VectorValue` remains an immutable `readonly number[]` snapshot.

The public `field.vector(...)` method currently supports stored schema fields
only. Its logical value and wire codecs do not imply that an embedded property
or output descriptor has the same executable contract; those contexts remain
absent until a concrete issue proves and declares them.

The field also owns the canonical `ultimabase.graphql.field@1.0.0` JSON codec.
GraphQL can therefore expose vectors without importing this package or guessing
from storage metadata.

The field validates the options container before reading `dimensions` and uses
Schema's `snapshotValue` contract. Its snapshot is pure, deterministic, and
idempotent, so declaration-time static defaults own detached vector values.
Like every stored field, a vector may also receive one synchronous Standard
Schema validator through `validation`; the validator observes the complete
canonical vector after the plugin has enforced its structural dimension and
finite-number contract.

```ts
import { UltimaBase } from '@ultimabase/core'
import { hooksPlugin } from '@ultimabase/hooks-plugin'
import { pgVectorPlugin } from '@ultimabase/pg-vector-plugin'

const App = UltimaBase.use(hooksPlugin()).use(pgVectorPlugin())
const DocumentSchema = App.Schema.define({
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

const ultimabase = new App({
	schemas: [DocumentSchema],
})

ultimabase.compile()
```

The configured factory infers `VectorFieldBuilderMethod` from the installed
plugin. Core deliberately does not expose `vector` when the
plugin is absent. The plugin registers the runtime method before static schema
compilation. No PostgreSQL column compiler is shipped for this field:
the plugin currently provides the logical value contract and GraphQL codec only.
It contains no Drizzle or SQL dependency and cannot persist vector fields yet.
The plugin has no setup output. Value checks use Core's scalar snapshot boundary.
The builder's editor contract is exercised by
[`field-builder-autocomplete.test.ts`](tests/field-builder-autocomplete.test.ts).
