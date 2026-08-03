# Current plan: native hooks and contextual execution

- Status: completed
- Started: 2026-08-01
- Objective owner: `@ultimabase/core`, `@ultimabase/postgres`, `@ultimabase/testing`
- Governing decisions: [ADR-0089](docs/adr/0089-native-schema-and-field-hooks.md), [ADR-0090](docs/adr/0090-permission-plugins-through-hooks.md), [ADR-0095](docs/adr/0095-consolidated-foundational-core.md), [ADR-0096](docs/adr/0096-native-hook-declaration-capabilities.md), [ADR-0099](docs/adr/0099-automatic-mutation-transactions.md), [ADR-0100](docs/adr/0100-prepared-mutation-outcomes.md), [ADR-0102](docs/adr/0102-policy-neutral-monotonic-enforcement.md), [ADR-0103](docs/adr/0103-versioned-adapter-constraint-compilers.md), [ADR-0104](docs/adr/0104-read-hook-execution-and-output-resolution.md), [ADR-0105](docs/adr/0105-transaction-hook-journal.md), [ADR-0106](docs/adr/0106-hook-execution-safety-and-diagnostics.md), [ADR-0107](docs/adr/0107-hook-context-capabilities-and-events.md), [ADR-0108](docs/adr/0108-contextual-query-terminal-execution.md), [ADR-0109](docs/adr/0109-constructible-schema-models.md), [ADR-0110](docs/adr/0110-concise-singular-query-terminals.md), [ADR-0111](docs/adr/0111-non-atomic-bulk-hook-semantics.md), [ADR-0113](docs/adr/0113-plugin-owned-authentication-context.md), [ADR-0115](docs/adr/0115-immutable-model-commands.md)
- Previous completed objective: [Runtime-to-PostgreSQL E2E](docs/plans/completed/runtime-postgres-e2e.md)

## Objective

Turn the existing low-level Runtime hook registry into a native, typed schema
and inline field lifecycle before access plugins or transports build business
behavior on top of it. Remove the existing CLP, ACL, and field-permission stage
names so optional policy plugins contribute through that same hook system.

The finished vertical must prove this developer contract:

