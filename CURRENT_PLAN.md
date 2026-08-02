# Current plan: native schema and field hooks

- Status: active
- Started: 2026-08-01
- Objective owner: `@ultimabase/core`, `@ultimabase/postgres`, `@ultimabase/testing`
- Governing decisions: [ADR-0089](docs/adr/0089-native-schema-and-field-hooks.md), [ADR-0090](docs/adr/0090-permission-plugins-through-hooks.md), [ADR-0095](docs/adr/0095-consolidated-foundational-core.md), [ADR-0096](docs/adr/0096-native-hook-declaration-capabilities.md), [ADR-0099](docs/adr/0099-automatic-mutation-transactions.md), [ADR-0100](docs/adr/0100-prepared-mutation-outcomes.md)
- Previous completed objective: [Runtime-to-PostgreSQL E2E](docs/plans/completed/runtime-postgres-e2e.md)

## Objective

Turn the existing low-level Runtime hook registry into a native, typed schema
and inline field lifecycle before access plugins or transports build business
behavior on top of it. Remove the existing CLP, ACL, and field-permission stage
names so optional policy plugins contribute through that same hook system.

The finished vertical must prove this developer contract:

```ts
const UserSchema = new Schema({
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
- Runtime contains no CLP, ACL, role, or field-permission stage and applies generic plugin enforcement monotonically;
- every mutation automatically includes business-hook database work in one rollback boundary;
- `beforeFind` and `afterFind` cover every read terminal without weakening accumulated adapter constraints or field restrictions;
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
- Every mutation is transactional. `{ atomic: false }` never bypasses that boundary; issue 334 may change batch grouping but never separates an item's hooks from its write.
- Every transaction adapter prepares mutations through one opaque single-use handle, keeping complete hook snapshots separate from selected public results.
- `beforeUpsert` receives create and update candidates; only the executed outcome identifies the branch that the database actually selected.
- Reads are not automatically transactional; explicit transactions remain available.
- Business after-hooks run before commit and may roll back. External effects run after commit or through an outbox.
- Set-based `updateMany` and `deleteMany` remain set-based.
- Runtime knows only policy-neutral guards, adapter constraints, and field restrictions; CLP, ACL, and field permissions are optional hook contributors.
- Enforcement hooks can only deny, append constraints, or narrow fields, so later hooks cannot broaden access.
- Guards, constraints, and input or selection restrictions run before effectful business hooks; final output restrictions run after every result transform.
- A general `skipHooks` escape hatch is forbidden.

## Execution order

Complete one issue at a time in this order. Do not start an issue whose
dependencies are incomplete.

1. [x] [213 — Consolidate the foundational Core package](issues/200-core/213-consolidate-foundational-core.md)
2. [x] [324 — Prove the native hook contract boundary](issues/300-query-runtime/324-native-hook-contract-boundary.md)
3. [x] [325 — Declare native schema hooks](issues/300-query-runtime/325-native-schema-hooks.md)
4. [x] [326 — Declare inline field hooks](issues/300-query-runtime/326-inline-field-hooks.md)
5. [x] [327 — Compose hook families and handler lists](issues/300-query-runtime/327-hook-families-and-composition.md)
6. [x] [328 — Add typed plugin hook targets](issues/300-query-runtime/328-plugin-hook-targets.md)
7. [x] [519 — Implement the PostgreSQL transaction adapter lifecycle](issues/500-postgres/519-transaction-adapter-lifecycle.md)
8. [x] [329 — Make every mutation automatically transactional](issues/300-query-runtime/329-automatic-mutation-transactions.md)
9. [x] [344 — Define the prepared mutation adapter protocol](issues/300-query-runtime/344-prepared-mutation-adapter-protocol.md)
10. [x] [330 — Execute the native hook lifecycle](issues/300-query-runtime/330-native-hook-dispatcher.md)
11. [ ] [337 — Replace named permission stages with hook enforcement](issues/300-query-runtime/337-policy-neutral-hook-enforcement.md)
12. [ ] [338 — Add the adapter constraint compiler registry](issues/300-query-runtime/338-adapter-constraint-compiler-registry.md)
13. [ ] [331 — Add find and output hooks](issues/300-query-runtime/331-find-and-output-hooks.md)
14. [ ] [332 — Add transaction finalization hooks](issues/300-query-runtime/332-transaction-hook-lifecycle.md)
15. [ ] [333 — Protect hook execution and expose diagnostics](issues/300-query-runtime/333-hook-safety-and-observability.md)
16. [ ] [340 — Expose the native HookContext class](issues/300-query-runtime/340-hook-context-class.md)
17. [ ] [334 — Define bulk hook and non-atomic grouping semantics](issues/300-query-runtime/334-bulk-hook-semantics.md)
18. [ ] [508 — Implement PostgreSQL bulk and upsert execution](issues/500-postgres/508-transactions-bulk-upsert.md)
19. [ ] [335 — Verify native hooks against PostgreSQL](issues/300-query-runtime/335-native-hooks-postgres-e2e.md)

Issue 519 is a strict prerequisite of issue 329 because mandatory Core mutation
transactions must not break the existing PostgreSQL CRUD vertical. Issue 344
then gives issue 330 stable mutation snapshots and implements the singular
PostgreSQL path. Issue 508 completes bulk and upsert execution before issue 335
proves the full live hook lifecycle.

## Resume protocol

When resuming after context loss:

1. Read `AGENTS.md`, ADR-0089, ADR-0090, and this file completely.
2. Inspect `git status` and preserve unrelated changes.
3. Read the current issue, every package README in scope, and its referenced ADRs.
4. Confirm every dependency issue is `done`.
5. If the current issue is already `done`, move to the first incomplete entry above.
6. Implement only that issue, including source-colocated runtime/type tests, public IntelliSense tests, documentation, and a Changeset when the public API changes.
7. Run targeted checks, then the broader checks justified by the change.
8. Show the resulting developer-facing API before asking whether to push.

Do not begin milestone 4 permission implementations until issue 337 has removed
the named Runtime stages and proven monotonic hook enforcement.

## Current issue

[337 — Replace named permission stages with hook enforcement](issues/300-query-runtime/337-policy-neutral-hook-enforcement.md)

Native schema, field, and plugin declarations now execute through one compiled
transaction-aware dispatcher. Issue 337 replaces the remaining CLP, ACL, and
field-permission stage names with generic monotonic enforcement effects before
optional permission plugins build on this lifecycle.

## Progress log

Update this list after every completed issue so the next agent can resume
without reconstructing repository history.

- 213 — `done` — Schema, Query, Access, application orchestration, and Runtime now share one cohesive Core package under ADR-0095.
- 324 — `done` — ADR-0096 and source plus packed-package fixtures prove precise schema and field declaration inference without exposing hook data in structural definitions.
- 325 — `done` — `new Schema({ hooks })` now validates and retains typed immutable lifecycle declarations without exposing them as structural schema metadata.
- 326 — `done` — Every built-in and plugin field now declares exact value hooks through private immutable capabilities without changing metadata or compact hovers.
- 327 — `done` — Direct handlers, non-empty ordered lists, typed family maps, immutable normalization, and sequential composition helpers now share one contract.
- 328 — `done` — Owner-bound plugin setup now resolves six typed hook target scopes into isolated immutable snapshots with source and packed IntelliSense coverage.
- 519 — `done` — PostgreSQL transactions borrow one client, share the private Drizzle executor, sanitize lifecycle failures, and release or destroy exactly once.
- 329 — `done` — All eight mutation kinds reuse one automatic or explicit transaction, nested hook-stage work is rollback-only, reads remain direct, and master elevation retains the active scope.
- 344 — `done` — Runtime now prepares every mutation; typed immutable outcomes isolate selected public results from stable singular PostgreSQL targets and complete logical materializations.
- 330 — `done` — Compiled schema, field, and plugin hooks now resolve, validate, wrap prepared mutations, consume complete materializations, emit semantic changes, and roll back atomically.
- 337 — `planned` — Policy-neutral enforcement waits for the typed plugin targets and native dispatcher.
- 338 — `planned` — The generic constraint compiler registry waits for policy-neutral constraint contracts from issue 337.
- 508 — `planned` — PostgreSQL bulk and upsert support follows the prepared-mutation protocol from issue 344 and remains required before issue 335.
