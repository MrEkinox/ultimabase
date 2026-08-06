# ADR-0145: Create command envelope and result selection

- Status: accepted
- Date: 2026-08-06
- Refines: ADR-0132, ADR-0144

## Context

`updateOne` accepts mutation data and a flat public result selection inside one
command object, while `create` historically accepted its data object directly.
Adding selection beside those fields would collide with legitimate schema
fields named `data` or `select`. Keeping selection in terminal execution options
would also mix portable operation intent with server-only context and authority.

## Decision

Static schema creation uses one explicit command envelope:

```ts
Post.create(
	{
		data: { title: 'Hello' },
		select: { id: true, title: true },
	},
	{ ultimabase },
)
```

`data` is required and retains the exact schema-derived create input.
`select` is optional and uses the same literal, exact, flat
`QuerySelection<TSchema>` contract as reads and `updateOne`. Omitting it returns
the complete model. This replaces the former `create(data, options)` signature;
the two shapes are not kept as overloads.

The normalized `create-one` AST owns its selection independently from terminal
execution options. Native field Access may narrow it. Database adapters keep a
complete create materialization for hooks and transaction processing while
returning only the selected public record. Selecting a pointer never performs
implicit relation loading.

Draft instance creation remains `draft.create(options?)`. The draft already
owns its data, and adding result selection to that command requires a separate
concrete decision.

This decision does not extend selection to `createMany` or other object-returning
commands.

## Consequences

- Static singular mutations share a clear command-object shape.
- REST and GraphQL can normalize create data and projection without field-name
  ambiguity.
- Existing static create calls must wrap their values in `data`.
- Public projections do not reduce hook or post-commit materializations.
