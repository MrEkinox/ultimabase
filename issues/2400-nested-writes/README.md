# Milestone 24 — Nested writes before the first release

- Status: planned

Let one singular schema mutation describe a typed recursive pointer and relation
write graph inside `data`, while preserving the same Runtime and transaction
semantics as separately issued commands.

## Execution order

1. [ ] [2401 — Decide the nested-write contract](2401-nested-write-contract.md)
2. [ ] [2402 — Compile typed nested inputs and the Core graph](2402-nested-write-input-graph.md)
3. [ ] [2403 — Execute nested create and connect](2403-nested-create-connect.md)
4. [ ] [2404 — Execute nested update and relation changes](2404-nested-update-relation-changes.md)
5. [ ] [2405 — Expose nested writes through REST](2405-rest-nested-writes.md)
6. [ ] [2406 — Expose nested writes through GraphQL](2406-graphql-nested-writes.md)
7. [ ] [2407 — Prove the public nested-write vertical](2407-nested-write-public-vertical.md)
8. [ ] [2408 — Audit and close nested writes](2408-nested-write-final-audit.md)

## Existing foundations

- Core already owns typed pointer and relation metadata, immutable relation
  handles, protected relation deltas, schema mutation commands, item-oriented
  Runtime behavior, automatic transactions, and transaction-bound mutation
  result inclusion.
- PostgreSQL already executes pointer writes and owning or inverse relation
  mutations without exposing join rows.
- The application request executor already gives REST and GraphQL one narrow
  transport-neutral entry to the same Runtime.
- REST already decodes schema-aware create and update bodies. GraphQL already
  generates schema-aware create inputs and field-oriented update wrappers.

## Candidate boundaries pending issue 2401

- Nested commands appear inside `data`, but normalize into a distinct immutable
  Core graph before Runtime effects.
- Pointer fields use one command from `connect`, `create`, `update`, or
  `disconnect`, subject to root kind and field nullability.
- Relation fields use `connect`, `create`, `update`, `disconnect`, `set`, or
  `clear`; replacement commands are exclusive and incremental conflicts fail
  before execution.
- A field-bound identity input carries only a canonical object ID. Core derives
  and validates the target schema from the field declaration.
- Every nested object is a normal mutation with independent validation, Hooks,
  Access, ACL, and protected constraints inside one inherited transaction.
- REST and GraphQL own only wire decoding and result representation.

## Stop boundaries

- Issue 2401 must produce an accepted ADR and explicit approval before public
  types or Runtime behavior change.
- A root mutation cannot lend authorization to a child or weaken target
  visibility, requiredness, referential actions, or protected relation deltas.
- No transport, database adapter, generated client, or persistence-plan rewrite
  may become the authoritative nested-write executor.
- No nested target delete/upsert, bulk-root nesting, partial success,
  provisional object references, or arbitrary unique-filter connect enters v1
  without a separate accepted decision.

## Completion gate

The milestone closes only after direct TypeScript, Typegen-free JavaScript,
REST, networkless GraphQL, Yoga, packed packages, and PostgreSQL Testcontainers
prove identical atomic graph semantics. The final audit covers recursive type
DX, limits, conflicts, application isolation, authority, Access, ACL,
Validation, Hooks, rollback, cancellation, safe errors, documentation,
coverage, and complete repository validation.
