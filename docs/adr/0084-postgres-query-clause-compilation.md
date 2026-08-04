# ADR-0084: Stable PostgreSQL query clause compilation

- Status: accepted
- Date: 2026-08-01
- Extends: ADR-0004, ADR-0007, ADR-0055, ADR-0056, ADR-0057

## Decision

`@ultimabase/postgres-plugin` compiles the normalized Query projection, ordering,
limit, offset, and cursor position into private Drizzle clauses shared by read,
update, and delete operations. An empty selection loads every compiled field;
an explicit selection loads exactly those columns. Field-permission plugins
remain responsible for removing unreadable fields before the adapter receives
the normalized Query.

Offset pagination retains its normalized non-negative offset. Cursor pagination
always normalizes ordering through Query's stable-order contract, which appends
the framework `id` UUID as the final tie-breaker. Ascending terms use `NULLS
LAST`; descending terms use `NULLS FIRST`, so comparison predicates do not
depend on PostgreSQL defaults.

The Query builder represents a first cursor page with `.after()` and no token.
Subsequent pages carry an opaque token. Authentication and structural unsealing
happen before SQL compilation; the PostgreSQL compiler accepts only the
validated payload alongside the AST and never decodes or interpolates the
opaque token itself.

Each resumed page uses a lexicographic predicate: a row follows the cursor when
its first differing order value follows the cursor value, while every preceding
value is equal. Cursor values pass through the same field codecs as filters and
writes. Null values are accepted only by nullable fields and follow the explicit
null placement. Payload version, schema class, field order, and direction must
match the normalized query exactly.

## Consequences

Equal sort values cannot create gaps or duplicates under stable data because
the unique `id` term completes the ordering. Every pagination clause remains
parameterized and independent from a concrete Runtime or transport.

Developers who create a cursor from a returned object must include its ordered
fields in the selection. Automatic response envelopes and cursor emission are
transport concerns and are not introduced by this adapter compiler.
