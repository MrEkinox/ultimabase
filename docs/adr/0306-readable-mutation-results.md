# ADR-0306: Mutation results obey row read rules

- Status: accepted
- Date: 2026-10-09
- Supersedes, once accepted: ADR-0180 where the internal result projection "does not replay
  source operation Access" for the root row
- Refines: ADR-0144 and ADR-0146 (mutation result selections), ADR-0164; applies ADR-0288
- Approval: decided by the user on 2026-10-09 in the plugin review
  (`docs/handoff/revue-plugins/access.md`, decision 14, fault 1; confirmed neutral in
  `adaptateurs.md`); record accepted by the user on 2026-10-09

## Context

The results of `create`, `update`, `upsert` and `delete` apply field output rules but not the row
`read` rules, as ADR-0180 intended. Whoever may create or update a row can therefore read back
everything `read` hides from them: defaults, values set by hooks, unchanged columns. PostgreSQL's
`RETURNING` under row-level security refuses that case; UltimaBase adopts the same semantics,
implemented by Core rather than by an adapter.

## Decision

1. **Check.** For a non-Master caller, before commit, Core evaluates the row read constraints of
   every installed policy for a single-row read (`read`, `one`) on each resulting row: after the
   after hooks and before the final output restrictions of the Runtime order, with one `exists`
   query by identifier in the transaction (one grouped query for collection commands). The
   adapter's existing read capability suffices; no adapter changes.
2. **Delete uses the pre-image**, checked on the locked target before the database delete. The
   logical operation decides: a delete that a plugin rewrites into an update (ADR-0200, Soft
   Delete) uses the pre-image. A plugin mutation uses the resulting row unless it declares
   pre-image results, which Soft Delete's `softDeleteOne`, `softDeleteMany`, `purgeOne` and
   `purgeMany` do.
3. **Refusal.** When a row is not readable and the call selects anything beyond `id` (no
   `select`, any other field, or any `include`), Core rejects with `PERMISSION_DENIED`, rolls the
   transaction back and writes nothing. The public message names the schema and says to request
   `select: { id: true }` or to review the `read` rule.
4. **`select: { id: true }` is always allowed** and skips the check: anonymous forms, archiving
   that hides the row. GraphQL treats a selection of only `id` (and `__typename`) as id-only; REST
   offers an id-only selection.
5. Collection commands are atomic: one unreadable row with a non-id selection rejects the call.
6. Field rules keep their behaviour: unselected hidden fields are masked, and selecting a hidden
   field is refused before writing. Included targets keep their own read rules (`null` or `[]`).
7. Master skips the check: it bypasses authorization, not validation.

## Consequences

- One extra indexed `exists` query per mutation with a non-id selection when the schema has a
  read constraint for the caller; none when its read guard grants every row without a filter.
- Behaviour change: a write-only client (for example `read: false`) must request
  `select: { id: true }`; `create-app` templates and REST and GraphQL examples are updated.
- Tests (from the Access review): unreadable result rejected and rolled back for each mutation
  kind; id-only allowed; delete pre-image; Soft Delete delete and `softDeleteOne`; collection
  atomicity; `include` counts as beyond `id`; Master; REST and GraphQL id-only selections.
- Documentation impact: both (Access page, mutation results, Core README).

## Out of scope

Field-level rules, inclusion semantics, and the visibility check of `connect` targets (forms
decision 11, its own ADR).

## Step 2 amendment (2026-10-10)

Decided by the user while reviewing Core migration step 2 (option A). A logical delete is still
checked against the read rules on its pre-image (decision 2), but it returns its post-image:
Soft Delete's `softDelete` and a `delete` that Soft Delete rewrites into a tombstone answer with
the row as written (`isDeleted: true`, and `deletedAt` once it exists), and field output rules
still apply to that row. A physical delete keeps returning its pre-image. Rationale: the row was
readable just before the operation, and only the values the operation wrote are new.

A plugin mutation declares which row is checked with `checkReadable: 'before' | 'after'`
(defaults to `returning`); `softDelete` declares `returning: 'after'` and
`checkReadable: 'before'`. Core gives a delete rewritten into an update the rewrite's values on
the selected fields of its result.
