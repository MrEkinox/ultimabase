# ADR-0308: One checked vocabulary for pointer and relation links

- Status: proposed
- Date: 2026-10-09
- Supersedes, once accepted: ADR-0243 where pointer `disconnect: true` and relation
  `clear: true` are commands, where explicit `null` is an invalid pointer command and where
  `connect` accepts only an identifier; every path that stores a raw `Pointer` in mutation data
- Refines: ADR-0118 (pointers and relations), ADR-0243 (bounded nested writes), ADR-0299 and
  ADR-0306 (the `connect` visibility check they leave to their own record); applies ADR-0288
- Approval: decided by the user on 2026-10-09 (`docs/handoff/api-ideale-decisions.md`, decision
  11 as revised; `docs/handoff/revue-plugins/access.md`, decision 14, fault 2;
  `docs/handoff/revue-plugins/roles.md`, decision 3); awaiting validation of this record

## Context

Two forms link rows today: `{ connect: id }` in schema commands
(`packages/core/src/schema/nested-writes/inputs.ts`) and a raw `Pointer` in model data
(`SourceFieldModeValue`, `packages/core/src/schema/schema/source-fields.ts`), used by model
drafts. Only `connect` checks that the target is visible: assigning
`author: Author.pointer(id)` links a hidden row and reveals its existence (success against a
foreign-key error). Passing a `Pointer` to `connect` is a long type error.

## Decision

1. **Pointer fields.** Create data: `{ connect: target }` or `{ create: data }`; an optional
   pointer may be `null` or omitted. Update data: `{ connect: target }`, `{ create: data }`,
   `{ update: data }` (the linked row), or `null` to unlink an optional pointer, which replaces
   `{ disconnect: true }`.
2. **Relation fields.** Create data: `{ connect: [...] }` and/or `{ create: [...] }`. Update data:
   `connect`, `disconnect`, `create`, `update` (`{ id, data }` items) combined as in ADR-0243, or
   the exclusive `{ set: [...] }`; `{ set: [] }` replaces `{ clear: true }`.
3. **Targets.** `connect`, `disconnect` and `set` items accept a target identifier or a
   `Pointer` of the declared target already in hand (`{ connect: todo.assignee }`). A `Pointer`
   of another schema is a type error and a `VALIDATION_ERROR` naming the field.
4. **No other link form.** A raw `Pointer` or identifier assigned directly to a pointer field in
   `data` is a type error and a `VALIDATION_ERROR` whose message shows `{ connect: id }`.
   `Schema.pointer(id)` remains a value for comparisons, filters (ADR-0307) and ACL entries.
5. **Every link checks visibility.** For a non-Master caller each target named by `connect` or
   `set` must be visible for a single-row read (`read`, `one`) under every installed policy,
   evaluated in the mutation's transaction before the write; a missing or hidden target fails
   with the same `NOT_FOUND`, naming the field and target schema, and the whole graph rolls back.
   `disconnect` names only visible linked targets; a hidden one is `NOT_FOUND` as well, and `set`
   keeps hidden memberships (ADR-0243). Master skips visibility, never existence (ADR-0299).
6. Plugins and transports link through the same commands: Roles members and included roles,
   REST and GraphQL nested inputs.

## Consequences

- Consumers to migrate: nested-write inputs, normalization and preflight
  (`packages/core/src/schema/nested-writes/`, `packages/core/src/runtime/nested-writes/`),
  source types, Roles (`packages/roles-plugin/src/role-member.ts`), REST and GraphQL mutation
  inputs (`packages/graphql-plugin/src/mutation-input-compiler.ts`), examples, `create-app`
  templates, `apps/website/content/docs/1.0.0/core/writing-data/nested-writes.mdx` and
  `core/data-modeling/relationships.mdx`.
- Tests: each command with an identifier and with a `Pointer`; wrong-schema `Pointer`; raw
  `Pointer` in `data` rejected; `null` unlinks and is rejected on a required pointer;
  `set: []`; hidden and missing targets indistinguishable through Core, REST and GraphQL for
  `connect`, `set` and `disconnect`; rollback of the graph; Master links a hidden but existing
  row and fails on a missing one; Roles membership through `connect`.
- Documentation impact: both (nested writes, relationships, Access pages; Core README).

## Out of scope

Prisma's `connectOrCreate`, `upsert` and `delete` nested commands, nested writes on collection
commands, and the relation handles removed by ADR-0310.
