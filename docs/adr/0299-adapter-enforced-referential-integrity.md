# ADR-0299: Database adapters enforce a written referential-integrity contract

- Status: accepted
- Date: 2026-10-09
- Refines: ADR-0118 (referential actions), ADR-0278 (private-storage references); applies ADR-0288
- Approval: decided by the user on 2026-10-09 in the plugin review
  (`docs/handoff/revue-plugins/adaptateurs.md`, point 1); record accepted by the user on 2026-10-09
- Evidence: `docs/handoff/audit-adaptateurs-base.md`, section 1 (`main` 116cf14e)

## Context

Core declares `onDelete: 'restrict' | 'cascade' | 'setNull'` on pointers, `restrict` by default
(`packages/core/src/schema/fields/builtins/pointer.ts`), and `onDelete: 'cascade' | 'fail'` on
private-storage references (`packages/core/src/private-storage/adapter.ts`). ADR-0118 only says
that a database plugin maps this to "its own foreign-key representation". The single
implementation is PostgreSQL foreign keys (`packages/postgres-plugin/src/schema/schema-compiler.ts`);
Password Auth relies on them to erase sessions and credentials with their user
(`packages/password-auth-plugin/src/sessions.ts`, `credentials.ts`). Neither the behaviour under
concurrent writes nor the error is written down or tested outside PostgreSQL, and an adapter at
snapshot isolation (MongoDB) would let a child be inserted while its parent is deleted.

## Decision

Core owns the contract below; each database adapter enforces it inside the operation's
transaction with whatever its database offers (foreign keys for PostgreSQL, transactional checks
and writes for others). Core does not emulate it.

- **Invariant.** After every commit, each non-null pointer and each private-storage reference
  designates an existing row of its target. A soft-deleted row still exists: soft deletion
  triggers no referential action (Soft Delete review, decision 10).
- **`restrict`** (pointers, default) and **`fail`** (private storage): deleting a referenced row
  fails with `REFERENCE_VIOLATION` (ADR-0302) and the transaction rolls back.
- **`cascade`**: referencing rows are deleted in the same transaction, transitively; a `restrict`
  anywhere in the chain fails the whole deletion.
- **`setNull`**: referencing pointers become `null` in the same transaction (only optional
  pointers may declare it, as today).
- Owning-relation membership is removed when either side is deleted; related rows never are
  (ADR-0118).
- **Concurrency.** A write that references a row and a concurrent deletion of that row never both
  commit with a dangling reference. Either the write commits first and the deletion applies its
  action to the new row, or the deletion commits first and the write fails with
  `REFERENCE_VIOLATION` (or `NOT_FOUND` when Core's `connect` check already sees the absence). An
  adapter without blocking locks must make the two transactions conflict (for example by writing
  to the target in the referencing transaction) and may report the conflict as the transient
  `TRANSACTION_CONFLICT` retried by ADR-0300.
- **Cascades are physical.** Deleted or nulled children run no hooks, Access, ACL, Soft Delete
  rewrite, `afterCommit` or event, and are not checked against the caller's rights; only the root
  deletion is authorized. Code that needs a lifecycle on children deletes them explicitly through
  the API in a hook of the parent deletion.
- The public message of `REFERENCE_VIOLATION` names only the schema of the row being deleted or
  written; the referencing schema and field go to internal details, since referencing rows may be
  invisible to the caller.

## Consequences

- PostgreSQL keeps its foreign keys and maps SQLSTATE 23503 to `REFERENCE_VIOLATION` instead of
  `VALIDATION_ERROR` (`packages/postgres-plugin/src/drizzle/operation-error.ts`).
- Conformance tests, written against PostgreSQL now and moved into the adapter-parameterized
  suite when MongoDB work starts: each action and the default, transitive cascade, `restrict`
  inside a cascade chain, private-storage `cascade` and `fail`, concurrent child insert against
  parent delete for each action (no orphan, documented error), no action on soft deletion, no hook
  on cascaded children.
- Documentation impact: both. Website pages on pointers, deletion and Soft Delete; Core and
  PostgreSQL READMEs (`packages/core/README.md`, section on referential actions).

## Out of scope

Logical cascades that run hooks (Soft Delete review, decision 8); the visibility check of every
link through `connect` (forms decision 11, its own ADR); the MongoDB adapter itself.
