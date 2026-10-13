# ADR-0332: Typed unique targets and order keys

- Status: proposed
- Date: 2026-10-13
- Refines: ADR-0297 (form D declaration and named types), ADR-0301 (Prisma-like queries);
  applies ADR-0288
- Approval: the post-documentation fix pass decided by the user on 2026-10-13

## Context

Writing the verified examples (ADR-0330) found two places where the types accept what Runtime
always refuses:

- `updateOne`, `deleteOne`, `upsertOne` and the items of `updateMany`, `deleteMany` and
  `upsertMany` type their `where` as the schema's full filter. Runtime
  (`normalizeUniqueUpsertTarget`) accepts only distinct non-null equalities naming exactly `id` or
  exactly the fields of one declared unique index, and throws
  `… must match id or one declared unique index` for anything else. A developer learns it only
  when the call runs.
- `orderBy` accepts every field, plugin field kinds included (`orderBy: { acl: 'asc' }`), while
  Runtime only orders by non-list scalar or enum fields of Core's own kinds.

## Decision

1. Each schema contract gains a unique-target input, named `UniqueWhereInput<"Todo">` next to
   `CreateInput` and `UpdateInput`. It is a union with one member per target that Runtime
   accepts: `{ id }`, each field declared `unique`, and each unique index declared in
   `define({ indexes })` with all of its fields. A member's values take the same shorthand and
   `{ eq }` forms as the filter equality, never `null`.
2. Every command that requires a unique target types its `where` (or item `where`) with that
   input. `findOne`, `findMany`, `count` and `exists` keep the full filter.
3. `orderBy` keys are limited to the fields Runtime orders: non-list scalar and enum fields of
   Core's built-in kinds. Plugin field kinds are not orderable until a plugin field-kind
   capability says otherwise (the deferred field-kind record).
4. Runtime checks stay as they are, because untyped transports still reach them.

## Consequences

- Wrong targets and order keys fail at compile time with a diagnostic that names the accepted
  targets. Editor diagnostics and hovers are API: diagnostic tests cover a non-unique field, a
  partial composite index, an extra filter, and `null`.
- Code that compiled but always threw now fails to compile. No call that works at runtime is
  refused.
- Performance: the form D bench (ADR-0297 revised thresholds, TS 6 and TS 7) must stay within
  its thresholds; otherwise the work stops and is reported before merging.
- DX audit against `main`, documentation of the new named type (Core query pages and the
  affected examples), and an ADR-0297 note.
- Documentation impact: both.
