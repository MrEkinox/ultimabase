# ADR-0052: Typed transport-neutral Query AST

- Status: accepted
- Date: 2026-07-31
- Refines: ADR-0004, ADR-0005

## Decision

`@ultimabase/query` defines an immutable Query AST whose root separates the
schema, selection, where expression, ordering, and pagination. Every structural
node carries a literal `kind` discriminant and readonly state. Runtime factories
freeze created nodes and may share only immutable empty clause nodes.

The schema node retains the exact trusted `SchemaDefinition` by identity. Field
names are derived from that definition, including framework-owned fields, so
selection and ordering nodes cannot name an unknown field when constructed from
TypeScript. The initial factory narrows absent clauses instead of pretending
that a filter or pagination value already exists.

Expression nodes provide a neutral typed boundary. Concrete comparison and
logical operator unions are added separately, allowing exhaustive visitors to
specialize the expression type without coupling this foundational structure to
a database compiler.

The AST never stores transport requests, GraphQL documents, SQL text, database
expressions, callbacks, engines, or adapter state. Transports normalize their
inputs before creating query nodes. Runtime and database plugins consume the
same AST through later contracts.

## Consequences

REST, GraphQL, and direct TypeScript APIs can converge on one representation
without making database or transport concepts foundational dependencies. Exact
schema references preserve developer field inference and give later validation
and compilation stages the metadata they need without reconstructing schemas.

Builders, normalization rules, concrete operators, cursor tokens, execution,
and adapter compilation remain separate concerns. Extending those features
adds typed nodes or transformations rather than embedding their implementation
details in the root AST.
