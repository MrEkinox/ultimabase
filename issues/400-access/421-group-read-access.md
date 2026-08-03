# 421: Group schema and field read Access

- Status: ready
- Milestone: 4
- Packages: `@ultimabase/core`
- Depends on: 401
- ADR: ADR-0116

## Goal

Group schema read cardinalities and direct or indirect field disclosure under
their respective `read` declarations. Developers retain one concise shared
rule while gaining explicit branches when different read shapes expose
different amounts of information.

## Target developer experience

A schema read rule may protect every read terminal through one callback:

```ts
access: {
	operation: {
		read: ({ context, kind }) =>
			context.access.mode === 'master' || kind !== 'count',
		create: true,
		update: true,
		upsert: true,
		delete: ({ context }) => context.access.mode === 'master',
	},
}
```

The detailed form separates singular, collection, count, and existence reads
without losing the exact terminal inside each callback:

```ts
access: {
	operation: {
		read: {
			one: ({ kind }) => kind === 'get',
			many: true,
			count: false,
			exists: true,
		},
	},
}
```

`one` covers `get` and `first`, `many` covers `find`, while `count` and
`exists` retain their exact terminal names. Mutation families remain direct
rules and may already distinguish singular and bulk terminals through `kind`.

One direct rule applies consistently to item output, filtering, and ordering:

```ts
const Post = Schema.define({
	className: 'Post',
	fields: {
		secret: stringField({
			access: {
				read: false,
				create: true,
				update: false,
			},
		}),
	},
})
```

The developer may distinguish the three disclosure channels explicitly:

```ts
const Post = Schema.define({
	className: 'Post',
	fields: {
		secret: stringField({
			access: {
				read: {
					item: ({ context, value }) =>
						context.access.mode === 'master' && value.length > 0,
					filter: ({ context }) => context.access.mode === 'master',
					order: false,
				},
				create: true,
				update: false,
			},
		}),
	},
})
```

A shared callback receives a disclosure-channel discriminant when one function
must handle all three uses:

```ts
read: ({ channel, context }) => {
	if (channel === 'item') {
		return true
	}

	return context.access.mode === 'master'
}
```

## Acceptance criteria

- [ ] Replace schema `operation.read` with `rule | { one, many, count, exists }` while preserving the current direct boolean and synchronous or asynchronous callback forms.
- [ ] The schema read object requires all four branches: `one` covers `get | first`, `many` covers `find`, and `count` and `exists` each cover their exact terminal.
- [ ] Every schema read branch accepts a boolean or a precisely typed synchronous or asynchronous callback and preserves the exact terminal in `kind`.
- [ ] `operation.create`, `update`, `upsert`, and `delete` remain direct family rules; their existing `kind` already distinguishes singular and bulk terminals without another public object layer.
- [ ] Replace the flat field `read`, `filter`, and `order` declarations with `read: rule | { item, filter, order }`; `create` and `update` remain top-level mutation decisions.
- [ ] A direct boolean applies to all three read channels, so `read: false` denies returning, filtering, and ordering by the field.
- [ ] A direct synchronous or asynchronous callback applies to all three channels and receives a precise `channel: 'item' | 'filter' | 'order'` discriminant alongside the exact terminal `kind`.
- [ ] The object form requires explicit `item`, `filter`, and `order` rules; each entry accepts a boolean or a precisely typed synchronous or asynchronous callback.
- [ ] `item` receives the field's exact logical output value, while `filter` and `order` expose no row value because they execute before row materialization.
- [ ] Schema and field read objects are normalized, snapshotted, and retained through private capabilities without entering metadata, schema hashes, migrations, or compact field hovers.
- [ ] Legacy flat `filter` and `order` properties fail structural normalization rather than being silently accepted or ambiguously merged.
- [ ] Public JSDoc explains schema read cardinalities, warns that field filtering and ordering can disclose unreadable information, and documents every shared and grouped form.
- [ ] ADR-0116, the Core README, the Access milestone README, and the current plan reflect the grouped disclosure model.
- [ ] Add a Changeset for the pre-release public contract change.

## Tests

- [ ] Runtime normalization tests cover schema and field shared booleans, shared sync and async callbacks, complete grouped objects, immutability, unknown properties, missing branches, and legacy flat field declarations.
- [ ] Compile-time tests prove schema branch terminal unions, field channel narrowing, terminal kinds, item values, callback results, and rejection of invalid or incomplete objects.
- [ ] TypeScript language-service tests verify schema and field autocomplete, hover documentation, compact QuickInfo, and that field `filter` and `order` are no longer offered beside `read`.
- [ ] Packed-package tests verify the same public contract through `@ultimabase/core` exports.

## Implementation notes

- `item` here names the field-output disclosure channel. It is separate from
  schema-level `access.item`, which authorizes a prepared mutation object.
- Schema `read.one` intentionally retains `kind: 'get' | 'first'` because these
  terminals share result cardinality but not lookup semantics.
- Keep `channel` separate from `kind`: `channel` distinguishes how the field is
  being read, while `kind` retains the exact Query or mutation terminal.
- This issue preserves the current precisely typed field-value boundary.
  Supplying complete sibling item or mutation-input data to inline field rules
  requires a separate schema-aware typing decision and must not be approximated
  with `any` or an imprecise public record.

## Out of scope

- Executing schema or field Access decisions in Runtime.
- Grouping mutation operation families into `one` and `many` objects.
- Adding complete schema item or mutation input values to inline field callbacks.
- Transport-specific omission, error, or GraphQL-null behavior.
