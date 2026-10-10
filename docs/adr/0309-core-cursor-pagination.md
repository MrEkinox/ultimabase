# ADR-0309: Keyset pagination in Core, shared by REST and GraphQL

- Status: accepted
- Date: 2026-10-09
- Supersedes, once accepted: ADR-0227 (Core exposes offset, not cursors); ADR-0155 where it names
  pagination `limit` and `offset`; ADR-0238 where Relay cursors are signed offsets owned by
  GraphQL; ADR-0228 where REST has no cursor
- Refines: ADR-0057 (independent limit), ADR-0302 (null ordering); applies ADR-0288
- Approval: decided by the user on 2026-10-09 (`docs/handoff/revue-plugins/core.md`, decision 5;
  `rest.md`, decisions 5 and 10; `graphql.md`, concept and decision 4); record accepted by the user
  on 2026-10-09 (amended: one `findMany` listing method whose `after` is the last row received,
  positions encoded into wire cursors by the transports)

## Context

Core reads take `limit` and `offset` only (`packages/core/src/query/query/input-contracts.ts`).
REST paginates by offset (`packages/rest-plugin/src/reads.ts`); GraphQL wraps an HMAC-signed
offset in Relay cursors (`packages/graphql-plugin/src/connection-runtime.ts`, `cursor-secret.ts`).
Pages shift under inserts, and ADR-0227 asks for a complete keyset design; here it is.

## Decision

1. **Names.** `limit` becomes `take` and `offset` becomes `skip` everywhere they appear (root
   reads, relation `include`, builders), as in Prisma.
2. **One listing method.** `findMany({ where, orderBy, take, after, select, include })` keeps
   returning an array of at most `take` rows. `after` is the last row previously received from a
   query of the same shape (a result object). There is no separate page method and no cursor
   string in Core; a caller that needs to know whether more rows exist requests `take + 1`.
3. **Keyset order.** Core appends `id` ascending to `orderBy` unless already present, so the
   order is total; without `orderBy` the order is `id` ascending. Ordered fields must be non-list
   scalar or enum fields. `null` sorts last in both directions (ADR-0302) and the keyset
   predicate follows that rule. Rows after the position are those strictly greater in that order.
4. **Position from the row.** Core reads the ordered fields and `id` from `after`, validates each
   value against its field, and turns them into an ordinary caller filter combined with `where`
   by `AND` before policy evaluation. Positions are not signed: Core treats every ordered field
   as selected and as filtered by the caller, so ordering by a field the caller may not read or
   filter fails with `PERMISSION_DENIED` before execution, and row rules and adapter operators
   (ADR-0301) apply as to any caller filter. A forged position grants nothing the caller could not
   request. A row lacking an ordered field (not selected) or `id` fails with `VALIDATION_ERROR`
   naming the missing fields and `publicDetails: { parameter: 'after' }`.
5. **`skip` and `after` are exclusive.** Combining them fails with `VALIDATION_ERROR`. `after` is
   already exclusive of the given row, so Prisma's `skip: 1` idiom is unnecessary, and an offset
   past a keyset position would bring back the cost and instability that the position removes.
6. **Transports.** A shared encoder in the plugin-author export (`@ultimabase/core/plugin`,
   ADR-0311) turns a row's position into an opaque base64url string of at most 4096 characters
   (version, schema name, normalized ordering, wire-encoded ordered values and `id`) and back;
   a malformed string, or one whose schema or ordering differs from the request, fails with the
   same `VALIDATION_ERROR`. REST accepts `take`, `skip` and `after` and, without `skip`, returns
   `nextCursor` (string or `null`) beside `results`. GraphQL maps Relay `first`/`after` to
   `take`/`after`, encodes each edge cursor and sets `hasNextPage` from the extra row. Both share
   the default and maximum `take` chosen in their migration (`rest.md`, decision 5).
   `cursorSecret` and `ULTIMABASE_CURSOR_SECRET` are removed: a position grants nothing, so
   signing it protects nothing, and unsigned positions stay valid across restarts and instances.

## Consequences

- Unchanged rows are never repeated or skipped; a row whose ordered values change may move.
- Consumers: Core read inputs, normalization, pagination AST node and `QueryBuilder`; PostgreSQL
  clause compiler; REST reads and options; GraphQL connection runtime and options; website
  `core/reading-data/ordering-and-pagination.mdx`; Core, REST and GraphQL READMEs.
- Tests: traversal with ascending, descending, mixed and nullable orderings and ties; inserts and
  deletes between pages; `id` tie-breaker; forged position equals the matching filter; refusal
  when an ordered field is hidden or not filterable; missing ordered field; `skip` with `after`;
  encoder round trip, malformed and mismatched strings; REST and GraphQL return the same pages;
  PostgreSQL compiles a keyset predicate and no `OFFSET`.
- Documentation impact: both.

## Out of scope

Backward pagination, `totalCount` (GraphQL decision 4), positions in `include`, page sizes.

## Step 3b amendment (2026-10-10)

Decided by the user on 2026-10-10.

1. **`after` in relation includes.** An included relation accepts `after` with `take`,
   mutually exclusive with `skip`, under the same keyset rules as a root `findMany`: the
   included order is completed by `id` ascending, the position is validated and turned into
   an ordinary filter of the included read, and it applies to every parent collection.
   PostgreSQL compiles it without `OFFSET`. GraphQL relation connections map `first` and
   `after` to it again, encode edge cursors with the target schema and set `hasNextPage` from
   one extra row.
2. **Common transport page window.** REST and GraphQL take one identical option,
   `restPlugin({ pagination: { defaultTake, maxTake } })` and
   `graphqlPlugin({ pagination: { defaultTake, maxTake } })`, defaults 100 and 1000. Both
   values are positive safe integers and `defaultTake` must not exceed `maxTake`. It replaces
   REST `maxLimit` and GraphQL `limits.defaultPageSize` / `limits.maxPageSize`, without
   aliases. A request above `maxTake` keeps each transport's behaviour: REST answers
   `REST_READ_INVALID_INPUT` (400), GraphQL returns a GraphQL error ("GraphQL first must be an
   integer from 0 to <maxTake>"). Server-side `findMany` keeps no default `take`.
