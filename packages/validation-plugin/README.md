# @ultimabase/validation-plugin

Optional official application validation for UltimaBase.

Install `validationPlugin()` in the application graph to expose the
`validation` field option, the schema check of `.with({ validation })`, and
`check()`. Core continues to enforce required presence, nullability, canonical
scalar and object shapes, defaults, generators, immutable fields, and database
integrity without this plugin.

Every code block in this README is copied from the tested
[`examples/validation`](../../examples/validation/README.md) application by
`yarn docs:regions` (ADR-0330): edit the example, then run the script. Its
schema file installs the plugin and declares an `Event` with field validators
and a schema check:

<!-- region ../../examples/validation/src/schema.ts#factory,event -->

```ts
import { accessPlugin } from '@ultimabase/access-plugin'
import { apiServer } from '@ultimabase/api-server'
import { UltimaBase } from '@ultimabase/core'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { validationPlugin } from '@ultimabase/validation-plugin'
import { z } from 'zod'

import { isRoomOpen } from './rooms.ts'

/**
 * The configured factory types the `validation` field option and the schema
 * check of `.with({ validation })`. Access opens the REST writes of this
 * example; Validation needs neither Access nor REST.
 */
export const App = UltimaBase.use(
	validationPlugin(),
	accessPlugin(),
	...apiServer({ http: { appId: 'events' }, rest: true }),
	postgresPlugin(),
)

export const Event = App.Schema.define({
	className: 'Event',
	fields: (field) => ({
		// A Standard Schema validator's output is stored: trimmed, then checked.
		title: field.string({
			required: true,
			validation: z.string().trim().min(1).max(80),
		}),
		// A function validator returns true, a message, or { message, code }.
		code: field.string({
			validation: (code) =>
				/^[A-Z]{3}$/u.test(code) || {
					code: 'event.code',
					message: 'Use three capital letters',
				},
		}),
		// An async validator may ask another service; it runs in the transaction.
		room: field.string({
			validation: async (room) =>
				(await isRoomOpen(room)) || `${room} is closed`,
		}),
		// Optional: `null` clears the summary without running the validator.
		summary: field.string({ validation: z.string().min(10) }),
		startsOn: field.date({ required: true }),
		endsOn: field.date({ required: true }),
		// Bookings decrement this count; the projected value is validated.
		seatsLeft: field.int({
			required: true,
			validation: (seats) =>
				seats >= 0 || { code: 'event.full', message: 'No seats left' },
		}),
	}),
}).with((plugins) =>
	plugins
		// Every caller may read, create and update events in this example.
		.access({ read: true, create: true, update: true })
		// The schema check sees the complete event as it would be stored.
		.validation(
			({ item }) =>
				item.endsOn >= item.startsOn || {
					code: 'event.dates',
					message: 'An event cannot end before it starts',
					path: ['endsOn'],
				},
		),
)
```

<!-- endregion -->

`define` takes no `validation` option: the schema check belongs in the final
`.with()`, and field rules stay on their fields. Importing this package has no
effect; without `validationPlugin()`, the configured factory omits the
options and application compilation rejects untyped declarations that use
them.

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
as `Event` does above, or a Standard Schema object validator run on the item
(its output is not stored), as the example's `TicketTier` does.

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
index. A schema check runs only on a structurally valid item. REST answers
`422` with `details.issues` and GraphQL reports `extensions.details.issues`.
In this `updateMany`, the second event's bad code fails the whole call with
the path `[1, 'update', 0, 'code', 'value']`:

<!-- region ../../examples/validation/tests/updates.test.ts#update-many -->

```ts
const updates = Event.updateMany({
	data: [
		{ where: { id: { eq: first.id } }, data: { code: 'ABC' } },
		{ where: { id: { eq: second.id } }, data: { code: 'second' } },
	],
})
```

<!-- endregion -->

Numeric update expressions remain atomic. For integer, bigint, float, and
decimal arithmetic, the plugin validates the projected complete value from the
prepared target and leaves the original delta unchanged (an output is not
stored). A targetless or unprepared branch that cannot prove the complete value
fails closed:

<!-- region ../../examples/validation/tests/updates.test.ts#book-seat -->

```ts
const bookSeat = (id: string) =>
	Event.updateOne({
		where: { id: { eq: id } },
		// The database applies the decrement; the validator sees the result.
		data: { seatsLeft: { decrement: 1 } },
		select: { seatsLeft: true },
	})

const booked = await bookSeat(event.id)
const full = bookSeat(event.id)
```

<!-- endregion -->

Reads, includes, adapter results, materialization, mutation results, and final
projections run Core structural snapshots only and never replay application
validators.

## Validating without writing

`ultimabase.plugin(validationPlugin).check(Schema, { data })` runs the field
validators and the schema check of a create on `data`, without a write or a
transaction, and returns `{ valid: true }` or `{ valid: false, issues }` with
the paths `createOne` reports. Core's structural checks run when the data is
written.

<!-- region ../../examples/validation/tests/check.test.ts#check -->

```ts
const validation = ultimabase.plugin(validationPlugin)

const accepted = await validation.check(Event, {
	data: {
		title: 'Autumn meetup',
		startsOn: '2026-11-02',
		endsOn: '2026-11-03',
		seatsLeft: 40,
	},
})
const rejected = await validation.check(Event, {
	data: {
		title: 'Autumn meetup',
		code: 'meetup',
		startsOn: '2026-11-03',
		endsOn: '2026-11-02',
		seatsLeft: 40,
	},
})
```

<!-- endregion -->

Each `validationPlugin()` installation owns an application-local plan cache.
Sequential applications in one JavaScript realm can use different validators,
or omit the plugin, without sharing callbacks or option ownership. The plugin
has no options, global default, or provider registry.
