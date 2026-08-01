# Current plan: native schema and field hooks

- Status: active
- Started: 2026-08-01
- Objective owner: `@ultimabase/schema`, `@ultimabase/query`, `@ultimabase/core`, `@ultimabase/runtime`, `@ultimabase/postgres`, `@ultimabase/testing`
- Governing decision: [ADR-0089](docs/adr/0089-native-schema-and-field-hooks.md)
- Previous completed objective: [Runtime-to-PostgreSQL E2E](docs/plans/completed/runtime-postgres-e2e.md)

## Objective

Turn the existing low-level Runtime hook registry into a native, typed schema
and inline field lifecycle before access plugins or transports build business
behavior on top of it.

The finished vertical must prove this developer contract:

```ts
const UserSchema = defineSchema({
	className: 'User',
	fields: {
		email: stringField({
			hooks: {
				resolveInput: ({ value }) => value.trim().toLowerCase(),
			},
		}),
	},
	hooks: {
		beforeSave: ({ operation }) => {
			// One handler covers create, update, and upsert families.
		},
		beforeFind: ({ query }) => query.limit(100),
	},
})
```

Native hooks require no plugin. Plugins may add global, exact-schema,
exact-field, extension, or field-kind hooks through the same fundamental
application dispatcher.

## Definition of done

The objective is complete only when:

- schema and inline field hooks have precise autocomplete, hover documentation, and packed declaration behavior;
- one handler can cover an operation family without repeating `one` and `many` variants;
- plugin hooks append to developer hooks with exact target typing and deterministic ownership;
- every mutation automatically includes business-hook database work in one rollback boundary;
- `beforeFind` and `afterFind` cover every read terminal without weakening access constraints;
- post-commit, rollback, cancellation, error, and recursion behavior is explicit;
- true set-based update/delete operations do not materialize rows for item hooks;
- a root PostgreSQL E2E proves hook writes roll back with a failed primary mutation;
- package documentation distinguishes implemented native APIs from the retained low-level plugin API.

## Frozen decisions

- Hooks are a fundamental framework capability, not a plugin or schema extension.
- Native hooks are declared with schemas and inline fields.
- Inline field hooks infer their own exact value; cross-field logic uses schema hooks.
- Direct phase handlers cover all compatible operations; optional family maps specialize behavior.
- `create`, `update`, `upsert`, `delete`, `save`, and `find` families include singular and bulk terminals.
- Hook lists run sequentially; numeric priorities and implicit parallelism are forbidden.
- Plugin hooks use the same dispatcher and can target global, schema, typed field path, extension, or field-kind scopes.
- Every mutation is transactional. `{ atomic: false }` may change batch grouping but never separates an item's hooks from its write.
- Reads are not automatically transactional; explicit transactions remain available.
- Business after-hooks run before commit and may roll back. External effects run after commit or through an outbox.
- Set-based `updateMany` and `deleteMany` remain set-based.
- Access stages remain reserved and cannot be replaced or removed by business hooks.
- A general `skipHooks` escape hatch is forbidden.

## Execution order

Complete one issue at a time in this order. Do not start an issue whose
dependencies are incomplete.

1. [ ] [324 — Prove the native hook contract boundary](issues/300-query-runtime/324-native-hook-contract-boundary.md)
2. [ ] [325 — Declare native schema hooks](issues/300-query-runtime/325-native-schema-hooks.md)
3. [ ] [326 — Declare inline field hooks](issues/300-query-runtime/326-inline-field-hooks.md)
4. [ ] [327 — Compose hook families and handler lists](issues/300-query-runtime/327-hook-families-and-composition.md)
5. [ ] [328 — Add typed plugin hook targets](issues/300-query-runtime/328-plugin-hook-targets.md)
6. [ ] [329 — Make every mutation automatically transactional](issues/300-query-runtime/329-automatic-mutation-transactions.md)
7. [ ] [330 — Execute the native hook lifecycle](issues/300-query-runtime/330-native-hook-dispatcher.md)
8. [ ] [331 — Add find and output hooks](issues/300-query-runtime/331-find-and-output-hooks.md)
9. [ ] [332 — Add transaction finalization hooks](issues/300-query-runtime/332-transaction-hook-lifecycle.md)
10. [ ] [333 — Protect hook execution and expose diagnostics](issues/300-query-runtime/333-hook-safety-and-observability.md)
11. [ ] [334 — Define bulk hook and non-atomic grouping semantics](issues/300-query-runtime/334-bulk-hook-semantics.md)
12. [ ] [508 — Implement PostgreSQL transactions, bulk, and upsert](issues/500-postgres/508-transactions-bulk-upsert.md)
13. [ ] [335 — Verify native hooks against PostgreSQL](issues/300-query-runtime/335-native-hooks-postgres-e2e.md)

Issues 328, 329, and 508 become independently implementable after their own
dependencies complete, but the numbered order remains the preferred
single-agent sequence. Issue 508 is included explicitly because issue 335 cannot
prove live rollback and bulk behavior without it.

## Resume protocol

When resuming after context loss:

1. Read `AGENTS.md`, ADR-0089, and this file completely.
2. Inspect `git status` and preserve unrelated changes.
3. Read the current issue, every package README in scope, and its referenced ADRs.
4. Confirm every dependency issue is `done`.
5. If the current issue is already `done`, move to the first incomplete entry above.
6. Implement only that issue, including source-colocated runtime/type tests, public IntelliSense tests, documentation, and a Changeset when the public API changes.
7. Run targeted checks, then the broader checks justified by the change.
8. Show the resulting developer-facing API before asking whether to push.

Do not begin access hooks in milestone 4 until the native lifecycle makes their
ordering and transaction interaction explicit.

## Current issue

[324 — Prove the native hook contract boundary](issues/300-query-runtime/324-native-hook-contract-boundary.md)

The issue must settle the dependency-safe declaration shape before production
hook APIs are added. It must not trade away direct autocomplete, compact hovers,
or exact field values to make the package graph easier.

## Progress log

Update this list after every completed issue so the next agent can resume
without reconstructing repository history.

- 324 — `ready` — Native hook contract boundary not started.
- 329 — `ready` — Automatic mutation transactions are dependency-ready but follow issues 324–328 in the preferred sequence.
- 508 — `ready` — PostgreSQL transaction, bulk, and upsert support remains required before issue 335 but follows the native lifecycle work in this plan.
