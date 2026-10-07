# 422: Add Access declaration utilities

- Status: completed
- Milestone: 4
- Packages: `@ultimabase/core`
- Depends on: 421
- ADR: ADR-0116
- Refined by: 436, ADR-0169

## Goal

Provide a minimal set of neutral helpers for concise, explicit Access
declarations without adding permission concepts, runtime handlers, or hidden
defaults.

## Target developer experience

```ts
import {
	Schema,
	allMutations,
	allOperations,
	allowAll,
	denyAll,
	stringField,
} from '@ultimabase/core'

const PublicPost = Schema.define({
	className: 'PublicPost',
	access: {
		operation: {
			...allOperations(denyAll),
			read: {
				one: allowAll,
				many: allowAll,
				count: denyAll,
				exists: allowAll,
			},
		},
	},
	fields: {
		secret: stringField({
			access: {
				read: denyAll,
				create: allowAll,
				update: denyAll,
			},
		}),
	},
})

const ReadOnlyPost = Schema.define({
	className: 'ReadOnlyPost',
	access: {
		operation: {
			read: allowAll,
			...allMutations(denyAll),
		},
	},
	fields: {},
})
```

The helpers also accept one shared callback when every covered family follows
the same authority decision:

```ts
operation: {
	...allOperations(({ context }) => context.access.mode === 'master'),
}
```

## Acceptance criteria

- [x] Export `allowAll` as the literal `true` and `denyAll` as the literal `false` from the root `@ultimabase/core` public API.
- [x] `allOperations(rule)` returns an immutable complete declaration containing `read`, `create`, `update`, `upsert`, and `delete`.
- [x] `allMutations(rule)` returns an immutable complete declaration containing `create`, `update`, `upsert`, and `delete` without a `read` property.
- [x] Both helpers accept a direct boolean or a synchronous or asynchronous operation callback and preserve precise `context` and terminal `kind` inference for the complete family union they cover.
- [x] Helpers retain the supplied callback identity in every returned property rather than allocating wrappers or installing per-request neutral handlers.
- [x] Returned objects are fresh immutable snapshots, so separate declarations cannot mutate or share writable state.
- [x] Native object spread may override an individual family after either helper without special merge behavior.
- [x] Direct `read: allowAll | denyAll` remains the only helper needed for every schema read branch or field read channel; no redundant read-channel helper is added.
- [x] Public JSDoc describes the exact covered families, literal semantics, immutability, override order, and focused examples.
- [x] The Core README documents explicit deny-by-default and read-only configurations.
- [x] Add a Changeset for the new public exports.

## Tests

- [x] Runtime tests cover exact returned keys, literal values, callback identity, frozen snapshots, fresh object identity, and object-spread overrides.
- [x] Compile-time tests prove exact callback context and terminal unions, mutation-only narrowing, return shapes, invalid callback results, and absence of `read` from `allMutations`.
- [x] TypeScript language-service tests verify autocomplete, concise QuickInfo, hover documentation, and root-import discoverability.
- [x] Packed-package tests verify the helpers through `@ultimabase/core` without a deep import.

## Implementation notes

- Implement these as stateless values and arrow-function utilities. They are
  declaration sugar only and must normalize exactly like equivalent handwritten
  objects.
- Prefer the smallest direct implementation. Do not add a registry, builder,
  class, dependency, or callback wrapper for these static objects.

## Out of scope

- Authentication, owner, role, ACL, CLP, tenant, or master-only presets.
- Helpers for field paths, item rules, Access filters, or plugin contributions.
- Runtime execution or policy composition.
