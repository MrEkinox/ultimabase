# ADR-0227: Core Query exposes offset, not cursors

- Status: superseded
- Superseded by: ADR-0309
- Date: 2026-09-04
- Supersedes: ADR-0056
- Refines: ADR-0057, ADR-0058, ADR-0084, ADR-0085, ADR-0152, ADR-0155
- Refined by: ADR-0228, ADR-0247

## Context

Core exposed a transport-neutral opaque cursor contract, a cursor pagination
AST node, cursor codecs, and PostgreSQL keyset compilation. The first-page form
only added stable ordering, while a resumed page required a separately decoded
payload that the normal Runtime execution path never supplied. No public read
response emitted a corresponding next cursor.

An ID-only cursor would merely alias an explicit `orderBy` plus `where` filter
and would be correct only for that fixed ordering. A general cursor for custom
ordering must retain every ordered value, direction, null rule, and a unique
tie-breaker. That complete protocol belongs to the consumer that defines its
wire response and continuation semantics rather than to every Core query.

## Decision

Core collection reads expose `limit` and optional `offset`. `QueryBuilder`
exposes `.limit()` and `.offset()`. The Query AST retains only the normalized
offset pagination node and has no cursor token, codec, payload, error, implicit
ordering, or `.after()` method.

PostgreSQL compiles the exact declared ordering, limit, and offset. It does not
append `id` unless the developer or a transport explicitly includes it in the
ordinary ordering. A caller that needs ID-based iteration may compose the
existing `where`, `orderBy`, and `limit` clauses without another Core concept.

REST v1 exposes offset pagination rather than a cursor. A future SDK may offer
`eachBatch()` or an asynchronous iterator as an ergonomic helper that composes
ordinary query clauses internally. Such a helper does not establish a Core
cursor contract.

GraphQL may independently expose Relay connection arguments, opaque edge
cursors, and `pageInfo`. The GraphQL package owns that protocol and normalizes
it into ordinary Core Query clauses before execution. GraphQL cursor response
metadata does not enter the Query or Operation AST.

## Consequences

The pre-release cursor API and its unexecutable resumed-page path are removed
instead of being carried into REST. Canonical reads have one pagination
strategy and no application cursor secret or codec requirement.

Offset pagination can shift when rows are inserted or deleted and can become
costly at deep offsets. Applications can use explicit unique ordering and
filters for focused iteration. A future transport-independent keyset contract
requires a new accepted ADR backed by a complete producer, consumer, response,
compatibility, and execution design.
