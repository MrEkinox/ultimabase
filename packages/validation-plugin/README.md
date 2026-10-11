# @ultimabase/validation-plugin

Optional official application validation for UltimaBase.

Install `validationPlugin()` in the application graph to expose the
`validation` field option, the schema check of `.with({ validation })`, and
`check()`. Core continues to enforce required presence, nullability, canonical
scalar and object shapes, defaults, generators, immutable fields, and database
integrity without this plugin.

```ts
import { UltimaBase } from '@ultimabase/core'
import { validationPlugin } from '@ultimabase/validation-plugin'
import { z } from 'zod'

const App = UltimaBase.use(validationPlugin())
export const Event = App.Schema.define({
	className: 'Event',
	fields: (field) => ({
		// A Standard Schema validator's output is stored: trimmed, then checked.
		title: field.string({
			required: true,
			validation: z.string().trim().max(200),
		}),
		// A function validator: true, a message, or { message, code }.
		code: field.string({
			validation: (code) =>
				/^[A-Z]{3}$/u.test(code) || {
					code: 'event.code',
					message: 'Three capital letters',
				},
		}),
		startsAt: field.int({ required: true }),
		endsAt: field.int({ required: true }),
	}),
}).with({
	// The schema check sees the complete item as it would be stored.
	validation: ({ item }) =>
		item.endsAt >= item.startsAt || {
			path: ['endsAt'],
			message: 'An event cannot end before it starts',
		},
})
```

The `validation` options of `define` follow the same types until the
declaration form is retired. Importing this package has no effect; without
`validationPlugin()`, the configured factory omits the options and application
compilation rejects untyped declarations that use them.

## Field validators (ADR-0319)

`validation` accepts a `FieldValidator<TValue>`: any Standard Schema V1
implementation (Zod, Valibot, ArkType…) or a function
`(value) => true | 'message' | { message, code }`, without a library. Both may
be `async`. A Standard Schema validator must accept the field's value (its
input may also accept `null`, so a form validator can be reused as is) and
return a value the field can store; a mismatch is reported on the option, for
example `validation must accept string, got number`. An untyped `any`
validator is refused.

The output of a Standard Schema validator is what gets stored, so
`z.string().trim()` trims the value. Formatting a value belongs in the
validator; business logic (deriving, cross-checking) belongs in Hooks
`resolveInput`. Core revalidates an output structurally before storing it.

The option is available on stored fields and embedded object properties only;
relation handles, virtual wrappers, and output descriptors do not expose it.
`required` remains a Core option: a validator does not decide whether a field
may be omitted or set to `null`, and it never runs for `null`.

## Schema checks

`.with({ validation })` takes a function on the complete final item,
`({ item }) => true | 'message' | { path, message, code? } | readonly issues[]`,
or a Standard Schema object validator run on the item (its output is not
stored).

## Runtime semantics

Validation is the last step before storage: defaults, generated values, Hooks
`resolveInput`, prepared-operation transforms and Core's final structural
validation run first. A create validates every present field; an update
validates only the fields it changes; the schema check always sees the
complete item. Child validators run before the containing object's validator,
which does not run when a child failed. Anonymous and Master mutations use the
same validation path; Master bypasses authorization policies, not validation.

Asynchronous validators run inside the transaction: a slow call holds its
locks. Uniqueness belongs to a unique index, not to a validator.

Core's structural issues and every validator issue are collected into one
`VALIDATION_ERROR`, each issue `{ path, message, code }`: `field.validation`
for a field validator, `schema.validation` for a schema check, or the `code` a
function returned. Field paths follow Core's (`['input', 'title']` for a
create, `['update', 0, 'title', 'value']` for an update); schema-check paths
are relative to the item; bulk calls prefix each path with the failing item's
index. REST answers `422` with `details.issues` and GraphQL reports
`extensions.details.issues`.

Numeric update expressions remain atomic. For integer, bigint, float, and
decimal arithmetic, the plugin validates the projected complete value from the
prepared target and leaves the original delta unchanged (an output is not
stored). A targetless or unprepared branch that cannot prove the complete value
fails closed.

Reads, includes, adapter results, materialization, mutation results, and final
projections run Core structural snapshots only and never replay application
validators.

## Validating without writing

`ultimabase.plugin(validationPlugin).check(Schema, { data })` runs the field
validators and the schema check of a create on `data`, without a write or a
transaction, and returns `{ valid: true }` or `{ valid: false, issues }` with
the paths `createOne` reports. Core's structural checks run when the data is
written.

Each `validationPlugin()` installation owns an application-local plan cache.
Sequential applications in one JavaScript realm can use different validators,
or omit the plugin, without sharing callbacks or option ownership. The plugin
has no options, global default, or provider registry.
