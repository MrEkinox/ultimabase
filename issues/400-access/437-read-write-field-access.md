# 437: Organize field Access around read and write capabilities

- Status: done
- Milestone: 4
- Packages: `@ultimabase/core`, official policy plugins
- Depends on: 418, 421, 436
- ADR: ADR-0170
- Refined by: 438, ADR-0171

## Goal

Describe field authorization through disclosure capabilities and concrete value
transitions rather than mirroring schema operation declarations.

## Target developer experience

```ts
const Post = Schema.define({
	className: 'Post',
	fields: {
		subtitle: stringField({
			access: {
				read: {
					output: true,
					where: false,
					orderBy: false,
				},
				write: {
					create: true,
					update: {
						fill: true,
						replace: true,
						clear: false,
					},
				},
			},
		}),
	},
})
```

## Acceptance criteria

- [x] Generic field Access exposes only `read` and `write` at its root.
- [x] `read` accepts a concise boolean or a complete `{ output, where, orderBy }` object.
- [x] `write` accepts a concise boolean or a complete `{ create, update }` object.
- [x] Detailed `write.update` accepts a concise boolean or a complete `{ fill, replace, clear }` object.
- [x] `create` applies only when the containing schema operation uses its create branch and supplies the field.
- [x] `fill` applies to an update whose original value is `null` and final value is non-null.
- [x] `replace` applies to an update whose original and final values are non-null, including an explicit rewrite of the same logical value.
- [x] `clear` applies to every update whose final value is `null`, including a repeated clear.
- [x] `null` and `unset()` select the same `clear` transition.
- [x] Upsert field Access evaluates only the branch selected by target materialization.
- [x] Relation fields expose `read` and `write`; relation `write` receives its typed mutation change without pretending that a relation handle has scalar transitions.
- [x] Legacy root `create` and `update`, read `filter` and `order`, and relation `update` declarations fail validation.
- [x] The private plan retains monotonic contribution ordering, master behavior, and the existing Runtime stage order.
- [x] Public source and packed-package autocomplete documents every shorthand and detailed branch precisely.
- [x] Documentation, examples, ADR links, issue status, and a Changeset describe the new contract.

## Tests

- [x] Type and language-service tests cover concise and detailed read/write declarations and reject incomplete or legacy objects.
- [x] Runtime tests cover create, fill, replace, clear, repeated clear, update operators, nested fields, upsert branch selection, relation changes, and asynchronous rules.
- [x] Plugin contributions compile to the same ordered private field plan.
- [x] PostgreSQL E2E tests use and enforce the new public shape.

## Out of scope

- Giving field rules sibling values or the complete parent item.
- Adding field deletion rules independent from deletion of the containing item.
- Treating empty strings, arrays, or objects as `clear`; only canonical `null` is empty.
- Changing schema Access declarations or the Runtime transaction order.
