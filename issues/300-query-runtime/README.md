# Milestone 3 — Query and Runtime

Implement transport-neutral operations and the single execution engine.

Issue 323 closed the application assembly seam discovered before the first real
database E2E. Its original context is retained in the
[completed plan](../../docs/plans/completed/runtime-postgres-e2e.md).

The completed
[native-hook plan](../../docs/plans/completed/native-hooks-and-contextual-execution.md)
refined the low-level hook and transaction foundation into native schema and
inline field hooks. It preserved issue 318 as the plugin-contribution
foundation, removed permission-specific Runtime stages, added automatic
mutation transactions, prepared stable mutation outcomes, and ended with a
PostgreSQL rollback E2E. Its dependency-first history includes PostgreSQL bulk
and upsert issue 508 before the final E2E.

Issue 344 is the adapter prerequisite for the native dispatcher. It requires
every transaction adapter to prepare one opaque mutation handle and keeps
complete previous/current hook snapshots separate from selected public results.
Its PostgreSQL work covers singular create, update, and delete; issue 508 owns
the remaining bulk and concurrency-resolved upsert execution.

Issue 336 retains the explicit future itemized update/delete work without
placing it on the active hook-lifecycle critical path.

Issue 337 removes the old named permission stages after the native dispatcher
exists. Persisted ACL, tenancy, and community policies then share
the same monotonic plugin-hook enforcement boundary.

Issue 338 adds the generic adapter compiler registry required to execute opaque
constraints against PostgreSQL. The registry remains policy-neutral: concrete
ACL, tenancy, or soft-delete constraint kinds belong to their owning plugins.

Issue 339 replaces the generic `UltimaObject` proposal with constructible
schema-specific classes from `Schema.define()`. Issue 349 adds immutable
instance persistence commands only after contextual Query terminals and
authority options exist. `HookContext` and the future server-side `QueryCursor`
remain Runtime-owned capabilities. All model commands preserve plain adapter
boundaries and delegate through Query rather than implementing mutable Active
Record state.

Issue 342 retains the deferred schema-aware Query JSON round trip for transport
plugins. Its concise input must remain validation-only builder state, preserve
safe selection inference, and settle lossless value codecs before becoming a
public contract.

Issue 343 adds the small `byId(id)` builder alias without introducing terminal
variants or another adapter operation.

After issue 347 consolidates execution on `Query`, issue 345 completes the
concise singular terminal vocabulary with `update()` and `delete()` while
retaining explicit `*Many` methods for collection and set-based behavior. Issue
346 then protects the cardinality-neutral hook contract across the bulk and
itemized implementations: terminal kinds remain exact discriminants, but
developers never declare separate `One` and `Many` hook phases.

Issues 347, 350, and 348 consolidate builder, context, and execution DX around
one immutable `Query` class. Core first removes native user authority in favor
of plugin-owned typed context values. Terminals then resolve the active Runtime
scope or an explicitly supplied `UltimaBase` and context, with trusted
backend-only master elevation. This removes `BoundQuery`, `context.query`,
session handling in Query, and repeated context plumbing while preserving hook
transactions, revocable leases, application isolation, and the transport
authority boundary.

Issue 349 completes the object-level DX with immutable `create`, `upsert`,
`update`, and `delete` commands on the schema-specific draft or persisted
instance. Collection operations remain on `Post.query()` and every instance
command reaches the same Query and Runtime pipeline.
