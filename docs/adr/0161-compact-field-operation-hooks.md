# ADR-0161: Keep field hooks limited to input resolution

- Status: accepted
- Date: 2026-08-08
- Refines: ADR-0089, ADR-0096, ADR-0100, ADR-0101, ADR-0104, ADR-0105, ADR-0141, ADR-0142
- Refined by: ADR-0163

## Context

Field declarations exposed lifecycle, validation, output, transaction, and
change callbacks even though a field sees only one logical value. This made a
complete field declaration long and duplicated responsibilities already owned
by schema hooks and field definitions.

Field validation was especially redundant: `resolveInput` can reject invalid
input by throwing, while cross-field business validation requires the complete
schema operation. Field lifecycle callbacks also lacked the complete previous
and next objects needed to make reliable business decisions.

The framework needs one concise field boundary and complete mutation context at
the schema boundary without materializing set-based writes.

## Decision

Fields expose exactly one public hook phase:

```ts
stringField({
	hooks: {
		resolveInput: ({ value }) => {
			const normalized = value.trim()

			if (normalized === '') throw new TypeError('Title must not be empty')

			return normalized
		},
	},
})
```

`resolveInput` accepts one direct handler, one non-empty ordered handler list,
or a family map with `all`, `create`, `update`, and `upsert`. It transforms one
exact logical value before structural revalidation. It may throw to reject the
input. Cross-field and structured business validation belongs to schema hooks.

Field `validate`, `beforeOperation`, `afterOperation`, `resolveOutput`,
`onChange`, `afterCommit`, `afterRollback`, and `onError` are removed. Field
definitions and transports own output representation. Schema hooks own
validation, mutation lifecycle, transaction finalization, rollback, and error
observation.

Schema mutation lifecycle hooks receive selection-independent complete values:

| Terminal                              | Before hook                       | After hook                                       |
| ------------------------------------- | --------------------------------- | ------------------------------------------------ |
| `createOne`                           | `originalItem: null`, `item`      | same persisted pair                              |
| `updateOne`                           | `originalItem`, candidate `item`  | persisted pair                                   |
| `deleteOne`                           | `originalItem`, `item: null`      | same persisted pair                              |
| `upsertOne`                           | no pair                           | `originalItem: null \| object`, persisted `item` |
| `createMany`                          | `items` containing creation pairs | persisted creation pairs                         |
| set-based `updateMany` / `deleteMany` | no item materialization           | adapter materialization pairs                    |

Atomic upserts do not expose a before pair because the database chooses the
create or update branch inside the statement. Relation updates retain the
complete scalar parent object in their before pair; the normalized operation
describes the relation change.

Mutation `beforeCreate`, `beforeUpdate`, `beforeUpsert`, and `beforeDelete` are
observers. They may perform transactional work or throw, but Runtime ignores
their return value. Mutation transformations belong to field or schema
`resolveInput`, before the adapter prepares and locks a target. Result hooks may
still replace the public result.

## Consequences

- Field hook autocomplete exposes only `resolveInput`.
- One field boundary owns normalization and rejection without duplicating
  schema lifecycle phases.
- Parent hooks can compare complete previous and next objects independently of
  the public `select`.
- Prepared target state cannot be invalidated by a late `before*` operation
  replacement.
- Set-based mutations remain set-based; Runtime does not load every matching
  row merely to simulate item hooks.
- ACL and other semantic change integrations compare schema-level mutation
  pairs after persistence.
- Existing field lifecycle declarations and mutation `before*` transforms must
  migrate explicitly.
