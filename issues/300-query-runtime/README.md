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

Issue 336 is superseded by ADR-0164. Generated-schema collection mutations are
now ordered, atomic batches of singular item operations rather than a set-based
surface plus optional itemized terminals.

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
boundaries and delegate through the same RequestEngine pipeline rather than
implementing mutable Active Record state.

Issue 342 retains the deferred schema-aware Query JSON round trip for transport
plugins. Its concise input must remain validation-only builder state, preserve
safe selection inference, and settle lossless value codecs before becoming a
public contract.

Issue 343 adds the small `byId(id)` builder alias without introducing terminal
variants or another adapter operation.

ADR-0132 makes Query read-only and moves writes to generated schema classes.
ADR-0149 gives schema commands explicit `One` and `Many` names, while ADR-0152
makes typed object inputs on schema-root `findOne`, `findMany`, `get`, `count`,
and `exists` the canonical read contract. `QueryBuilder` remains an immutable,
non-executing composition utility. ADR-0164 itemizes collection writes before
public item Access and hooks, which use cardinality-free business kinds.

Issues 347, 350, and 348 supplied the contextual execution and authority
foundation that these later decisions refined. Reads and writes resolve the
active Runtime scope or an explicitly supplied `UltimaBase` and context, with
trusted backend-only master elevation. There is no `BoundQuery`, process-wide
application singleton, session-owned Query, or mutable execution builder.

Issue 349 completes the object-level DX with immutable `create`, `upsert`,
`update`, and `delete` commands on the schema-specific draft or persisted
instance. Collection operations remain on the generated schema class and every
instance command reaches the same Runtime pipeline.

Issue 351 completed the first part of the now
[paused ACL hardening and DX plan](../../CURRENT_PLAN.md). It distinguishes optional
post-commit notifications from required event delivery so ACL, roles, and
future feature plugins do not register synthetic no-op consumers.

Issue 354 focuses the public schema hook contract after the item-oriented
mutation migration. After-operation hooks now receive complete persisted
models independently of result selection, post-commit integrations use named
events, and the redundant schema transaction-hook journal is removed.
