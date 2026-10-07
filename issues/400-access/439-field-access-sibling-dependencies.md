# 439: Add explicit sibling dependencies to field Access

- Status: planned
- Milestone: 4
- Packages: `@ultimabase/core`, database plugins
- Depends on: 807
- ADR: required; must refine ADR-0096 and ADR-0170 before implementation

## Goal

Let one field Access rule explicitly select sibling values and receive the
materialized dependency object, without pretending through TypeScript that the
Runtime loaded values it did not actually request.

## Proposed developer contract

```ts
field.string('secret', {
	access: {
		read: {
			output: {
				select: { status: true },
				allow: ({ item, value }) =>
					item.status === 'published' && value.length > 0,
			},
			where: false,
			orderBy: false,
		},
	},
})
```

The final public shape is deliberately not accepted by this issue. The ADR
must first decide whether dependencies apply only to output or also to write
transitions, how nested object occurrences expose their parent and root values,
and how inaccessible dependencies fail without leaking data.

## Acceptance criteria

- [ ] A schema-specific generated FieldBuilder types `select` from exact sibling fields and rejects unknown dependencies.
- [ ] Runtime records declared dependencies in the compiled Access plan and requests them from eager-capable adapters even when they are omitted from the public result.
- [ ] Dependency values never broaden the caller-visible selection and remain subject to monotonic field and schema Access.
- [ ] Missing, inaccessible, or malformed dependency values have one documented deny-or-fail behavior.
- [ ] Nested object Access receives an exact field path and occurrence contract without inventing an independent schema lifecycle.
- [ ] Pointer and relation dependencies define whether they are handles, hydrated values, or unsupported before implementation.
- [ ] Source and packed-package IntelliSense tests cover selected `item`, unknown sibling rejection, nested paths, and plugin fields.
- [ ] Runtime and PostgreSQL tests prove selection widening does not disclose dependency fields and does not introduce per-row N+1 reads.

## Non-goals

- Implicitly exposing the complete parent object to every field rule.
- Loading undeclared sibling fields.
- Adding a type-only `item` property before Runtime can supply it.
