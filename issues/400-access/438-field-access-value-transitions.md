# 438: Authorize field writes only through value transitions

- Status: done
- Milestone: 4
- Packages: `@ultimabase/core`, official policy plugins
- Depends on: 437
- ADR: ADR-0171

## Goal

Remove schema-operation vocabulary from generic field writes so the same
`fill`, `replace`, and `clear` rules apply consistently during create, update,
and upsert branches.

## Target developer experience

```ts
const Post = Schema.define({
	className: 'Post',
	fields: {
		subtitle: stringField({
			access: {
				read: { output: true, where: false, orderBy: false },
				write: { fill: true, replace: true, clear: false },
			},
		}),
	},
})
```

## Acceptance criteria

- [x] Generic field `write` accepts only a boolean or complete `{ fill, replace, clear }` object.
- [x] A non-null create value selects `fill`.
- [x] An absent or null create value selects no field write transition.
- [x] Update and upsert transitions retain their persisted-to-final semantics.
- [x] Schema Access remains the only operation-specific authorization layer.
- [x] Relation `write({ change })` remains unchanged.
- [x] Source and packed-package autocomplete expose the flattened write branches.
- [x] Official plugins, documentation, examples, and Changesets use the final contract.

## Tests

- [x] Type and normalization tests reject the intermediate create/update shape.
- [x] Runtime tests cover create fill, empty create, update transitions, upserts, nested fields, and bulk targets.
- [x] Unit, type, build, lint, format, and PostgreSQL E2E suites pass.

## Out of scope

- Adding operation discriminants to field callbacks.
- Treating empty strings, arrays, or objects as empty field state.
- Changing relation-delta authorization.
