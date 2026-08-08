# ADR-0163: Group schema hooks by mutation responsibility

- Status: accepted
- Date: 2026-08-08
- Refines: ADR-0089, ADR-0101, ADR-0104, ADR-0105, ADR-0161, ADR-0162
- Supersedes: ADR-0141, ADR-0142
- Refined by: ADR-0164

## Context

Native schema hooks exposed a long flat list mixing input transformation,
validation, read query transformation, result replacement, mutation observers,
transaction finalization, rollback, and error reporting. The list duplicated
responsibilities already owned by other public boundaries and made editor
autocomplete harder to understand.

Schema `validate` duplicated `resolveInput`, which can reject an input by
throwing. `beforeRead` duplicated developer Query options and mandatory Access
filters. `afterRead` made a read result mutable after selection, hydration, and
target Access had already established its meaning. Rollback and error callbacks
exposed low-level transaction mechanics better suited to diagnostics and
infrastructure plugins.

Field hooks are already limited to input resolution by ADR-0161. The schema
boundary needs the same focus while retaining complete previous and next items
for mutation business logic.

## Decision

Schemas expose four hook groups:

```ts
hooks: {
	resolveInput: {
		create: ({ operation }) => operation,
		update: ({ operation }) => operation,
		upsert: ({ operation }) => operation,
	},
	beforeOperation: {
		create: ({ item }) => observe(item),
		update: ({ originalItem, item }) => observe(originalItem, item),
		upsert: ({ operation }) => observe(operation),
		delete: ({ originalItem }) => observe(originalItem),
	},
	afterOperation: {
		create: ({ item }) => observe(item),
		update: ({ originalItem, item }) => observe(originalItem, item),
		upsert: ({ originalItem, item }) => observe(originalItem, item),
		delete: ({ originalItem }) => observe(originalItem),
	},
	transaction: {
		beforeCommit: ({ changes }) => verify(changes),
		afterCommit: ({ changes }) => publish(changes),
	},
}
```

Every branch accepts one handler or a non-empty ordered handler list.
`resolveInput` retains the `all`, `create`, `update`, and `upsert` family map and
is the only transforming schema hook. It may throw to reject an input.

`beforeOperation` and `afterOperation` are mutation observers. They may perform
work in the active mutation transaction or throw, but Runtime ignores their
return values. An after-operation handler therefore cannot replace the public
mutation result. Singular mutation branches receive complete
selection-independent item pairs when the operation has a real target.
Set-based mutation branches do not force per-row materialization.

`transaction.beforeCommit` and `transaction.afterCommit` each receive one
immutable `changes` summary per participating schema. The former may abort the
outer transaction. The latter runs only after commit and is intended for
external effects.

Native schema `validate`, `beforeRead`, `afterRead`, `afterRollback`, and
`onError` are removed. Developer read behavior belongs to Query options;
mandatory read restrictions belong to schema Access. Framework diagnostics,
named events, and infrastructure plugins own low-level failure observation.

Plugin-contributed schema hooks use the same public grouped declaration. Core
normalizes the groups into private phase keys so Runtime ordering and dispatch
remain centralized without exposing the internal representation.

## Consequences

- Schema hook autocomplete exposes four stable responsibilities instead of a
  growing phase list.
- Read results retain one meaning after Query selection, relation hydration,
  and Access enforcement; schema hooks cannot rewrite them.
- Business input rejection remains possible through `resolveInput` without a
  second validation callback.
- Mutation observers receive complete items independently of the requested
  result selection, and their ignored return values prevent accidental result
  transforms.
- Transaction-wide integrations receive grouped changes once rather than one
  callback per mutation.
- Existing flat hook declarations must migrate explicitly; compatibility
  aliases are deliberately omitted so autocomplete teaches only the canonical
  API.
