# ADR-0083: Parameterized PostgreSQL filter compilation

- Status: accepted
- Date: 2026-08-01
- Extends: ADR-0004, ADR-0007, ADR-0053, ADR-0054

## Decision

`@ultimabase/postgres` recursively compiles the normalized Query filter AST to
private Drizzle `SQL` expressions. Logical constants and `and`, `or`, and `not`
retain their normalized topology. Every built-in primitive operator has an
explicit exhaustive branch.

Equality, inequality, ordered comparison, and membership operands pass through
the compiled field codec and then through Drizzle's column encoder. `null`
uses `IS NULL` or `IS NOT NULL`. Membership containing `null` combines an
`IN`/`NOT IN` expression with the corresponding null predicate; empty inclusion
is false and empty exclusion is true.

String substring operators use `LIKE` after escaping backslash, `%`, and `_`.
The generated pattern and escape character are parameters. Regex sources are
parameters and use PostgreSQL ARE operators. `case-insensitive` selects `~*`;
the four combinations of JavaScript-style multiline and dot-all behavior map
to PostgreSQL newline modes `p`, `n`, `s`, and `w` respectively.

The compiler never emits a developer value through a raw SQL fragment. Table
and column identities come only from the already compiled Drizzle schema.
String ordering follows the PostgreSQL column collation instead of adding an
adapter-specific collation override.

## Consequences

All transports and direct TypeScript queries retain one filter meaning through
Runtime. Binary, bigint, JSONB, temporal, decimal, and scalar values use the
same codecs later consumed by writes, avoiding a second serialization path.

PostgreSQL reports invalid regex syntax at execution time. Plugin-defined field
operators still require their own PostgreSQL compiler contribution and do not
fall through to a guessed built-in operator.
