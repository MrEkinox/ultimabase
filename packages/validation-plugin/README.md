# @ultimabase/validation-plugin

Optional official application field validation for UltimaBase.

Install `validationPlugin()` in the application graph to expose the direct
`validation` field option and validate final mutation candidates with any
Standard Schema V1 implementation. Core continues to enforce required presence,
nullability, canonical scalar and object shapes, defaults, generators, immutable
fields, and database integrity without this plugin.

```ts
import { Schema, UltimaBase } from '@ultimabase/core'
import { validationPlugin } from '@ultimabase/validation-plugin'
import { z } from 'zod'

const Article = Schema.define({
	className: 'Article',
	fields: (field) => ({
		title: field.string({
			required: true,
			validation: z.string().min(1).max(200),
		}),
	}),
})

const ultimabase = new UltimaBase({
	plugins: [validationPlugin()],
	schemas: [Article],
})
```

Validation is synchronous and rejection-only. It runs once over complete,
present, non-null mutation values after input resolution and Core structural
validation, before value-dependent policy reevaluation and persistence. Reads
and result materialization do not replay application validators.

Importing this package has no effect. Without `validationPlugin()`, Typegen omits
the option and application compilation rejects declarations that use it.

## Field contract

`validation` accepts any Standard Schema V1 implementation whose input and
output are compatible with the field's complete canonical value. Typegen keeps
that contract exact for scalars, lists, embedded objects, pointers, and
plugin-defined stored fields. Relation handles do not expose the option, and an
untyped `any` validator does not satisfy the generated compatibility check.

The validator is retained by identity as an opaque application value. Static
schema compilation checks its Standard Schema shape but never invokes, clones,
serializes, or emits its callback. Generated declarations contain only inert
type references.

`required` remains a Core option. It controls mutation input presence and
persisted nullability whether or not this plugin is installed; `validation`
adds only an application rejection rule over a present non-null canonical
value.

## Runtime semantics

The plugin validates create, update, and upsert candidates in deterministic
field, nested-object, and list occurrence order. Defaults, generated values,
field and schema input resolvers, and prepared-operation transforms run first.
Anonymous and Master mutations use the same validation path; Master bypasses
authorization policies, not validation.

A successful validator must return the same value. An equal clone is accepted
but discarded, while transformations, promises, malformed results, and thrown
vendor errors are rejected. Standard Schema issues are prefixed with their
field occurrence path and exposed with the stable `field.validation` code.

Numeric update expressions remain atomic. For integer, bigint, float, and
decimal arithmetic, the plugin validates the projected complete value from the
prepared target and leaves the original delta unchanged. A targetless or
unprepared branch that cannot prove the complete value fails closed.

Reads, includes, adapter results, materialization, mutation results, and final
projections run Core structural snapshots only and never replay application
validators.

Each `validationPlugin()` installation owns an application-local plan cache.
Applications in one process can use different validators, or omit the plugin,
without sharing callbacks or option ownership. The plugin intentionally exposes
no global default, schema-wide validator, provider registry, or implicit
installation behavior.
