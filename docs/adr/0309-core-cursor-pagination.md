# ADR-0309: Cursor pagination in Core, shared by REST and GraphQL

- Status: proposed
- Date: 2026-10-09
- Supersedes, once accepted: ADR-0227 (Core exposes offset, not cursors); ADR-0155 where it names
  pagination `limit` and `offset`; ADR-0238 where Relay cursors are signed offsets owned by
  GraphQL; ADR-0228 where REST has no cursor
- Refines: ADR-0057 (independent limit), ADR-0302 (null ordering); applies ADR-0288
- Approval: decided by the user on 2026-10-09 (`docs/handoff/revue-plugins/core.md`, decision 5;
  `rest.md`, decisions 5 and 10; `graphql.md`, concept and decision 4); awaiting validation of
  this record

## Context

Core reads take `limit` and `offset` only (`packages/core/src/query/query/input-contracts.ts`,
ADR-0227). REST exposes offset pagination (`packages/rest-plugin/src/reads.ts`); GraphQL builds
Relay cursors that wrap an HMAC-signed offset (`packages/graphql-plugin/src/connection-runtime.ts`,
`cursor-secret.ts`, `ULTIMABASE_CURSOR_SECRET`), so pages shift under inserts and the two
transports paginate differently. ADR-0227 asks for a complete keyset design; here it is.

## Decision

1. **Names.** `limit` becomes `take` and `offset` becomes `skip` everywhere they appear (root
   reads, relation `include`, builders), as in Prisma.
2. **`findPage`.** `Schema.findPage({ where, orderBy, take, after, select, include })` returns
   `{ items, nextCursor }`. `take` is a required positive integer; `after` is the `nextCursor` of
   the previous page. `nextCursor` is `null` on the last page (Core reads `take + 1` rows).
   `findMany` keeps returning an array with `take` and `skip`, since an array cannot carry the
   cursor; `findPage` has no `skip`. Access treats `findPage` as the `many` operation.
3. **Keyset order.** Core appends `id` ascending to `orderBy` unless already present, so the
   order is total; without `orderBy` the order is `id` ascending. Ordered fields must be non-list
   scalar or enum fields. `null` sorts last in both directions (ADR-0302) and the keyset predicate
   follows that rule.
4. **Cursor.** An opaque base64url string of at most 4096 characters holding a version, the schema
   name, the normalized ordering and the last row's ordered values (wire-encoded by field kind)
   and `id`. It is not signed. Core treats every ordered field as selected and as filtered by
   the caller, so a `findPage` ordered by a field the caller may not read or filter fails with
   `PERMISSION_DENIED` before execution, and decodes `after` into an ordinary caller filter
   combined with `where` by `AND` before policy evaluation. Row rules and adapter operators
   (ADR-0301) apply as to any caller filter: a forged cursor grants nothing the caller could not
   request, and a cursor never carries a value the caller may not read. A malformed cursor, or one
   whose schema or ordering differs from the request, fails with `VALIDATION_ERROR` and
   `publicDetails: { parameter: 'after' }`.
5. **Transports.** REST accepts `take`, `skip` and `after` and returns `nextCursor` with
   `results` when called without `skip`. GraphQL maps Relay `first`/`after` to `take`/`after`;
   `hasNextPage` is `nextCursor !== null`. Edge cursors come from the same Core encoder through a
   plugin-author read variant that returns each row's cursor. Both share the default and maximum
   `take` chosen in their migration (`rest.md`, decision 5). `cursorSecret` and
   `ULTIMABASE_CURSOR_SECRET` are removed.

## Consequences

- Cursors stay valid across restarts and instances without a secret. Unlike offset pages, rows
  whose ordered values do not change are never repeated or skipped; a row whose ordered values
  change between two pages may appear twice or not at all.
- Consumers: Core read inputs, normalization, Query AST pagination node and `QueryBuilder`; the
  PostgreSQL clause compiler (`packages/postgres-plugin/src/query/clause-compiler.ts`); REST reads
  and options; GraphQL connection runtime and plugin options; website
  `core/reading-data/ordering-and-pagination.mdx`; Core, REST and GraphQL READMEs.
- Tests: page traversal with ascending, descending, mixed and nullable orderings and ties;
  inserts and deletes between pages; `id` tie-breaker; forged cursor equals the matching filter;
  cursor refused when an ordered field is hidden or not filterable for the caller; malformed and
  mismatched cursors; REST and GraphQL return the same pages; PostgreSQL compiles a keyset
  predicate and no `OFFSET`.
- Documentation impact: both.

## Out of scope

Backward pagination (`before`, `last`), `totalCount` (GraphQL decision 4), cursors inside
`include`, and the transports' default page sizes.
