# ADR-0054: Deterministic logical filter normalization

- Status: accepted
- Date: 2026-07-31
- Refines: ADR-0004, ADR-0052

## Decision

Query filters compose leaf expressions recursively with `and`, `or`, and `not`
nodes. The public vocabulary follows the simple compound-query model familiar
from Parse, while UltimaBase normalizes its own immutable transport-neutral AST.
The logical discriminants and `constant` are reserved so plugin operators cannot
shadow structural nodes.

An empty `and` normalizes to constant `true`, and an empty `or` normalizes to
constant `false`. These boolean identity values also make nested normalization
explicit: neutral constants are removed, a decisive constant collapses its
group, and negating a constant inverts it.

Nested groups of the same kind flatten in declaration order. A one-child group
becomes that child, and double negation becomes the original expression. Mixed
`and` and `or` groups remain nested. The normalizer does not reorder, deduplicate,
apply De Morgan transformations, or otherwise change evaluation structure.

Normalization creates frozen logical records and copied frozen expression
arrays. It never mutates caller-owned nodes or arrays. Leaf nodes are immutable
atoms whose factories retain responsibility for snapshotting operator-specific
values, including plugin-owned data.

Malformed logical nodes and circular logical references fail before a normalized
tree is returned.

## Consequences

Class APIs, REST, GraphQL, permissions, and adapters observe the same canonical
logical shape. Empty and redundant combinations no longer require
adapter-specific special cases, and compilers can treat constant nodes as
ordinary truth expressions.

Preserving order and avoiding aggressive boolean rewrites keeps diagnostics and
generated queries traceable to developer input. More advanced optimization may
be introduced behind a separate compiler boundary without changing the Query
AST normalization contract.
