# ADR-0057: Independent Query limit and pagination position

- Status: accepted
- Date: 2026-07-31
- Refines: ADR-0052, ADR-0055, ADR-0056
- Supersedes: the pagination-node shape described by ADR-0055
- Refined by: ADR-0155

## Decision

The Query AST stores `limit` once on the query root. Pagination nodes represent
only a position strategy: offset pagination carries `skip`, and cursor
pagination carries an optional opaque `after` token. Neither position node may
redeclare the query limit.

`normalizeQueryLimit` accepts an absent value or a positive safe integer.
`normalizeQueryOffsetPagination` accepts only a non-negative safe `skip`, with
zero normalizing to no offset node. `normalizeQueryCursorPagination` creates a
forward cursor position, including an explicit first-page position with no
`after` token.

Offset and cursor positions are mutually exclusive. The immutable Query builder
will enforce that invariant while allowing `limit` and the chosen position to be
declared in either order.

## Consequences

The developer-facing API has one `.limit()` method rather than repeating a page
size inside `.cursor()`. A query can branch from one limited definition into an
offset or cursor position without copying page-size configuration.

Transports normalize their page-size and position inputs separately before
building the same Query AST. Database adapters receive an unambiguous strategy
while retaining the single limit required to compile SQL.
