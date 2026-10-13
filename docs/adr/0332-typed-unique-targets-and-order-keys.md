# ADR-0332: Typed unique targets and order keys

- Status: accepted
- Date: 2026-10-13
- Refines: ADR-0297 (form D declaration and named types), ADR-0301 (Prisma-like queries);
  applies ADR-0288
- Approval: the post-documentation fix pass decided by the user on 2026-10-13; record accepted by the user on 2026-10-13

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

## Amendment (2026-10-13)

Decided by the user on 2026-10-13. The implementation found that Runtime accepted two kinds of
unique targets the types do not offer, contradicting "No call that works at runtime is refused":
unique indexes declared in the final `.with`, and partial unique indexes (a `where`). Runtime is
aligned with the types instead of the reverse:

- A unique target is `id`, a field declared `indexed: 'unique'` (by the application or by a
  plugin that adds the field), or a unique index without `where` declared in `define({ indexes })`
  with all of its fields. The same rule holds at runtime and in the types: Decision 4 no longer
  keeps Runtime's wider check.
- Why `.with` indexes are excluded: form D types the schema without reading `.with`, so a
  `.with` index cannot become a typed target without making every schema contract read the final
  rules.
- Why partial indexes are excluded: a partial unique index identifies one row only among the rows
  its `where` matches, not in general, and a PostgreSQL `ON CONFLICT` on it needs its predicate.
  A partial unique index of `define` leaves the types as well.

Consequences:

- `updateOne`, `deleteOne`, `upsertOne` and the items of `updateMany`, `deleteMany` and
  `upsertMany` that target a `.with` or a partial unique index now fail at runtime with the
  existing unique-target error, whose text names the rule:
  `… must match id, a unique field or one non-partial unique index of define`.
- Such indexes remain storage indexes: they are created, synchronized and enforced as before.
  Unique indexes a plugin adds through a schema patch (`addSchemaIndex`) are storage indexes
  too; a plugin that needs a unique target adds a field declared `indexed: 'unique'`.
- Documentation impact: both (Core query and mutation pages, the Soft Delete page, this record).