```ts
const User = Schema.define({
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
- Every mutation is transactional. `{ atomic: false }` stops at the first persistence failure, returns the successful prefix explicitly, and never separates an item's hooks from its write.
- Every transaction adapter prepares mutations through one opaque single-use handle, keeping complete hook snapshots separate from selected public results.
- `beforeUpsert` receives create and update candidates; only the executed outcome identifies the branch that the database actually selected.
- Reads are not automatically transactional; explicit transactions remain available.
- Business after-hooks run before commit and may roll back. External effects run after commit or through an outbox.
- Set-based `updateMany` and `deleteMany` remain set-based.
- Runtime knows only policy-neutral guards, adapter constraints, and field restrictions; CLP, ACL, and field permissions are optional hook contributors.
- Enforcement hooks can only deny, append constraints, or narrow fields, so later hooks cannot broaden access.
- Guards, constraints, and input or selection restrictions run before effectful business hooks; final output restrictions run after every result transform.
- Guards, constraints, and field restrictions are reevaluated into the existing monotonic state after business operation transforms, so value-derived decisions cannot become stale.
- Constraint payloads use explicit positive integer versions, while compiler ownership and database-specific output stay behind an application-owned adapter target.
- A general `skipHooks` escape hatch is forbidden.
- `Schema.define()` returns the schema-specific draft and result class; mutable dirty tracking and direct model-to-adapter persistence remain forbidden.
- Core authority contains only anonymous and master execution; authentication and user identity are optional plugin-owned typed context values.
- Query terminals accept no session token, user identifier, or provider credential.

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
11. [x] [337 — Replace named permission stages with hook enforcement](issues/300-query-runtime/337-policy-neutral-hook-enforcement.md)
12. [x] [338 — Add the adapter constraint compiler registry](issues/300-query-runtime/338-adapter-constraint-compiler-registry.md)
13. [x] [331 — Add find and output hooks](issues/300-query-runtime/331-find-and-output-hooks.md)
14. [x] [332 — Add transaction finalization hooks](issues/300-query-runtime/332-transaction-hook-lifecycle.md)
15. [x] [333 — Protect hook execution and expose diagnostics](issues/300-query-runtime/333-hook-safety-and-observability.md)
16. [x] [340 — Expose the native HookContext class](issues/300-query-runtime/340-hook-context-class.md)
17. [x] [339 — Define constructible schema model classes](issues/300-query-runtime/339-constructible-schema-models.md)
18. [x] [347 — Execute Query terminals through the current context](issues/300-query-runtime/347-contextual-query-terminals.md)
19. [x] [345 — Add concise singular terminal aliases](issues/300-query-runtime/345-singular-terminal-aliases.md)
20. [x] [334 — Define bulk hook and non-atomic grouping semantics](issues/300-query-runtime/334-bulk-hook-semantics.md)
21. [x] [508 — Implement PostgreSQL bulk and upsert execution](issues/500-postgres/508-transactions-bulk-upsert.md)
22. [x] [335 — Verify native hooks against PostgreSQL](issues/300-query-runtime/335-native-hooks-postgres-e2e.md)
23. [x] [350 — Make request identity plugin-owned](issues/300-query-runtime/350-plugin-owned-request-identity.md)
24. [x] [348 — Add terminal-only Query authority options](issues/300-query-runtime/348-query-terminal-authority.md)
25. [x] [349 — Add immutable model persistence commands](issues/300-query-runtime/349-immutable-model-persistence.md)

Issue 519 is a strict prerequisite of issue 329 because mandatory Core mutation
transactions must not break the existing PostgreSQL CRUD vertical. Issue 344
then gives issue 330 stable mutation snapshots and implements the singular
PostgreSQL path. Issue 508 completes bulk and upsert execution; issue 335 now
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

None. The native hooks and contextual execution objective is complete through
[349 — Add immutable model persistence commands](issues/300-query-runtime/349-immutable-model-persistence.md).

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
- 337 — `done` — Five protected policy-neutral factories now deny, append immutable adapter constraints, intersect fields, reevaluate transformed operations monotonically, and leave absent policies without placeholders.
- 338 — `done` — Application-owned versioned compiler definitions retain plugin ownership; PostgreSQL safely parameterizes and combines every claimed constraint across reads, locked targets, and final singular writes.
- 331 — `done` — Every read terminal now shares selection-preserving `beforeFind`, exact `afterFind`, readable child-first field output resolution, pre-hook projection, and final monotonic restriction without opening an automatic transaction.
- 332 — `done` — One transaction journal now preserves operation order, immutable per-schema commit summaries, semantic field changes, confirmed rollback truth, and best-effort post-finalization observers across automatic and explicit transactions.
- 333 — `done` — One application-owned executor now gives every native, low-level, enforcement, and finalization hook stable structural recursion protection, cooperative cancellation, immutable correlation context, and isolated redacted diagnostics.
- 340 — `done` — Runtime-owned HookContext now exposes exact revocable nested queries, immutable request and hook identity, capability checks, and named JSON events buffered on the outer transaction for ordered post-commit delivery.
- 339 — `done` — Schema.define now produces the registered schema class, immutable typed drafts, fresh static Query branches, neutral infrastructure metadata, and exact selection-aware Runtime model results.
- 347 — `done` — Every immutable Query now owns exact terminals that resolve the active request or an explicit UltimaBase instance while preserving hook transaction safety and application isolation.
- 345 — `done` — Query now exposes selection-aware `update()` and `delete()` aliases while retaining explicit `*One` and unambiguous `*Many` methods under ADR-0110.
- 334 — `done` — Atomic collections remain all-or-nothing, non-atomic create/upsert now return an immutable completed-or-stopped prefix result, hooks retain one transaction and operation cycle, and set-based update/delete never load rows.
- 335 — `done` — A public-export PostgreSQL E2E now proves schema, field, plugin, policy-neutral, transaction, finalization, read, and set-based bulk hook behavior against a worker-isolated live database.
- 350 — `done` — Core retains only anonymous and audited master authority; nominal plugin-owned tokens now validate and expose immutable typed request values through RequestContext and HookContext.
- 348 — `done` — Every Query terminal now inherits, accepts one application-owned plugin context, or requests audited master authority through one documented server-only options interface outside the AST.
- 349 — `done` — Immutable draft and persisted commands now delegate create, upsert, update, and delete through the contextual Query pipeline while retaining protected identity and exact public projections.
- 508 — `done` — PostgreSQL now executes ordered create/upsert collections, set-based update/delete statements, exact upsert branches, and recoverable non-atomic prefixes through one prepared transaction adapter.
